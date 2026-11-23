const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { sendEmailNotif } = require('../config/email');
const { creditWorker, updateWorkerBadge } = require('../utils/ledger');
const { getUsdcIdrRate, idrToMicroUsdc, formatUsdc, escrowAddress, verifyUsdcPayment, reserveSignature } = require('../utils/solana');
// Fee platform 10% dari nilai transaksi (naik dari 5% per keputusan
// produk 2026-11-23). Tetap dibebankan ke CLIENT di atas harga worker
// (billed = total + fee), jadi worker menerima total_amount penuh.
// Bisa di-override lewat env PLATFORM_FEE_PERCENT.
const PLATFORM_FEE = parseInt(process.env.PLATFORM_FEE_PERCENT || 10) / 100;

// PEMBAYARAN — HANYA Solana + USDC (escrow kustodial platform).
// Semua gateway fiat (Pakasir, Duitku, Xendit) sudah DIHAPUS:
// Pakasir menutup layanan (2026-11-23) dan Yuyun tidak punya akun
// gateway fiat lain. Client mengirim USDC ke alamat escrow, lalu
// menyerahkan signature ke POST /:id/verify-payment; backend
// memverifikasi on-chain (lihat utils/solana.js). Tidak ada lagi
// webhook / hosted payment page.

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

    // KUNCI KURS — gagal tertutup bila kurs/escrow belum siap: tanpa
    // kurs yang terkunci client tidak bisa membayar dengan jumlah yang
    // pasti, jadi transaksi JANGAN dibuat.
    let rateInfo, escrow;
    try {
      rateInfo = await getUsdcIdrRate();
      escrow = escrowAddress().toBase58();
    } catch (e) {
      return res.status(503).json({ message: 'Pembayaran Solana belum siap: ' + e.message });
    }
    const dp_usdc_amount = idrToMicroUsdc(dp_amount, rateInfo.rate);
    const final_usdc_amount = idrToMicroUsdc(final_amount, rateInfo.rate);

    const trx = await pool.query(`
      INSERT INTO transactions 
        (type, listing_id, job_request_id, client_id, worker_id, total_amount, dp_amount, final_amount, platform_fee, notes,
         dp_usdc_amount, final_usdc_amount, usdc_rate_locked, rate_locked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING *
    `, [type||'listing', listing_id||null, job_request_id||null, req.user.id, worker_id, total_amount, dp_amount, final_amount, platform_fee, notes||null,
        dp_usdc_amount, final_usdc_amount, rateInfo.rate]);

    const t = trx.rows[0];
    const clientData = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [req.user.id]);
    const client = clientData.rows[0];

    res.status(201).json({
      message: 'Transaksi dibuat! Silakan lakukan pembayaran DP.',
      transaction_id: t.id,
      dp_amount,
      // Instruksi bayar DP (USDC terkunci pada kurs saat transaksi dibuat):
      dp_usdc_amount,
      dp_usdc_display: formatUsdc(dp_usdc_amount),
      rate_idr_per_usdc: rateInfo.rate,
      escrow_address: escrow
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

// GET info pembayaran (untuk client yang mau bayar DP / pelunasan):
// alamat escrow + jumlah USDC yang TERKUNCI pada kurs saat transaksi
// dibuat + kursnya. Worker hanya bisa melihat (tidak membayar).
router.get('/:id/payment-info', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE id=$1 AND (client_id=$2 OR worker_id=$2)',
      [req.params.id, req.user.id]
    );
    const t = result.rows[0];
    if (!t) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (t.status !== 'waiting_dp' && t.status !== 'waiting_final') {
      return res.json({ payment_type: null, status: t.status, message: 'Transaksi ini tidak menunggu pembayaran.' });
    }
    const isDp = t.status === 'waiting_dp';
    const amountIdr = parseInt(isDp ? t.dp_amount : t.final_amount, 10);
    const amountUsdc = parseInt(isDp ? t.dp_usdc_amount : t.final_usdc_amount, 10);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      return res.status(400).json({ message: 'Transaksi ini dibuat sebelum migrasi Solana (tidak ada jumlah USDC terkunci). Hubungi admin.' });
    }
    res.json({
      payment_type: isDp ? 'dp' : 'final',
      status: t.status,
      amount_idr: amountIdr,
      amount_usdc: amountUsdc,
      amount_usdc_display: formatUsdc(amountUsdc),
      rate_idr_per_usdc: parseFloat(t.usdc_rate_locked),
      rate_locked_at: t.rate_locked_at,
      escrow_address: escrowAddress().toBase58(),
      network: require('../utils/solana').NETWORK,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST verifikasi pembayaran USDC (client menyerahkan signature).
// 1) Verifikasi on-chain (read-only): signature ada + confirmed,
//    transfer USDC ke escrow, jumlah PERSIS yang terkunci.
// 2) Dalam SATU transaksi DB: kunci signature (tolak pemakaian ulang)
//    + ubah status dengan guard (tolak verifikasi ganda) + untuk
//    pelunasan: kredit worker (total_amount penuh, fee 10% sudah
//    dibayar client di atas total — lihat utils/ledger.js).
// Email dikirim SETELAH commit (best-effort) supaya kegagalan email
// tidak membatalkan pembayaran yang sudah terverifikasi.
router.post('/:id/verify-payment', auth, async (req, res) => {
  const { signature } = req.body;
  if (typeof signature !== 'string' || signature.length < 80 || signature.length > 90) {
    return res.status(400).json({ message: 'Signature transaksi Solana tidak valid.' });
  }
  const client = await pool.connect();
  try {
    const tRes = await client.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    const t = tRes.rows[0];
    if (!t) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (t.client_id !== req.user.id) return res.status(403).json({ message: 'Hanya client yang bisa memverifikasi pembayaran.' });

    let expected, nextStatus, sigCol;
    if (t.status === 'waiting_dp') { expected = parseInt(t.dp_usdc_amount, 10); nextStatus = 'dp_paid'; sigCol = 'dp_tx_signature'; }
    else if (t.status === 'waiting_final') { expected = parseInt(t.final_usdc_amount, 10); nextStatus = 'completed'; sigCol = 'final_tx_signature'; }
    else return res.status(400).json({ message: 'Transaksi ini tidak menunggu pembayaran (status: ' + t.status + ').' });
    if (!Number.isFinite(expected) || expected <= 0) {
      return res.status(400).json({ message: 'Transaksi ini dibuat sebelum migrasi Solana (tidak ada jumlah USDC terkunci). Hubungi admin.' });
    }

    let v;
    try {
      v = await verifyUsdcPayment({ signature, expectedMicroUsdc: expected, recipientAddress: escrowAddress().toBase58() });
    } catch (e) {
      return res.status(503).json({ message: e.message });
    }
    if (!v.ok) return res.status(400).json({ message: v.reason });

    await client.query('BEGIN');
    const reserved = await reserveSignature(client, signature, 'transaction-' + nextStatus, t.id);
    if (!reserved) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Signature ini sudah pernah dipakai untuk pembayaran lain.' });
    }
    const upd = await client.query(
      `UPDATE transactions SET status=$1, ${sigCol}=$2 ${nextStatus === 'completed' ? ", final_paid_at=NOW()" : ''} WHERE id=$3 AND status=$4 RETURNING *`,
      [nextStatus, signature, t.id, t.status]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Transaksi sudah diproses (kemungkinan verifikasi ganda).' });
    }
    if (nextStatus === 'dp_paid') {
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','💰 DP Diterima!','Klien telah membayar DP via USDC. Silakan mulai bekerja.','#transactions')
      `, [t.worker_id]);
    } else {
      await creditWorker(client, t.worker_id, parseInt(t.total_amount, 10));
      await updateWorkerBadge(client, t.worker_id);
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','🎉 Pembayaran Lunas!','Klien telah melunasi via USDC. Dana masuk ke dompetmu.','#wallet')
      `, [t.worker_id]);
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','✅ Pembayaran Selesai','Terima kasih! Proyek telah selesai.','#transactions')
      `, [t.client_id]);
    }
    await client.query('COMMIT');

    // Email best-effort setelah commit (template yang sudah ada).
    try {
      if (nextStatus === 'dp_paid') {
        sendEmailNotif(t.worker_id, 'new_transaction', {
          clientName: 'Klien', amount: formatUsdc(expected), description: t.notes || ('Proyek #' + t.id)
        }, pool);
      } else {
        sendEmailNotif(t.worker_id, 'transaction_completed', { amount: 'Rp ' + parseInt(t.total_amount, 10).toLocaleString('id') }, pool);
      }
    } catch { /* email gagal tidak membatalkan pembayaran */ }

    res.json({
      message: nextStatus === 'dp_paid' ? 'DP terverifikasi! Worker sudah bisa mulai bekerja.' : 'Pelunasan terverifikasi! Transaksi selesai.',
      status: nextStatus,
      signature
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* abaikan */ }
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
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

module.exports = router;
