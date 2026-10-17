const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const axios = require('axios');

const SLUG = process.env.PAKASIR_SLUG;
const API_KEY = process.env.PAKASIR_API_KEY;
const BASE = process.env.PAKASIR_BASE_URL || 'https://app.pakasir.com';

async function verifyPakasir(orderId, amount) {
  const url = `${BASE}/api/transactiondetail?project=${SLUG}&amount=${amount}&order_id=${orderId}&api_key=${API_KEY}`;
  const r = await axios.get(url);
  return r.data.transaction;
}

router.post('/create', auth, async (req, res) => {
  const { transaction_id, payment_type } = req.body;
  try {
    const trx = await pool.query(
      `SELECT t.*, u.full_name AS client_name, u.email AS client_email
       FROM transactions t JOIN users u ON u.id = t.client_id
       WHERE t.id = $1 AND t.client_id = $2`,
      [transaction_id, req.user.id]
    );
    if (!trx.rows.length) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    const t = trx.rows[0];

    let amount, prefix;
    if (payment_type === 'final') {
      if (t.status !== 'dp_paid' && t.status !== 'waiting_final')
        return res.status(400).json({ message: 'Belum bisa dilunasi. DP harus dibayar dulu.' });
      amount = t.final_amount; prefix = 'FINAL';
    } else {
      if (t.status !== 'waiting_dp')
        return res.status(400).json({ message: 'DP sudah dibayar atau status tidak valid.' });
      amount = t.dp_amount; prefix = 'DP';
    }

    const orderId = `${prefix}-${t.id}-${Date.now()}`;
    const col = payment_type === 'final' ? 'xendit_final_invoice_id' : 'xendit_dp_invoice_id';
    await pool.query(`UPDATE transactions SET ${col}=$1 WHERE id=$2`, [orderId, t.id]);

    const paymentUrl = `${BASE}/pay/${SLUG}/${amount}?order_id=${orderId}&redirect=https://akubisa.co/#transactions`;
    res.json({ payment_url: paymentUrl, order_id: orderId, amount });
  } catch (e) {
    console.error('Pakasir create error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const { amount, order_id, project, status } = req.body;
    console.log('Pakasir webhook:', JSON.stringify(req.body));
    if (project !== SLUG || status !== 'completed' || !order_id) return res.send('OK');

    let detail;
    try { detail = await verifyPakasir(order_id, amount); }
    catch (e) { console.error('Pakasir verify gagal:', e.message); return res.send('OK'); }
    if (!detail || detail.status !== 'completed') { console.error('Status bukan completed:', order_id); return res.send('OK'); }

    const trxId = order_id.split('-')[1];

    if (order_id.startsWith('DP-')) {
      const check = await pool.query('SELECT dp_amount, worker_id, client_id, status FROM transactions WHERE id=$1', [trxId]);
      const row = check.rows[0];
      if (!row || parseInt(row.dp_amount) !== parseInt(amount)) { console.error('DP mismatch:', order_id); return res.send('OK'); }
      if (row.status !== 'waiting_dp') return res.send('OK');
      await pool.query("UPDATE transactions SET status='dp_paid', dp_paid_at=NOW() WHERE id=$1", [trxId]);
      await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','💰 DP Masuk!','DP telah dibayar. Silakan mulai pengerjaan.','#transactions')`, [row.worker_id]);
      await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','✅ Pembayaran DP Berhasil','DP kamu berhasil diterima.','#transactions')`, [row.client_id]);
    } else if (order_id.startsWith('FINAL-')) {
      const check = await pool.query('SELECT final_amount, total_amount, worker_id, client_id, status FROM transactions WHERE id=$1', [trxId]);
      const row = check.rows[0];
      if (!row || parseInt(row.final_amount) !== parseInt(amount)) { console.error('FINAL mismatch:', order_id); return res.send('OK'); }
      if (row.status !== 'dp_paid' && row.status !== 'waiting_final') return res.send('OK');
      await pool.query("UPDATE transactions SET status='completed', final_paid_at=NOW() WHERE id=$1", [trxId]);
      await pool.query(`
        INSERT INTO worker_balances (worker_id, total_earned, balance)
        VALUES ($1, $2, $2)
        ON CONFLICT (worker_id) DO UPDATE SET
          total_earned = worker_balances.total_earned + $2,
          balance = worker_balances.balance + $2,
          updated_at = NOW()
      `, [row.worker_id, parseInt(row.total_amount)]);
      await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','🎉 Pembayaran Lunas!','Klien telah melunasi. Dana akan dicairkan.','#transactions')`, [row.worker_id]);
      await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'transaction','✅ Selesai','Terima kasih! Proyek selesai.','#transactions')`, [row.client_id]);
      const wc = await pool.query("SELECT COUNT(*) FROM transactions WHERE worker_id=$1 AND status='completed'", [row.worker_id]);
      const n = parseInt(wc.rows[0].count);
      const level = n >= 50 ? 'elite' : n >= 20 ? 'expert' : n >= 5 ? 'pro' : 'pemula';
      await pool.query('UPDATE users SET badge_level=$1 WHERE id=$2', [level, row.worker_id]);
    }
    res.send('OK');
  } catch (e) {
    console.error('Pakasir webhook error:', e.message);
    res.send('OK');
  }
});

router.get('/status/:orderId/:amount', auth, async (req, res) => {
  try {
    const detail = await verifyPakasir(req.params.orderId, req.params.amount);
    res.json({ status: detail?.status || 'pending', detail });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
