const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const Xendit = require('xendit-node');

const xenditClient = new Xendit.default({ secretKey: process.env.XENDIT_SECRET_KEY });
const invoiceClient = xenditClient.Invoice;

const PLATFORM_FEE = parseInt(process.env.PLATFORM_FEE_PERCENT || 10) / 100;
const BASE_URL = process.env.BASE_URL || 'https://akubisa.co';

async function createXenditInvoice({ externalId, amount, payerEmail, description, successUrl }) {
  return await invoiceClient.createInvoice({
    data: {
      externalId,
      amount,
      payerEmail,
      description,
      successRedirectUrl: successUrl,
      failureRedirectUrl: `${BASE_URL}/#transactions`,
      currency: 'IDR',
      invoiceDuration: 86400,
    }
  });
}

// POST buat transaksi baru
router.post('/', auth, async (req, res) => {
  const { type, listing_id, job_request_id, worker_id, total_amount, notes } = req.body;
  if (!total_amount || total_amount < 10000) return res.status(400).json({ message: 'Minimum transaksi Rp 10.000' });
  if (!worker_id) return res.status(400).json({ message: 'Worker tidak ditemukan' });
  if (worker_id === req.user.id) return res.status(400).json({ message: 'Tidak bisa bertransaksi dengan diri sendiri' });

  try {
    const dp_amount = Math.ceil(total_amount * 0.5);
    const final_amount = total_amount - dp_amount;
    const platform_fee = Math.ceil(total_amount * PLATFORM_FEE);

    const trx = await pool.query(`
      INSERT INTO transactions 
        (type, listing_id, job_request_id, client_id, worker_id, total_amount, dp_amount, final_amount, platform_fee, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [type||'listing', listing_id||null, job_request_id||null, req.user.id, worker_id, total_amount, dp_amount, final_amount, platform_fee, notes||null]);

    const t = trx.rows[0];
    const clientData = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [req.user.id]);
    const client = clientData.rows[0];

    let invoice = null;
    let invoiceUrl = null;
    try {
      invoice = await createXenditInvoice({
        externalId: `dp_${t.id}_${Date.now()}`,
        amount: dp_amount,
        payerEmail: client.email,
        description: `DP 50% - ${notes || 'Transaksi AkuBisa'} (ID: ${t.id})`,
        successUrl: `${BASE_URL}/#transactions`
      });
      invoiceUrl = invoice.invoiceUrl || invoice.invoice_url;
      await pool.query(`
        UPDATE transactions SET xendit_dp_invoice_id=$1, xendit_dp_invoice_url=$2 WHERE id=$3
      `, [invoice.id, invoiceUrl, t.id]);
    } catch(xenditErr) {
      console.error('Xendit error:', JSON.stringify(xenditErr));
    }

    res.status(201).json({
      message: 'Transaksi dibuat!',
      transaction_id: t.id,
      dp_amount,
      invoice_url: invoiceUrl
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// GET transaksi milik user
router.get('/my', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        uc.full_name as client_name, uc.avatar as client_avatar,
        uw.full_name as worker_name, uw.avatar as worker_avatar,
        l.title as listing_title,
        jr.title as job_title
      FROM transactions t
      LEFT JOIN users uc ON t.client_id = uc.id
      LEFT JOIN users uw ON t.worker_id = uw.id
      LEFT JOIN listings l ON t.listing_id = l.id
      LEFT JOIN job_requests jr ON t.job_request_id = jr.id
      WHERE t.client_id=$1 OR t.worker_id=$1
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// GET detail transaksi
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        uc.full_name as client_name, uc.avatar as client_avatar, uc.email as client_email,
        uw.full_name as worker_name, uw.avatar as worker_avatar, uw.email as worker_email,
        l.title as listing_title,
        jr.title as job_title
      FROM transactions t
      LEFT JOIN users uc ON t.client_id = uc.id
      LEFT JOIN users uw ON t.worker_id = uw.id
      LEFT JOIN listings l ON t.listing_id = l.id
      LEFT JOIN job_requests jr ON t.job_request_id = jr.id
      WHERE t.id=$1 AND (t.client_id=$2 OR t.worker_id=$2)
    `, [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    res.json(result.rows[0]);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// PATCH worker tandai selesai
router.patch('/:id/submit', auth, async (req, res) => {
  try {
    const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!t.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (t.rows[0].worker_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    if (t.rows[0].status !== 'dp_paid') return res.status(400).json({ message: 'DP belum dibayar' });

    const autoRelease = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const trxData = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    await pool.query(`
      UPDATE transactions SET status='submitted', worker_submitted_at=NOW(), auto_release_at=$1 WHERE id=$2
    `, [autoRelease, req.params.id]);

    // Notif ke client dengan action approve
    await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, link, action, metadata)
      VALUES ($1,'transaction','📦 Pekerjaan Selesai!','Pekerja telah menandai pekerjaan selesai. Klik untuk langsung lakukan pelunasan.','#transactions','approve',$2)
    `, [trxData.rows[0].client_id, JSON.stringify({trx_id: parseInt(req.params.id)})]);

    res.json({ message: 'Pekerjaan ditandai selesai! Klien akan mereview dalam 7 hari.' });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// PATCH client approve
router.patch('/:id/approve', auth, async (req, res) => {
  try {
    const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!t.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (t.rows[0].client_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    if (t.rows[0].status !== 'submitted') return res.status(400).json({ message: 'Belum ditandai selesai oleh pekerja' });

    const clientData = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    const trx = t.rows[0];

    let invoice = null;
    let invoiceUrl = null;
    try {
      invoice = await createXenditInvoice({
        externalId: `final_${trx.id}_${Date.now()}`,
        amount: trx.final_amount,
        payerEmail: clientData.rows[0].email,
        description: `Pelunasan 50% - Transaksi #${trx.id}`,
        successUrl: `${BASE_URL}/#transactions`
      });
      invoiceUrl = invoice.invoiceUrl || invoice.invoice_url;
    } catch(xenditErr) {
      console.error('Xendit error approve:', JSON.stringify(xenditErr));
    }

    await pool.query(`
      UPDATE transactions SET status='waiting_final', client_approved_at=NOW(),
        xendit_final_invoice_id=$1, xendit_final_invoice_url=$2 WHERE id=$3
    `, [invoice ? invoice.id : null, invoiceUrl, trx.id]);

    res.json({ message: 'Disetujui! Silakan lakukan pelunasan.', invoice_url: invoiceUrl });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// PATCH client dispute
router.patch('/:id/dispute', auth, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ message: 'Alasan dispute wajib diisi' });
  try {
    const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!t.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (t.rows[0].client_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    if (!['submitted','dp_paid'].includes(t.rows[0].status)) return res.status(400).json({ message: 'Status tidak valid untuk dispute' });

    const trxDisp = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    await pool.query(`
      UPDATE transactions SET status='disputed', dispute_reason=$1, dispute_at=NOW() WHERE id=$2
    `, [reason, req.params.id]);

    // Notif ke worker dan admin
    await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES ($1,'transaction','⚠️ Dispute Diajukan','Klien mengajukan dispute pada transaksi kamu. Admin akan menghubungi.','#transactions')
    `, [trxDisp.rows[0].worker_id]);

    res.json({ message: 'Dispute diterima! Admin akan menghubungi dalam 1x24 jam.' });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// POST Xendit Webhook
router.post('/webhook/xendit', async (req, res) => {
  const token = req.headers['x-callback-token'];
  if (token !== process.env.XENDIT_WEBHOOK_TOKEN && process.env.XENDIT_WEBHOOK_TOKEN) {
    return res.status(403).json({ message: 'Invalid token' });
  }
  try {
    const { external_id, status } = req.body;
    if (status !== 'PAID') return res.json({ message: 'Ignored' });

    if (external_id.startsWith('dp_')) {
      const trxId = external_id.split('_')[1];
      await pool.query(`
        UPDATE transactions SET status='dp_paid', dp_paid_at=NOW() WHERE id=$1 AND status='waiting_dp'
      `, [trxId]);
      // Notif ke worker: DP masuk, mulai kerja
      const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [trxId]);
      if (t.rows[0]) {
        await pool.query(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES ($1,'transaction','💰 DP Masuk!','DP 50% telah dibayar. Silakan mulai pengerjaan.','#transactions')
        `, [t.rows[0].worker_id]);
        await pool.query(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES ($1,'transaction','✅ Pembayaran DP Berhasil','DP 50% kamu berhasil diterima. Pekerja akan segera mulai.','#transactions')
        `, [t.rows[0].client_id]);
      }
    } else if (external_id.startsWith('final_')) {
      const trxId = external_id.split('_')[1];
      await pool.query(`
        UPDATE transactions SET status='completed', final_paid_at=NOW() WHERE id=$1 AND status='waiting_final'
      `, [trxId]);
      // Notif ke worker: pembayaran lunas
      const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [trxId]);
      if (t.rows[0]) {
        const trx = t.rows[0];
        const workerEarning = trx.total_amount - trx.platform_fee;

        // Update saldo pekerja
        await pool.query(`
          INSERT INTO worker_balances (worker_id, total_earned, balance)
          VALUES ($1, $2, $2)
          ON CONFLICT (worker_id) DO UPDATE SET
            total_earned = worker_balances.total_earned + $2,
            balance = worker_balances.balance + $2,
            updated_at = NOW()
        `, [trx.worker_id, workerEarning]);

        // Auto buat portfolio item - ambil judul listing
        let portfolioTitle = 'Pekerjaan Selesai';
        if (trx.listing_id) {
          const listingRes = await pool.query('SELECT title FROM listings WHERE id=$1', [trx.listing_id]);
          if (listingRes.rows[0]) portfolioTitle = listingRes.rows[0].title;
        }
        await pool.query(`
          INSERT INTO portfolio_items (transaction_id, worker_id, title, description, is_public)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT DO NOTHING
        `, [trx.id, trx.worker_id, portfolioTitle, trx.notes || '']);

        await pool.query(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES ($1,'transaction','🎉 Pembayaran Lunas!','Pelunasan 50% telah diterima. Saldo kamu bertambah Rp ${workerEarning.toLocaleString()}.','#transactions')
        `, [trx.worker_id]);
        await pool.query(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES ($1,'transaction','✅ Transaksi Selesai','Pembayaran lunas. Terima kasih telah menggunakan AkuBisa!','#transactions')
        `, [trx.client_id]);
      }
    }

    res.json({ message: 'OK' });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
