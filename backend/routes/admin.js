const router = require('express').Router();
const admin = require('../middleware/admin');
const pool = require('../config/db');
const { creditWorker, creditClient, updateWorkerBadge } = require('../utils/ledger');
const { getUsdcIdrRate, idrToMicroUsdc, formatUsdc, isValidSolanaAddress, verifyUsdcPayment, sendUsdc, reserveSignature } = require('../utils/solana');

// ===== DASHBOARD STATS =====
router.get('/stats', admin, async (req, res) => {
  try {
    const [users, listings, reports, messages, reviews] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN created_at > NOW()-INTERVAL\'7 days\' THEN 1 END) as new_week, COUNT(CASE WHEN role=\'worker\' THEN 1 END) as workers, COUNT(CASE WHEN role=\'client\' THEN 1 END) as clients FROM users WHERE role != \'admin\''),
      pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN is_active=true THEN 1 END) as active, COUNT(CASE WHEN created_at > NOW()-INTERVAL\'7 days\' THEN 1 END) as new_week, COUNT(CASE WHEN is_featured=true THEN 1 END) as featured FROM listings'),
      pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN status=\'pending\' THEN 1 END) as pending FROM reports'),
      pool.query('SELECT COUNT(*) as total FROM messages'),
      pool.query('SELECT COUNT(*) as total, ROUND(AVG(rating),1) as avg FROM reviews'),
    ]);
    res.json({
      users: users.rows[0],
      listings: listings.rows[0],
      reports: reports.rows[0],
      messages: messages.rows[0],
      reviews: reviews.rows[0],
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Growth data (7 hari terakhir)
router.get('/growth', admin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as users
      FROM users WHERE created_at > NOW()-INTERVAL'7 days'
      GROUP BY DATE(created_at) ORDER BY date
    `);
    const listings = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM listings WHERE created_at > NOW()-INTERVAL'7 days'
      GROUP BY DATE(created_at) ORDER BY date
    `);
    res.json({ users: result.rows, listings: listings.rows });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== USER MANAGEMENT =====
router.get('/users', admin, async (req, res) => {
  const { search, role, page=1, limit=20 } = req.query;
  const offset = (page-1)*limit;
  try {
    let where = "WHERE u.role != 'admin'";
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`; }
    if (role)   { params.push(role); where += ` AND u.role = $${params.length}`; }
    params.push(limit, offset);
    const result = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.role, u.city, u.is_verified,
             u.email_verified, u.created_at,
             COUNT(DISTINCT l.id) as listing_count,
             COUNT(DISTINCT r.id) as review_count,
             ROUND(AVG(r.rating),1) as avg_rating
      FROM users u
      LEFT JOIN listings l ON l.user_id = u.id
      LEFT JOIN reviews r ON r.reviewed_id = u.id
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    const count = await pool.query(`SELECT COUNT(*) FROM users u ${where}`, params.slice(0,-2));
    res.json({ users: result.rows, total: parseInt(count.rows[0].count) });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/users/:id/verify', admin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_verified=true, email_verified=true WHERE id=$1', [req.params.id]);
    res.json({ message: 'User diverifikasi!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/users/:id/role', admin, async (req, res) => {
  const { role } = req.body;
  if (!['worker','client','admin'].includes(role)) return res.status(400).json({ message: 'Role tidak valid' });
  try {
    // Jangan izinkan ubah role admin
    const checkAdmin = await pool.query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (checkAdmin.rows[0]?.role === 'admin') return res.status(403).json({ message: 'Tidak bisa ubah role admin' });
    await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
    res.json({ message: `Role diubah ke ${role}` });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.delete('/users/:id', admin, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role!=\'admin\'', [req.params.id]);
    res.json({ message: 'User dihapus!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== LISTING MANAGEMENT =====
router.get('/listings', admin, async (req, res) => {
  const { search, category, page=1, limit=20 } = req.query;
  const offset = (page-1)*limit;
  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (search)   { params.push(`%${search}%`); where += ` AND l.title ILIKE $${params.length}`; }
    // Filter kategori: slug induk ikut menampilkan listing semua
    // subkategorinya (diselesaikan ke daftar id dulu).
    if (category) {
      const cats = await pool.query(
        'SELECT id FROM categories WHERE slug = $1 OR parent_slug = $1', [category]);
      const ids = cats.rows.map(r => r.id);
      if (ids.length) { params.push(ids); where += ` AND l.category_id = ANY($${params.length})`; }
      else where += ' AND FALSE';
    }
    params.push(limit, offset);
    const result = await pool.query(`
      SELECT l.*, u.full_name, u.email,
             c.name as category_name, c.icon as category_icon
      FROM listings l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN categories c ON l.category_id = c.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    const count = await pool.query(`SELECT COUNT(*) FROM listings l LEFT JOIN categories c ON l.category_id=c.id ${where}`, params.slice(0,-2));
    res.json({ listings: result.rows, total: parseInt(count.rows[0].count) });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/listings/:id/toggle', admin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE listings SET is_active=NOT is_active WHERE id=$1 RETURNING is_active', [req.params.id]
    );
    res.json({ message: result.rows[0].is_active ? 'Listing diaktifkan' : 'Listing dinonaktifkan', is_active: result.rows[0].is_active });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/listings/:id/feature', admin, async (req, res) => {
  const { days=7 } = req.body;
  try {
    const until = new Date(Date.now() + days*24*60*60*1000);
    await pool.query('UPDATE listings SET is_featured=true, featured_until=$1 WHERE id=$2', [until, req.params.id]);
    res.json({ message: `Listing difeatured selama ${days} hari!` });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.delete('/listings/:id', admin, async (req, res) => {
  try {
    await pool.query('DELETE FROM listings WHERE id=$1', [req.params.id]);
    res.json({ message: 'Listing dihapus!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== REPORTS MANAGEMENT =====
router.get('/reports', admin, async (req, res) => {
  const { status='pending' } = req.query;
  try {
    const result = await pool.query(`
      SELECT r.*,
        reporter.full_name as reporter_name,
        reporter.email as reporter_email,
        ru.full_name as reported_user_name,
        l.title as reported_listing_title
      FROM reports r
      JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users ru ON r.reported_user_id = ru.id
      LEFT JOIN listings l ON r.reported_listing_id = l.id
      WHERE r.status = $1
      ORDER BY r.created_at DESC
    `, [status]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/reports/:id/resolve', admin, async (req, res) => {
  const { action } = req.body; // 'dismiss' | 'warn' | 'remove'
  try {
    await pool.query(
      'UPDATE reports SET status=$1, resolved_at=NOW() WHERE id=$2',
      [action === 'dismiss' ? 'dismissed' : 'resolved', req.params.id]
    );
    res.json({ message: 'Laporan diproses!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;

// ===== WITHDRAW MANAGEMENT =====
router.get('/withdrawals', admin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT wr.*, u.full_name, u.email, u.avatar
      FROM withdraw_requests wr
      LEFT JOIN users u ON wr.worker_id = u.id
      ORDER BY wr.created_at DESC
    `);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/withdrawals/:id/approve', admin, async (req, res) => {
  const { admin_note } = req.body;
  try {
    const wr = await pool.query('SELECT * FROM withdraw_requests WHERE id=$1', [req.params.id]);
    if (!wr.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (wr.rows[0].status !== 'pending') return res.status(400).json({ message: 'Sudah diproses' });
    const w = wr.rows[0];
    if (!w.solana_address || !isValidSolanaAddress(w.solana_address)) {
      return res.status(400).json({ message: 'Request ini tidak punya alamat payout Solana yang valid.' });
    }

    // Kunci kurs SAAT INI (momen transfer) lalu kirim USDC dari escrow
    // ke alamat payout snapshot request. Bila pengiriman GAGAL (saldo
    // escrow kurang / RPC down / keypair belum dikonfigurasi), request
    // TETAP 'pending' — JANGAN tandai approved, supaya admin bisa
    // mencoba lagi dan saldo worker tidak hilang.
    let rateInfo, usdcAmount, sig;
    try {
      rateInfo = await getUsdcIdrRate();
      usdcAmount = idrToMicroUsdc(w.amount, rateInfo.rate);
      sig = await sendUsdc({ toAddress: w.solana_address, microUsdc: usdcAmount });
    } catch (e) {
      console.error('[withdraw] kirim USDC gagal:', e.message);
      return res.status(503).json({ message: 'Gagal mengirim USDC: ' + e.message + ' Request tetap pending.' });
    }

    await pool.query(`
      UPDATE withdraw_requests SET status='approved', admin_note=$1, processed_at=NOW(),
        usdc_amount=$2, rate_idr_per_usdc=$3, tx_signature=$4, paid_at=NOW() WHERE id=$5
    `, [admin_note||null, usdcAmount, rateInfo.rate, sig, req.params.id]);

    await pool.query(`
      UPDATE worker_balances SET total_withdrawn=total_withdrawn+$1 WHERE worker_id=$2
    `, [w.amount, w.worker_id]);

    await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES ($1,'wallet','✅ Withdraw Disetujui!','Withdraw Rp ${parseInt(w.amount).toLocaleString()} (${formatUsdc(usdcAmount)}) telah dikirim ke alamat Solanamu.','#wallet')
    `, [w.worker_id]);

    res.json({ message: 'Withdraw disetujui dan USDC terkirim!', tx_signature: sig, usdc_amount: usdcAmount });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST catat tx signature manual (fallback bila admin mengirim USDC
// manual dari wallet escrow, mis. RPC backend down saat approve).
// Signature TETAP diverifikasi on-chain: harus transfer USDC ke alamat
// payout snapshot request, jumlahnya dalam toleransi ±2% dari yang
// seharusnya dikirim pada kurs saat ini (mengakomodasi pergeseran kurs
// antara admin mengirim dan mencatat). Signature dikunci supaya tidak
// bisa dipakai dua kali.
router.post('/withdrawals/:id/record-tx', admin, async (req, res) => {
  const { tx_signature } = req.body;
  if (typeof tx_signature !== 'string' || tx_signature.length < 80 || tx_signature.length > 90) {
    return res.status(400).json({ message: 'Signature transaksi Solana tidak valid.' });
  }
  const client = await pool.connect();
  try {
    const wr = await client.query('SELECT * FROM withdraw_requests WHERE id=$1', [req.params.id]);
    if (!wr.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (wr.rows[0].status !== 'pending') return res.status(400).json({ message: 'Sudah diproses' });
    const w = wr.rows[0];
    if (!w.solana_address || !isValidSolanaAddress(w.solana_address)) {
      return res.status(400).json({ message: 'Request ini tidak punya alamat payout Solana yang valid.' });
    }

    let rateInfo;
    try { rateInfo = await getUsdcIdrRate(); }
    catch (e) { return res.status(503).json({ message: 'Kurs tidak tersedia: ' + e.message }); }
    const expected = idrToMicroUsdc(w.amount, rateInfo.rate);
    const tolerance = Math.max(1000, Math.ceil(expected * 0.02)); // min 0,001 USDC

    let v;
    try {
      v = await verifyUsdcPayment({ signature: tx_signature, expectedMicroUsdc: expected, recipientAddress: w.solana_address, toleranceMicroUsdc: tolerance });
    } catch (e) {
      return res.status(503).json({ message: e.message });
    }
    if (!v.ok) return res.status(400).json({ message: v.reason });

    await client.query('BEGIN');
    const reserved = await reserveSignature(client, tx_signature, 'withdraw-manual', w.id);
    if (!reserved) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Signature ini sudah pernah dipakai.' });
    }
    const upd = await client.query(
      `UPDATE withdraw_requests SET status='approved', processed_at=NOW(),
         usdc_amount=$1, rate_idr_per_usdc=$2, tx_signature=$3, paid_at=NOW()
       WHERE id=$4 AND status='pending' RETURNING *`,
      [v.amountMicroUsdc, rateInfo.rate, tx_signature, w.id]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Request sudah diproses.' });
    }
    await client.query(
      'UPDATE worker_balances SET total_withdrawn=total_withdrawn+$1 WHERE worker_id=$2',
      [w.amount, w.worker_id]
    );
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES ($1,'wallet','✅ Withdraw Disetujui!','Withdraw Rp ${parseInt(w.amount).toLocaleString()} (${formatUsdc(v.amountMicroUsdc)}) telah dikirim ke alamat Solanamu.','#wallet')
    `, [w.worker_id]);
    await client.query('COMMIT');

    res.json({ message: 'Tx manual tercatat dan terverifikasi on-chain.', tx_signature, usdc_amount: v.amountMicroUsdc });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* abaikan */ }
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
});

router.patch('/withdrawals/:id/reject', admin, async (req, res) => {
  const { admin_note } = req.body;
  try {
    const wr = await pool.query('SELECT * FROM withdraw_requests WHERE id=$1', [req.params.id]);
    if (!wr.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (wr.rows[0].status !== 'pending') return res.status(400).json({ message: 'Sudah diproses' });

    await pool.query(`
      UPDATE withdraw_requests SET status='rejected', admin_note=$1, processed_at=NOW() WHERE id=$2
    `, [admin_note||null, req.params.id]);

    // Kembalikan saldo
    await pool.query(`
      UPDATE worker_balances SET balance=balance+$1 WHERE worker_id=$2
    `, [wr.rows[0].amount, wr.rows[0].worker_id]);

    await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES ($1,'wallet','❌ Withdraw Ditolak','Withdraw kamu ditolak. Saldo dikembalikan. Alasan: ${admin_note||'Tidak ada keterangan'}','#wallet')
    `, [wr.rows[0].worker_id]);

    res.json({ message: 'Withdraw ditolak, saldo dikembalikan.' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== DISPUTE MANAGEMENT =====
router.get('/disputes', admin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        uc.full_name as client_name, uc.email as client_email,
        uw.full_name as worker_name, uw.email as worker_email
      FROM transactions t
      LEFT JOIN users uc ON t.client_id = uc.id
      LEFT JOIN users uw ON t.worker_id = uw.id
      WHERE t.status = 'disputed'
      ORDER BY t.dispute_at DESC
    `);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/disputes/:id/resolve', admin, async (req, res) => {
  const { decision, admin_note } = req.body;
  // decision: 'refund' | 'release'
  if (!decision) return res.status(400).json({ message: 'Keputusan wajib diisi' });
  if (!['refund', 'release'].includes(decision)) return res.status(400).json({ message: 'Keputusan tidak valid' });
  try {
    const t = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!t.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (t.rows[0].status !== 'disputed') return res.status(400).json({ message: 'Dispute sudah diproses' });
    const trx = t.rows[0];

    if (decision === 'refund') {
      // REFUND NYATA — dulu hanya ganti status + notifikasi, uangnya
      // tidak pernah bergerak. Tidak ada lagi gateway fiat yang bisa
      // me-refund otomatis (Pakasir tutup; Duitku/Xendit dihapus), jadi
      // refund dicatat sebagai kredit klien sebesar DP yang sudah
      // dibayar (USDC yang sudah masuk escrow tetap di escrow sampai
      // admin mencairkan kredit ini). Admin wajib menindaklanjuti
      // pencairan kredit ini secara manual — bila client minta uangnya
      // kembali dalam USDC, admin mengirim dari escrow sebesar
      // kredit/kurs saat itu dan mencatatnya — sampai pemakaian kredit
      // di checkout tersedia (lihat client_credits).
      // Guard status='disputed' membuat putusan ini idempotent: klik
      // dua kali tidak membuat dua kredit.
      const updated = await pool.query(
        "UPDATE transactions SET status='refunded', refunded_at=NOW() WHERE id=$1 AND status='disputed' RETURNING *",
        [trx.id]
      );
      if (!updated.rows.length) return res.status(400).json({ message: 'Dispute sudah diproses' });
      const refundAmount = parseInt(trx.dp_amount, 10) || 0; // DP yang sudah dibayar client
      if (refundAmount > 0) {
        await creditClient(pool, {
          userId: trx.client_id,
          amount: refundAmount,
          transactionId: trx.id,
          reason: 'refund_dispute',
        });
      }
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','↩️ Dispute Selesai - Refund','Admin memutuskan refund untuk transaksi #${trx.id}. Dana DP Rp ${refundAmount.toLocaleString('id')} dicatat sebagai kredit akunmu dan akan dikembalikan admin.','#transactions')
      `, [trx.client_id]);
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','↩️ Dispute Selesai','Admin memutuskan refund untuk klien pada transaksi #${trx.id}.','#transactions')
      `, [trx.worker_id]);
    } else if (decision === 'release') {
      // Worker menerima total_amount PENUH — fee 10% sudah dibayar client
      // di atas total (lihat utils/ledger.js). Aturan lama di sini
      // (total_amount - platform_fee) memotong fee dari worker padahal
      // client sudah membayarnya: worker kena fee dua kali.
      const updated = await pool.query(
        "UPDATE transactions SET status='completed', final_paid_at=NOW() WHERE id=$1 AND status='disputed' RETURNING *",
        [trx.id]
      );
      if (!updated.rows.length) return res.status(400).json({ message: 'Dispute sudah diproses' });
      await creditWorker(pool, trx.worker_id, parseInt(trx.total_amount, 10));
      await updateWorkerBadge(pool, trx.worker_id);
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','✅ Dispute Selesai','Admin memutuskan dana dilepas ke pekerja untuk transaksi #${trx.id}.','#transactions')
      `, [trx.client_id]);
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'transaction','💰 Dispute Selesai - Dana Cair!','Admin memutuskan dana dilepas ke kamu. Cek dompetmu.','#wallet')
      `, [trx.worker_id]);
    }

    res.json({ message: `Dispute diselesaikan: ${decision}` });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== TRANSACTION OVERVIEW =====
router.get('/transactions', admin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        uc.full_name as client_name,
        uw.full_name as worker_name
      FROM transactions t
      LEFT JOIN users uc ON t.client_id = uc.id
      LEFT JOIN users uw ON t.worker_id = uw.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='disputed') as disputed,
        COUNT(*) FILTER (WHERE status='waiting_dp') as pending,
        SUM(platform_fee) FILTER (WHERE status='completed') as total_fee
      FROM transactions
    `);
    res.json({ transactions: result.rows, stats: stats.rows[0] });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== ANALYTICS =====
router.get('/analytics/overview', async (req, res) => {
  try {
    const [revenue, users, listings, withdrawals] = await Promise.all([
      pool.query(`SELECT 
        COALESCE(SUM(platform_fee), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN date_trunc('month', created_at) = date_trunc('month', NOW()) THEN platform_fee ELSE 0 END), 0) as monthly_revenue,
        COUNT(*) as total_transactions
        FROM transactions WHERE status = 'completed'`),
      pool.query(`SELECT COUNT(*) as total_users FROM users`),
      pool.query(`SELECT COUNT(*) as total_listings FROM listings WHERE is_active = true`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) as pending_withdrawals FROM withdraw_requests WHERE status = 'pending'`),
    ]);
    res.json({
      total_revenue: revenue.rows[0].total_revenue,
      monthly_revenue: revenue.rows[0].monthly_revenue,
      total_transactions: revenue.rows[0].total_transactions,
      total_users: users.rows[0].total_users,
      total_listings: listings.rows[0].total_listings,
      pending_withdrawals: withdrawals.rows[0].pending_withdrawals,
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.get('/analytics/monthly', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(m.month, 'Mon YY') as month,
        COALESCE(t.revenue, 0) as revenue,
        COALESCE(u.new_users, 0) as new_users,
        COALESCE(t.transactions, 0) as transactions,
        COALESCE(l.new_listings, 0) as new_listings
      FROM generate_series(
        date_trunc('month', NOW() - interval '5 months'),
        date_trunc('month', NOW()),
        '1 month'
      ) AS m(month)
      LEFT JOIN (
        SELECT date_trunc('month', created_at) as month, 
          SUM(platform_fee) as revenue, COUNT(*) as transactions
        FROM transactions WHERE status = 'completed'
        GROUP BY 1
      ) t ON t.month = m.month
      LEFT JOIN (
        SELECT date_trunc('month', created_at) as month, COUNT(*) as new_users
        FROM users GROUP BY 1
      ) u ON u.month = m.month
      LEFT JOIN (
        SELECT date_trunc('month', created_at) as month, COUNT(*) as new_listings
        FROM listings GROUP BY 1
      ) l ON l.month = m.month
      ORDER BY m.month
    `);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== EXPORT CSV =====
router.get('/export/:type', async (req, res) => {
  const { type } = req.params;
  try {
    let rows, headers;
    if (type === 'transactions') {
      const r = await pool.query(`SELECT t.id, t.total_amount, t.platform_fee, t.status, t.created_at, 
        w.full_name as worker, c.full_name as client
        FROM transactions t
        JOIN users w ON w.id = t.worker_id
        JOIN users c ON c.id = t.client_id
        ORDER BY t.created_at DESC`);
      headers = 'ID,Total Amount,Platform Fee,Status,Tanggal,Worker,Client';
      rows = r.rows.map(r => `${r.id},${r.total_amount},${r.platform_fee},${r.status},${r.created_at},${r.worker},${r.client}`);
    } else if (type === 'users') {
      const r = await pool.query(`SELECT id, full_name, email, role, city, is_verified, created_at FROM users ORDER BY created_at DESC`);
      headers = 'ID,Nama,Email,Role,Kota,Verified,Tanggal Daftar';
      rows = r.rows.map(r => `${r.id},"${r.full_name}",${r.email},${r.role},${r.city||''},${r.is_verified},${r.created_at}`);
    } else if (type === 'listings') {
      const r = await pool.query(`SELECT l.id, l.title, l.price, l.is_active, l.created_at, u.full_name as owner FROM listings l JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC`);
      headers = 'ID,Judul,Harga,Aktif,Tanggal,Owner';
      rows = r.rows.map(r => `${r.id},"${r.title}",${r.price},${r.is_active},${r.created_at},"${r.owner}"`);
    } else {
      return res.status(400).json({ message: 'Invalid type' });
    }
    const csv = [headers, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=akubisa-${type}.csv`);
    res.send(csv);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== BOOST ORDERS =====
router.get('/boost-orders', async (req, res) => {
  const { filter = 'active' } = req.query;
  try {
    let where = '';
    if (filter === 'active') where = "WHERE bo.status = 'active'";
    else if (filter === 'pending') where = "WHERE bo.status = 'pending'";
    const result = await pool.query(`
      SELECT bo.*, l.title as listing_title, u.full_name as user_name
      FROM boost_orders bo
      LEFT JOIN listings l ON l.id = bo.listing_id
      LEFT JOIN users u ON u.id = bo.user_id
      ${where}
      ORDER BY bo.created_at DESC LIMIT 100
    `);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== CATEGORIES =====
router.post('/categories', async (req, res) => {
  const { name, slug, icon, parent_slug } = req.body;
  try {
    // parent_slug harus menunjuk ke slug kategori induk yang ada
    // (NULL = menu utama). Validasi ini mencegah subkategori yatim.
    if (parent_slug) {
      const parent = await pool.query('SELECT id FROM categories WHERE slug = $1', [parent_slug]);
      if (!parent.rows.length) return res.status(400).json({ message: 'Induk tidak ditemukan' });
    }
    const result = await pool.query(
      'INSERT INTO categories (name, slug, icon, parent_slug) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, slug, icon, parent_slug || null]
    );
    res.json(result.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ message: 'Slug sudah dipakai' });
    res.status(500).json({ message: e.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    // Induk yang masih punya subkategori tidak boleh dihapus.
    const kids = await pool.query(
      'SELECT COUNT(*) FROM categories WHERE parent_slug = (SELECT slug FROM categories WHERE id = $1)',
      [req.params.id]);
    if (parseInt(kids.rows[0].count) > 0)
      return res.status(400).json({ message: 'Hapus dulu subkategorinya' });
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    if (e.code === '23503') return res.status(400).json({ message: 'Masih dipakai listing / job request' });
    res.status(500).json({ message: e.message });
  }
});

// ===== BROADCAST =====
router.post('/broadcast', async (req, res) => {
  const { target, title, message } = req.body;
  try {
    let users;
    if (target === 'all') {
      users = await pool.query('SELECT id FROM users WHERE email_verified = true');
    } else {
      users = await pool.query('SELECT id FROM users WHERE role = $1 AND email_verified = true', [target]);
    }
    const userIds = users.rows.map(u => u.id);
    for (const userId of userIds) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
        [userId, 'broadcast', title, message]
      );
    }
    res.json({ sent: userIds.length });
  } catch(e) { res.status(500).json({ message: e.message }); }
});
