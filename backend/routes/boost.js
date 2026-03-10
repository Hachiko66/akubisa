const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const Xendit = require('xendit-node');
const { BASE_URL } = process.env;

const xenditClient = new Xendit.default({ secretKey: process.env.XENDIT_SECRET_KEY });
const invoiceClient = xenditClient.Invoice;

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

// POST beli boost
router.post('/buy', auth, async (req, res) => {
  const { listing_id, package: pkg } = req.body;
  if (!PACKAGES[pkg]) return res.status(400).json({ message: 'Paket tidak valid' });
  try {
    // Validasi listing milik user
    const listing = await pool.query('SELECT * FROM listings WHERE id=$1 AND user_id=$2', [listing_id, req.user.id]);
    if (!listing.rows[0]) return res.status(404).json({ message: 'Listing tidak ditemukan' });

    const p = PACKAGES[pkg];
    const userRes = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [req.user.id]);
    const user = userRes.rows[0];

    // Buat Xendit invoice
    let invoiceUrl = null;
    let xenditId = null;
    try {
      const inv = await invoiceClient.createInvoice({
        externalId: `boost_${listing_id}_${Date.now()}`,
        amount: p.amount,
        payerEmail: user.email,
        description: `${p.label} - "${listing.rows[0].title}"`,
        successRedirectURL: `${BASE_URL}/#my-listings`,
        failureRedirectURL: `${BASE_URL}/#my-listings`,
      });
      invoiceUrl = inv.invoiceUrl || inv.invoice_url;
      xenditId = inv.id;
    } catch(e) {
      console.error('Xendit boost error:', e.message);
    }

    // Simpan order
    const order = await pool.query(`
      INSERT INTO boost_orders (listing_id, user_id, package, amount, days, xendit_invoice_id, xendit_invoice_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [listing_id, req.user.id, pkg, p.amount, p.days, xenditId, invoiceUrl]);

    res.json({ message: 'Order dibuat!', invoice_url: invoiceUrl, order_id: order.rows[0].id });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// POST Webhook Xendit boost payment
router.post('/webhook', async (req, res) => {
  try {
    const { external_id, status } = req.body;
    if (status !== 'PAID' || !external_id?.startsWith('boost_')) return res.json({ ok: true });

    const listing_id = external_id.split('_')[1];

    // Update order
    const order = await pool.query(
      "UPDATE boost_orders SET status='paid', started_at=NOW(), expires_at=NOW() + (days || ' days')::interval WHERE xendit_invoice_id=$1 AND status='pending' RETURNING *",
      [req.body.id]
    );

    if (order.rows[0]) {
      // Aktifkan boost di listing
      await pool.query(`
        UPDATE listings SET is_featured=true, featured_until=$1, boost_package=$2 WHERE id=$3
      `, [order.rows[0].expires_at, order.rows[0].package, listing_id]);

      // Notif ke user
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'boost','🚀 Listing Berhasil Di-Boost!','Listing kamu sekarang tampil di posisi teratas selama ${order.rows[0].days} hari.','#my-listings')
      `, [order.rows[0].user_id]);
    }

    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ message: e.message });
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
