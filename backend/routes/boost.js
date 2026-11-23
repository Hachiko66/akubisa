const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { getUsdcIdrRate, idrToMicroUsdc, formatUsdc, escrowAddress, verifyUsdcPayment, reserveSignature } = require('../utils/solana');
const { rateLockExpiresAt, isRateLockExpired } = require('../utils/revenue');

const PACKAGES = {
  '3day':  { days: 3,   amount: 15000,  label: 'Boost 3 Hari' },
  '7day':  { days: 7,   amount: 25000,  label: 'Boost 7 Hari' },
  '30day': { days: 30,  amount: 75000,  label: 'Boost 30 Hari' },
  '1year': { days: 365, amount: 300000, label: 'Boost 1 Tahun' },
};

// GET paket boost
router.get('/packages', (req, res) => {
  res.json(PACKAGES);
});

// POST beli boost — dibayar via Solana USDC (satu-satunya rel bayar).
// DULU: invoice dibuat ke Duitku (sandbox) tapi webhook di file ini
// mengharapkan format Xendit — dua format itu TIDAK PERNAH cocok, jadi
// boost yang sudah dibayar TIDAK PERNAH aktif. Lalu sempat dipindah ke
// Pakasir; Pakasir kini tutup dan semua gateway fiat dihapus.
// Sekarang: kurs DIKUNCI saat order dibuat (usdc_amount +
// rate_idr_per_usdc disimpan di boost_orders); pembeli mengirim USDC
// ke escrow lalu menyerahkan signature ke POST /verify-payment.
// Kolom xendit_invoice_id / xendit_invoice_url TIDAK lagi ditulis
// (peninggalan gateway Xendit; dibiarkan di DB live sebagai kolom
// mati — jangan dipakai untuk apa pun).
router.post('/buy', auth, async (req, res) => {
  const { listing_id, package: pkg } = req.body;
  if (!PACKAGES[pkg]) return res.status(400).json({ message: 'Paket tidak valid' });
  try {
    // Validasi listing milik user
    const listing = await pool.query('SELECT * FROM listings WHERE id=$1 AND user_id=$2', [listing_id, req.user.id]);
    if (!listing.rows[0]) return res.status(404).json({ message: 'Listing tidak ditemukan' });

    const p = PACKAGES[pkg];

    // Kunci kurs saat order dibuat. Gagal tertutup bila kurs/escrow
    // belum siap.
    let rateInfo;
    try { rateInfo = await getUsdcIdrRate(); }
    catch (e) { return res.status(503).json({ message: 'Pembayaran Solana belum siap: ' + e.message }); }
    const usdcAmount = idrToMicroUsdc(p.amount, rateInfo.rate);

    // Simpan order (status 'pending' sampai verifikasi on-chain lolos).
    // rate_locked_at dicatat supaya masa berlaku kunci kurs 24 jam
    // bisa diperiksa di verify-payment (lihat utils/revenue.js).
    const order = await pool.query(`
      INSERT INTO boost_orders (listing_id, user_id, package, amount, days, usdc_amount, rate_idr_per_usdc, rate_locked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *
    `, [listing_id, req.user.id, pkg, p.amount, p.days, usdcAmount, rateInfo.rate]);

    res.json({
      message: 'Order dibuat! Silakan kirim USDC ke alamat escrow, lalu verifikasi dengan signature transaksimu.',
      order_id: order.rows[0].id,
      escrow_address: escrowAddress().toBase58(),
      amount: p.amount,
      amount_usdc: usdcAmount,
      amount_usdc_display: formatUsdc(usdcAmount),
      rate_idr_per_usdc: rateInfo.rate,
      rate_locked_at: order.rows[0].rate_locked_at,
      rate_locked_until: rateLockExpiresAt(order.rows[0].rate_locked_at)
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// POST verifikasi pembayaran boost (pembeli menyerahkan signature).
// Setelah verifikasi lolos: order jadi 'paid' + masa aktif dihitung,
// DAN listing benar-benar di-featured (is_featured + featured_until)
// — dulu aktivasi hanya menulis boost_orders sehingga boost berbayar
// tidak pernah mengubah urutan listing (is_featured hanya di-set
// endpoint promote gratis / admin).
router.post('/verify-payment', auth, async (req, res) => {
  const { order_id, signature } = req.body;
  if (typeof signature !== 'string' || signature.length < 80 || signature.length > 90) {
    return res.status(400).json({ message: 'Signature transaksi Solana tidak valid.' });
  }
  const client = await pool.connect();
  try {
    const oRes = await client.query(
      'SELECT * FROM boost_orders WHERE id=$1 AND user_id=$2',
      [order_id, req.user.id]
    );
    const o = oRes.rows[0];
    if (!o) return res.status(404).json({ message: 'Order tidak ditemukan' });
    if (o.status === 'paid') return res.json({ message: 'Boost sudah aktif.' });
    if (o.status !== 'pending') return res.status(400).json({ message: 'Status order tidak valid.' });
    const expected = parseInt(o.usdc_amount, 10);
    if (!Number.isFinite(expected) || expected <= 0) {
      return res.status(400).json({ message: 'Order ini dibuat sebelum migrasi Solana (tidak ada jumlah USDC terkunci). Hubungi admin.' });
    }
    // KUNCI KURS 24 JAM: tolak sebelum verifikasi on-chain. Buat
    // order baru untuk kurs terbaru (POST /buy selalu mengunci kurs
    // baru saat order dibuat).
    if (isRateLockExpired(o.rate_locked_at || o.created_at)) {
      return res.status(400).json({ message: 'Kurs sudah berubah, silakan tutup dan buka lagi pembayaran untuk kurs terbaru.' });
    }

    let v;
    try {
      v = await verifyUsdcPayment({ signature, expectedMicroUsdc: expected, recipientAddress: escrowAddress().toBase58() });
    } catch (e) {
      return res.status(503).json({ message: e.message });
    }
    if (!v.ok) return res.status(400).json({ message: v.reason });

    await client.query('BEGIN');
    const reserved = await reserveSignature(client, signature, 'boost', o.id);
    if (!reserved) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Signature ini sudah pernah dipakai untuk pembayaran lain.' });
    }
    const upd = await client.query(
      `UPDATE boost_orders SET status='paid', started_at=NOW(),
         expires_at=NOW() + (days || ' days')::interval, tx_signature=$1
       WHERE id=$2 AND status='pending' RETURNING *`,
      [signature, o.id]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Order sudah diproses.' });
    }
    const activated = upd.rows[0];
    await client.query(
      'UPDATE listings SET is_featured=true, featured_until=$1 WHERE id=$2',
      [activated.expires_at, o.listing_id]
    );
    await client.query('COMMIT');
    res.json({ message: `Boost aktif selama ${o.days} hari!`, signature, expires_at: activated.expires_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* abaikan */ }
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
});

// GET status boost listing saya
router.get('/my-boosts', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bo.*, l.title, l.id as lid
      FROM boost_orders bo
      JOIN listings l ON l.id = bo.listing_id
      WHERE bo.user_id=$1
      ORDER BY bo.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
