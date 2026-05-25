const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const axios = require('axios');

const MERCHANT_CODE = process.env.DUITKU_MERCHANT_CODE;
const API_KEY = process.env.DUITKU_API_KEY;
const BASE_URL = process.env.DUITKU_BASE_URL;

function createSignature(merchantCode, amount, merchantOrderId, apiKey) {
  return crypto.createHash('md5')
    .update(merchantCode + amount + merchantOrderId + apiKey)
    .digest('hex');
}

// Buat payment request
router.post('/create', auth, async (req, res) => {
  const { transaction_id } = req.body;
  try {
    const trx = await pool.query(
      `SELECT t.*, u.full_name as client_name, u.email as client_email,
              w.full_name as worker_name
       FROM transactions t
       JOIN users u ON u.id = t.client_id
       JOIN users w ON w.id = t.worker_id
       WHERE t.id = $1 AND t.client_id = $2`,
      [transaction_id, req.user.id]
    );

    if (!trx.rows.length) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    const t = trx.rows[0];

    const merchantOrderId = `AKUBISA-${t.id}-${Date.now()}`;
    const amount = t.dp_amount;
    const signature = createSignature(MERCHANT_CODE, amount, merchantOrderId, API_KEY);

    const payload = {
      merchantCode: MERCHANT_CODE,
      paymentAmount: amount,
      paymentMethod: 'VC',
      merchantOrderId,
      productDetails: `DP Transaksi #${t.id} - ${t.notes?.slice(0,50) || 'Layanan AkuBisa'}`,
      customerVaName: t.client_name,
      email: t.client_email,
      phoneNumber: '',
      returnUrl: `https://akubisa.co/#transactions`,
      callbackUrl: `https://akubisa.co/api/duitku/callback`,
      signature,
      merchantUserInfo: req.user.id.toString(),
      customerDetail: {
        firstName: t.client_name.split(' ')[0],
        lastName: t.client_name.split(' ').slice(1).join(' ') || '',
        email: t.client_email,
      },
      expiryPeriod: 60
    };

    const response = await axios.post(`${BASE_URL}/merchant/createinvoice`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;
    if (data.statusCode !== '00') {
      return res.status(400).json({ message: data.statusMessage || 'Gagal membuat invoice' });
    }

    // Simpan reference ke transaksi
    await pool.query(
      'UPDATE transactions SET duitku_reference=$1, duitku_order_id=$2 WHERE id=$3',
      [data.reference, merchantOrderId, t.id]
    );

    res.json({
      payment_url: data.paymentUrl,
      reference: data.reference,
      amount: data.amount
    });

  } catch(e) {
    console.error('Duitku error:', e.response?.data || e.message);
    res.status(500).json({ message: e.response?.data?.Message || e.message });
  }
});

// Callback dari Duitku
router.post('/callback', async (req, res) => {
  try {
    const { merchantCode, amount, merchantOrderId, productDetail, additionalParam, paymentCode, resultCode, merchantUserId, reference, signature } = req.body;

    // Verifikasi signature
    const expectedSig = crypto.createHash('md5')
      .update(merchantCode + amount + merchantOrderId + API_KEY)
      .digest('hex');

    if (signature !== expectedSig) {
      console.error('Invalid Duitku signature');
      return res.status(400).send('Invalid signature');
    }

    if (resultCode === '00') {
      // Payment berhasil - update transaksi
      const trxId = merchantOrderId.split('-')[1];
      await pool.query(
        "UPDATE transactions SET status='dp_paid', dp_paid_at=NOW() WHERE id=$1 AND status='waiting_dp'",
        [trxId]
      );
      console.log(`Duitku payment success: ${merchantOrderId}`);
    }

    res.send('OK');
  } catch(e) {
    console.error('Duitku callback error:', e.message);
    res.status(500).send('Error');
  }
});

// Check payment status
router.get('/status/:orderId', auth, async (req, res) => {
  try {
    const signature = crypto.createHash('md5')
      .update(MERCHANT_CODE + req.params.orderId + API_KEY)
      .digest('hex');

    const response = await axios.post(`${BASE_URL}/merchant/transactionStatus`, {
      merchantCode: MERCHANT_CODE,
      merchantOrderId: req.params.orderId,
      signature
    });

    res.json(response.data);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
