const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const axios = require('axios');
const crypto = require('crypto');
const { BASE_URL } = process.env;

const DUITKU_MERCHANT = process.env.DUITKU_MERCHANT_CODE;
const DUITKU_KEY = process.env.DUITKU_API_KEY;
const DUITKU_URL = process.env.DUITKU_BASE_URL || 'https://sandbox.duitku.com/webapi/api';

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

    // Buat Duitku invoice
    let invoiceUrl = null;
    let duitkuOrderId = `BOOST-${listing_id}-${Date.now()}`;
    try {
      const timestamp = Date.now().toString();
      const signature = crypto.createHash('sha256')
        .update(DUITKU_MERCHANT + timestamp + DUITKU_KEY)
        .digest('hex');
      const inv = await axios.post('https://api-sandbox.duitku.com/api/merchant/createInvoice', {
        paymentAmount: p.amount,
        merchantOrderId: duitkuOrderId,
        productDetails: `${p.label} - "${listing.rows[0].title}"`,
        customerVaName: user.full_name,
        email: user.email,
        returnUrl: `${BASE_URL}/#dashboard`,
        callbackUrl: `${BASE_URL}/api/boost/webhook`,
        expiryPeriod: 1440
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-duitku-signature': signature,
          'x-duitku-timestamp': timestamp,
          'x-duitku-merchantcode': DUITKU_MERCHANT
        }
      });
      if (inv.data.statusCode === '00') invoiceUrl = inv.data.paymentUrl;
    } catch(e) {
      console.error('Duitku boost error:', e.message);
    }

    // Simpan order
    const order = await pool.query(`
      INSERT INTO boost_orders (listing_id, user_id, package, amount, days, xendit_invoice_id, xendit_invoice_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [listing_id, req.user.id, pkg, p.amount, p.days, duitkuOrderId, invoiceUrl]);

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
