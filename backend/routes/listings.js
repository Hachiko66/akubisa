const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/listingController');

router.get('/', c.getAll);
router.get('/my', auth, c.myListings);
router.get('/:id', c.getOne);
router.post('/', auth, c.create);
router.put('/:id', auth, c.update);
router.delete('/:id', auth, c.delete);


// User promote listing milik sendiri
router.patch('/:id/promote', auth, async (req, res) => {
  const { days = 7 } = req.body;
  const validDays = [7, 14, 30];
  if (!validDays.includes(parseInt(days)))
    return res.status(400).json({ message: 'Durasi tidak valid' });
  try {
    // Cek ownership
    const check = await pool.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Listing tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: 'Bukan listing kamu' });

    const until = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE listings SET is_featured=true, featured_until=$1 WHERE id=$2',
      [until, req.params.id]
    );
    res.json({ message: `Penawaran berhasil dipromosikan selama ${days} hari!` });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

async function seoPage(req, res) {
  try {
    const slug = req.params.slug;
    const id = slug.split('-').pop();
    if (!id || isNaN(id)) return res.redirect('/');

    const result = await pool.query(`
      SELECT l.id, l.title, l.description, l.price, l.price_unit,
             u.full_name, c.name as category_name
      FROM listings l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN categories c ON c.id = l.category_id
      WHERE l.id = $1 AND l.is_active = true
      LIMIT 1
    `, [id]);

    if (!result.rows.length) return res.redirect('/');
    const l = result.rows[0];

    const title = `${l.title} — AkuBisa`;
    const desc = l.description.replace(/<[^>]*>/g, '').slice(0, 155);
    const image = 'https://akubisa.co/logonobg.png';
    const url = `https://akubisa.co/listing/${slug}`;

    let html = fs.readFileSync(path.join(__dirname, '../../frontend/index.html'), 'utf8');

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${desc}"`);
    html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${title}"`);
    html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${desc}"`);
    html = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`);
    html = html.replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${image}"`);
    html = html.replace('<link rel="canonical" href="https://akubisa.co/">', `<link rel="canonical" href="${url}">`);
    html = html.replace('</body>', `<script>window.__LISTING_ID__=${l.id};</script>\n</body>`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch(e) {
    console.error('SEO page error:', e.message);
    res.redirect('/');
  }
}

router.seoPage = seoPage;
module.exports = router;

// ===== DIGITAL PRODUCTS =====
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { getUsdcIdrRate, idrToMicroUsdc, formatUsdc, escrowAddress, verifyUsdcPayment, reserveSignature } = require('../utils/solana');
const { creditWorker } = require('../utils/ledger');

const digitalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/digital');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `digital_${req.user.id}_${Date.now()}${ext}`);
  }
});

const uploadDigital = multer({
  storage: digitalStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.doc','.docx','.zip','.rar','.png','.jpg','.psd','.ai','.fig','.txt','.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format file tidak didukung'));
  }
});

