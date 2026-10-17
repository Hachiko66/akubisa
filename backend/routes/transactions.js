const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { sendEmailNotif } = require('../config/email');
const axios = require('axios');
const crypto = require('crypto');
const PLATFORM_FEE = parseInt(process.env.PLATFORM_FEE_PERCENT || 5) / 100;
const BASE_URL = process.env.BASE_URL || 'https://akubisa.co';
const DUITKU_MERCHANT = process.env.DUITKU_MERCHANT_CODE;
const DUITKU_KEY = process.env.DUITKU_API_KEY;
const DUITKU_URL = process.env.DUITKU_BASE_URL || 'https://sandbox.duitku.com/webapi/api';

async function createDuitkuInvoice({ orderId, amount, email, name, description, successUrl }) {
  const timestamp = Date.now().toString();
  const signature = crypto.createHash('sha256')
    .update(DUITKU_MERCHANT + timestamp + DUITKU_KEY)
    .digest('hex');

  const payload = {
    paymentAmount: amount,
    merchantOrderId: orderId,
    productDetails: description,
    customerVaName: name,
    email,
    callbackUrl: `${BASE_URL}/api/transactions/webhook/duitku`,
    returnUrl: successUrl || `${BASE_URL}/#transactions`,
    expiryPeriod: 1440,
    customerDetail: {
      firstName: name.split(' ')[0],
      lastName: name.split(' ').slice(1).join(' ') || '',
      email
    }
  };

  const res = await axios.post('https://api-sandbox.duitku.com/api/merchant/createInvoice', payload, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-duitku-signature': signature,
      'x-duitku-timestamp': timestamp,
      'x-duitku-merchantcode': DUITKU_MERCHANT
    }
  });

  if (res.data.statusCode !== '00') throw new Error(res.data.statusMessage || 'Duitku error');
  return res.data;
}

// POST buat transaksi baru
router.post('/', auth, async (req, res) => {
  const { type, listing_id, job_request_id, worker_id, total_amount, notes } = req.body;
  if (!total_amount || total_amount < 10000) return res.status(400).json({ message: 'Minimum transaksi Rp 10.000' });
  if (!worker_id) return res.status(400).json({ message: 'Worker tidak ditemukan' });
  if (worker_id === req.user.id) return res.status(400).json({ message: 'Tidak bisa bertransaksi dengan diri sendiri' });

  try {
    // Cek KYC
    const kycCheck = await pool.query('SELECT status FROM kyc_submissions WHERE user_id=$1', [req.user.id]);
    const kycStatus = kycCheck.rows[0]?.status;
    if (kycStatus !== 'approved') {
      return res.status(403).json({ message: 'Verifikasi identitas (KYC) diperlukan sebelum melakukan transaksi.', kyc_required: true });
    }
    const platform_fee = Math.ceil(total_amount * PLATFORM_FEE);
    const billed_amount = total_amount + platform_fee;
    const dp_amount = Math.ceil(billed_amount * 0.5);
    const final_amount = billed_amount - dp_amount;

    const trx = await pool.query(`
      INSERT INTO transactions 
        (type, listing_id, job_request_id, client_id, worker_id, total_amount, dp_amount, final_amount, platform_fee, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [type||'listing', listing_id||null, job_request_id||null, req.user.id, worker_id, total_amount, dp_amount, final_amount, platform_fee, notes||null]);

    const t = trx.rows[0];
    const clientData = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [req.user.id]);
    const client = clientData.rows[0];

    res.status(201).json({
      message: 'Transaksi dibuat! Silakan lakukan pembayaran DP.',
      transaction_id: t.id,
      dp_amount
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

    // Email ke client
    const workerData = await pool.query('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
    sendEmailNotif(trxData.rows[0].client_id, 'work_submitted', {
      workerName: workerData.rows[0]?.full_name || 'Pekerja',
      description: trxData.rows[0].notes || 'Proyek #' + req.params.id
    }, pool);
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

    await pool.query(
      "UPDATE transactions SET status='waiting_final', client_approved_at=NOW() WHERE id=$1",
      [trx.id]
    );

    res.json({ message: 'Disetujui! Silakan lakukan pelunasan.' });
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

// POST Duitku Webhook
router.post('/webhook/duitku', async (req, res) => {
  try {
    const { merchantCode, amount, merchantOrderId, resultCode, signature } = req.body;
    const expectedSig = crypto.createHash('md5')
      .update(merchantCode + amount + merchantOrderId + DUITKU_KEY)
      .digest('hex');
    if (signature !== expectedSig) {
      console.error('Invalid Duitku webhook signature');
      return res.status(400).send('Invalid signature');
    }
    if (resultCode !== '00') return res.send('OK');

    if (merchantOrderId.startsWith('DP-')) {
      const trxId = merchantOrderId.split('-')[1];
      await pool.query(
        "UPDATE transactions SET status='dp_paid', dp_paid_at=NOW() WHERE id=$1 AND status='waiting_dp'",
        [trxId]
      );
      const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [trxId]);
      if (t.rows[0]) {
        await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','💰 DP Masuk!','DP 50% telah dibayar. Silakan mulai pengerjaan.','#transactions')`, [t.rows[0].worker_id]);
        await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','✅ Pembayaran DP Berhasil','DP 50% kamu berhasil diterima.','#transactions')`, [t.rows[0].client_id]);
        const clientData = await pool.query('SELECT full_name FROM users WHERE id=$1', [t.rows[0].client_id]);
        sendEmailNotif(t.rows[0].worker_id, 'new_transaction', {
          clientName: clientData.rows[0]?.full_name || 'Klien',
          amount: 'Rp ' + parseInt(t.rows[0].dp_amount).toLocaleString('id'),
          description: t.rows[0].notes || 'Proyek #' + trxId
        }, pool);
      }
    } else if (merchantOrderId.startsWith('FINAL-')) {
      const trxId = merchantOrderId.split('-')[1];
      await pool.query(
        "UPDATE transactions SET status='completed', final_paid_at=NOW() WHERE id=$1 AND status='waiting_final'",
        [trxId]
      );
      const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [trxId]);
      if (t.rows[0]) {
        await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','🎉 Pembayaran Lunas!','Klien telah melunasi pembayaran. Dana akan segera dicairkan.','#transactions')`, [t.rows[0].worker_id]);
        await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','✅ Pembayaran Selesai','Terima kasih! Proyek telah selesai.','#transactions')`, [t.rows[0].client_id]);
        // Update badge worker
        const workerCount = await pool.query("SELECT COUNT(*) FROM transactions WHERE worker_id=$1 AND status='completed'", [t.rows[0].worker_id]);
        const n = parseInt(workerCount.rows[0].count);
        const level = n >= 50 ? 'elite' : n >= 20 ? 'expert' : n >= 5 ? 'pro' : 'pemula';
        await pool.query('UPDATE users SET badge_level=$1 WHERE id=$2', [level, t.rows[0].worker_id]);
      }
    }
    res.send('OK');
  } catch(e) {
    console.error('Duitku webhook error:', e.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});
module.exports = router;