// Upload file digital saat posting listing
router.post('/upload-digital', auth, uploadDigital.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File tidak ditemukan' });
    res.json({
      file_url: `/uploads/digital/${req.file.filename}`,
      file_name: req.file.originalname,
      file_size: req.file.size
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Beli produk digital — PEMBAYARAN NYATA via Solana USDC.
// Dulu endpoint ini hanya INSERT tanpa bayar (simulasi) sehingga file
// bisa didownload gratis. Sekarang:
// - harga 0 / tanpa harga: langsung granted (status='paid'), seperti dulu.
// - berbayar: kurs DIKUNCI saat purchase dibuat (usdc_amount +
//   rate_idr_per_usdc disimpan di baris purchase) dan frontend HARUS
//   menampilkan alamat escrow + jumlah USDC terkunci; pembeli mengirim
//   USDC lalu menyerahkan signature ke POST /:id/verify-payment.
//   Purchase berstatus 'pending' sampai verifikasi on-chain lolos dan
//   mengubahnya jadi 'paid'. Download menolak status selain 'paid'.
// Produk digital TIDAK dikenai fee platform (keputusan produk):
// penjual menerima harga penuh sebagai saldo IDR (lihat creditWorker
// di verify-payment).
function parsePrice(raw) {
  // Harga disimpan sebagai VARCHAR (mis. "150000" atau "Rp 150.000") —
  // konvensi yang sama dipakai listingController (REGEXP_REPLACE).
  const n = parseInt(String(raw ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

router.post('/:id/purchase', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await pool.query(
      'SELECT * FROM listings WHERE id=$1 AND listing_type=$2 AND is_active=true',
      [id, 'digital']
    );
    if (!listing.rows[0]) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    const l = listing.rows[0];
    const price = parsePrice(l.price);
    if (price === null) return res.status(400).json({ message: 'Harga produk tidak valid' });

    // Produk gratis: langsung granted.
    if (price <= 0) {
      await pool.query(
        `INSERT INTO digital_purchases (buyer_id, listing_id, amount, status) VALUES ($1,$2,0,'paid')
         ON CONFLICT (buyer_id, listing_id) DO UPDATE SET status='paid', amount=0`,
        [req.user.id, id]
      );
      return res.json({ success: true, message: 'Pembelian berhasil!', free: true });
    }

    // Sudah lunas sebelumnya?
    const existing = await pool.query(
      'SELECT id, status, order_id FROM digital_purchases WHERE buyer_id=$1 AND listing_id=$2',
      [req.user.id, id]
    );
    if (existing.rows[0]?.status === 'paid') {
      return res.json({ success: true, message: 'Produk sudah dibeli sebelumnya.' });
    }

    let purchaseId, usdcAmount, rateLocked;
    const existingRow = existing.rows[0];
    if (existingRow) {
      purchaseId = existingRow.id;
      usdcAmount = parseInt(existingRow.usdc_amount, 10);
      rateLocked = parseFloat(existingRow.rate_idr_per_usdc);
    }
    if (!purchaseId) {
      const ins = await pool.query(
        `INSERT INTO digital_purchases (buyer_id, listing_id, amount, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
        [req.user.id, id, price]
      );
      purchaseId = ins.rows[0].id;
    }
    if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) {
      // Kunci kurs saat purchase dibuat (atau perbaiki baris lama yang
      // dibuat sebelum migrasi Solana). Gagal tertutup bila kurs/escrow
      // belum siap.
      let rateInfo;
      try { rateInfo = await getUsdcIdrRate(); }
      catch (e) { return res.status(503).json({ message: 'Pembayaran Solana belum siap: ' + e.message }); }
      usdcAmount = idrToMicroUsdc(price, rateInfo.rate);
      rateLocked = rateInfo.rate;
      await pool.query(
        'UPDATE digital_purchases SET usdc_amount=$1, rate_idr_per_usdc=$2 WHERE id=$3',
        [usdcAmount, rateLocked, purchaseId]
      );
    }

    res.json({
      success: true,
      message: 'Silakan kirim USDC ke alamat escrow, lalu verifikasi dengan signature transaksimu.',
      requires_payment: true,
      escrow_address: escrowAddress().toBase58(),
      amount: price,
      amount_usdc: usdcAmount,
      amount_usdc_display: formatUsdc(usdcAmount),
      rate_idr_per_usdc: rateLocked,
      purchase_id: purchaseId
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Verifikasi pembayaran produk digital (pembeli menyerahkan signature).
// Pola yang sama dengan transaksi: verifikasi on-chain dulu, lalu kunci
// signature + ubah status dalam satu transaksi DB, lalu kredit penjual.
router.post('/:id/verify-payment', auth, async (req, res) => {
  const { purchase_id, signature } = req.body;
  if (typeof signature !== 'string' || signature.length < 80 || signature.length > 90) {
    return res.status(400).json({ message: 'Signature transaksi Solana tidak valid.' });
  }
  const client = await pool.connect();
  try {
    const pRes = await client.query(
      'SELECT * FROM digital_purchases WHERE id=$1 AND buyer_id=$2',
      [purchase_id, req.user.id]
    );
    const p = pRes.rows[0];
    if (!p) return res.status(404).json({ message: 'Pembelian tidak ditemukan' });
    if (parseInt(p.listing_id, 10) !== parseInt(req.params.id, 10)) {
      return res.status(400).json({ message: 'Pembelian tidak cocok dengan produk ini.' });
    }
    if (p.status === 'paid') return res.json({ success: true, message: 'Produk sudah dibeli sebelumnya.' });
    if (p.status !== 'pending') return res.status(400).json({ message: 'Status pembelian tidak valid.' });
    const expected = parseInt(p.usdc_amount, 10);
    if (!Number.isFinite(expected) || expected <= 0) {
      return res.status(400).json({ message: 'Pembelian ini dibuat sebelum migrasi Solana (tidak ada jumlah USDC terkunci). Hubungi admin.' });
    }

    let v;
    try {
      v = await verifyUsdcPayment({ signature, expectedMicroUsdc: expected, recipientAddress: escrowAddress().toBase58() });
    } catch (e) {
      return res.status(503).json({ message: e.message });
    }
    if (!v.ok) return res.status(400).json({ message: v.reason });

    const lRes = await client.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    const sellerId = lRes.rows[0]?.user_id;

    await client.query('BEGIN');
    const reserved = await reserveSignature(client, signature, 'digital', p.id);
    if (!reserved) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Signature ini sudah pernah dipakai untuk pembayaran lain.' });
    }
    const upd = await client.query(
      `UPDATE digital_purchases SET status='paid', paid_at=NOW(), tx_signature=$1 WHERE id=$2 AND status='pending' RETURNING *`,
      [signature, p.id]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Pembelian sudah diproses.' });
    }
    if (sellerId && sellerId !== req.user.id) {
      await creditWorker(client, sellerId, parseInt(p.amount, 10));
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'wallet','💰 Produk Digital Terjual!','Produk digitalmu terjual. Dana masuk ke dompetmu.','#wallet')
      `, [sellerId]);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Pembayaran terverifikasi! File bisa didownload.', signature });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* abaikan */ }
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
});

// Download file digital (harus sudah purchase LUNAS)
router.get('/:id/download', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await pool.query('SELECT * FROM listings WHERE id=$1', [id]);
    const l = listing.rows[0];
    if (!l) return res.status(404).json({ message: 'Tidak ditemukan' });

    // Cek apakah sudah beli LUNAS atau owner sendiri. Purchase 'pending'
    // (belum bayar) TIDAK boleh download — dulu cek ini tidak melihat
    // status, jadi purchase simulasi langsung membuka download.
    const isPurchased = await pool.query(
      "SELECT id FROM digital_purchases WHERE buyer_id=$1 AND listing_id=$2 AND status='paid'",
      [req.user.id, id]
    );
    const isOwner = l.user_id === req.user.id;
    
    if (!isPurchased.rows[0] && !isOwner) {
      return res.status(403).json({ message: 'Beli dulu untuk download' });
    }

    // Update download count
    await pool.query('UPDATE listings SET download_count = download_count + 1 WHERE id=$1', [id]);

    const filePath = path.join(__dirname, '..', l.file_url);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File tidak ada' });
    
    res.download(filePath, l.file_name || 'download');
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Cek apakah sudah purchase LUNAS (pending tidak dihitung sudah beli)
router.get('/:id/purchase-status', auth, async (req, res) => {
  try {
    const p = await pool.query(
      "SELECT id FROM digital_purchases WHERE buyer_id=$1 AND listing_id=$2 AND status='paid'",
      [req.user.id, req.params.id]
    );
    const pending = await pool.query(
      "SELECT id, usdc_amount, rate_idr_per_usdc FROM digital_purchases WHERE buyer_id=$1 AND listing_id=$2 AND status='pending'",
      [req.user.id, req.params.id]
    );
    const l = await pool.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    const pend = pending.rows[0];
    res.json({
      purchased: !!p.rows[0] || l.rows[0]?.user_id === req.user.id,
      pending: !!pend,
      // Info bayar untuk purchase yang masih pending (kurs terkunci):
      pending_purchase_id: pend?.id || null,
      pending_amount_usdc: pend ? parseInt(pend.usdc_amount, 10) : null,
      pending_amount_usdc_display: pend ? formatUsdc(pend.usdc_amount) : null,
      pending_rate_idr_per_usdc: pend ? parseFloat(pend.rate_idr_per_usdc) : null,
      escrow_address: pend ? escrowAddress().toBase58() : null
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ===== DELIVERY URL - hanya buyer yang sudah complete transaksi =====
router.get('/:id/delivery', auth, async (req, res) => {
  try {
    const listing = await pool.query('SELECT delivery_url, file_url FROM listings WHERE id=$1', [req.params.id]);
    if (!listing.rows.length) return res.status(404).json({ message: 'Listing tidak ditemukan' });

    // Cek apakah user sudah complete transaksi untuk listing ini
    const trx = await pool.query(
      `SELECT id FROM transactions WHERE listing_id=$1 AND client_id=$2 AND status='completed'`,
      [req.params.id, req.user.id]
    );
    if (!trx.rows.length) return res.status(403).json({ message: 'Akses ditolak. Selesaikan transaksi terlebih dahulu.' });

    const url = listing.rows[0].delivery_url || listing.rows[0].file_url;
    if (!url) return res.status(404).json({ message: 'File tidak tersedia' });

    res.json({ url });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== SEO - Listing page dengan meta tags dinamis =====
router.get('/page/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    // Extract id dari slug (format: judul-listing-123)
    const id = slug.split('-').pop();
    if (!id || isNaN(id)) return res.redirect('/');

    const result = await pool.query(`
      SELECT l.id, l.title, l.description, l.price, l.price_unit, l.city,
             u.full_name, c.name as category_name, li.image_url
      FROM listings l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN categories c ON c.id = l.category_id
      LEFT JOIN listing_images li ON li.listing_id = l.id AND li.is_primary = true
      WHERE l.id = $1 AND l.is_active = true
    `, [id]);

    if (!result.rows.length) return res.redirect('/');
    const l = result.rows[0];

    const title = `${l.title} — AkuBisa`;
    const desc = l.description.replace(/<[^>]*>/g, '').slice(0, 155);
    const image = l.image_url || 'https://akubisa.co/logo2.png';
    const url = `https://akubisa.co/listing/${slug}`;

    const fs = require('fs');
const pool = require('../config/db');
    let html = fs.readFileSync('/var/www/akubisa/frontend/index.html', 'utf8');

    // Inject meta tags dinamis
    html = html.replace(
      '<title>AkuBisa — Platform Freelance Indonesia</title>',
      `<title>${title}</title>`
    );
    html = html.replace(
      '<meta name="description" content="Platform freelance Indonesia',
      `<meta name="description" content="${desc.substring(0, 155)}" data-original="`
    );
    html = html.replace('<meta property="og:title" content="AkuBisa">', `<meta property="og:title" content="${title}">`);
    html = html.replace(/(<meta property="og:description" content=")[^"]*"/, `$1${desc}"`);
    html = html.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`);
    html = html.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${image}"`);

    // Auto-open listing modal via script
    html = html.replace('</body>', `<script>window.__LISTING_ID__ = ${l.id};</script>\n</body>`);

    res.send(html);
  } catch(e) {
    console.error('Listing page error:', e);
    res.redirect('/');
  }
});
