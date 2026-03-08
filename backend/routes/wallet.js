const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/var/www/akubisa/frontend/uploads/portfolio/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `portfolio_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET saldo worker
router.get('/balance', auth, async (req, res) => {
  try {
    const bal = await pool.query(`
      SELECT wb.*,
        COUNT(DISTINCT t.id) as total_transactions,
        COUNT(DISTINCT wr.id) FILTER (WHERE wr.status='pending') as pending_withdrawals
      FROM worker_balances wb
      LEFT JOIN transactions t ON t.worker_id = wb.worker_id AND t.status='completed'
      LEFT JOIN withdraw_requests wr ON wr.worker_id = wb.worker_id
      WHERE wb.worker_id = $1
      GROUP BY wb.id
    `, [req.user.id]);

    if (!bal.rows[0]) {
      return res.json({ total_earned: 0, total_withdrawn: 0, balance: 0, total_transactions: 0, pending_withdrawals: 0 });
    }
    res.json(bal.rows[0]);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET riwayat earnings
router.get('/earnings', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id, t.total_amount, t.platform_fee,
        (t.total_amount - t.platform_fee) as earned,
        t.final_paid_at as paid_at, t.notes,
        uc.full_name as client_name
      FROM transactions t
      LEFT JOIN users uc ON t.client_id = uc.id
      WHERE t.worker_id = $1 AND t.status = 'completed'
      ORDER BY t.final_paid_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST request withdraw
router.post('/withdraw', auth, async (req, res) => {
  const { amount, bank_name, account_number, account_name } = req.body;
  if (!amount || amount < 50000) return res.status(400).json({ message: 'Minimum withdraw Rp 50.000' });
  if (!bank_name || !account_number || !account_name) return res.status(400).json({ message: 'Data rekening lengkap' });
  try {
    const bal = await pool.query('SELECT balance FROM worker_balances WHERE worker_id=$1', [req.user.id]);
    if (!bal.rows[0] || bal.rows[0].balance < amount) return res.status(400).json({ message: 'Saldo tidak cukup' });

    const pending = await pool.query(`SELECT id FROM withdraw_requests WHERE worker_id=$1 AND status='pending'`, [req.user.id]);
    if (pending.rows.length > 0) return res.status(400).json({ message: 'Masih ada request withdraw yang menunggu' });

    // Freeze saldo
    await pool.query('UPDATE worker_balances SET balance = balance - $1 WHERE worker_id = $2', [amount, req.user.id]);

    await pool.query(`
      INSERT INTO withdraw_requests (worker_id, amount, bank_name, account_number, account_name)
      VALUES ($1,$2,$3,$4,$5)
    `, [req.user.id, amount, bank_name, account_number, account_name]);

    // Notif
    await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES ($1,'wallet','💸 Request Withdraw Dikirim','Request withdraw Rp ${parseInt(amount).toLocaleString()} sedang diproses admin.','#wallet')
    `, [req.user.id]);

    res.json({ message: 'Request withdraw berhasil dikirim! Diproses dalam 1x24 jam.' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET riwayat withdraw
router.get('/withdrawals', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM withdraw_requests WHERE worker_id=$1 ORDER BY created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== PORTFOLIO =====
// GET portfolio publik user
router.get('/portfolio/:userId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pi.*, u.full_name as worker_name
      FROM portfolio_items pi
      LEFT JOIN users u ON pi.worker_id = u.id
      WHERE pi.worker_id=$1 AND pi.is_public=true
      ORDER BY pi.created_at DESC
    `, [req.params.userId]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET portfolio milik sendiri (include private)
router.get('/my-portfolio', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pi.*, l.title as listing_title
      FROM portfolio_items pi
      LEFT JOIN listings l ON pi.transaction_id IS NOT NULL AND l.id = (
        SELECT listing_id FROM transactions WHERE id = pi.transaction_id
      )
      WHERE pi.worker_id=$1
      ORDER BY pi.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST buat portfolio manual
router.post('/portfolio', auth, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ message: 'Judul wajib diisi' });
    const result = await pool.query(`
      INSERT INTO portfolio_items (worker_id, title, description, is_public)
      VALUES ($1, $2, $3, true)
      RETURNING *
    `, [req.user.id, title, description || '']);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST upload foto ke portfolio item
router.post('/portfolio/:id/photos', auth, upload.array('photos', 5), async (req, res) => {
  try {
    const item = await pool.query('SELECT * FROM portfolio_items WHERE id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
    if (!item.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });

    const photos = req.files.map(f => `/uploads/portfolio/${f.filename}`);
    const existing = item.rows[0].photos || [];
    await pool.query('UPDATE portfolio_items SET photos=$1 WHERE id=$2', [[...existing, ...photos], req.params.id]);

    res.json({ message: 'Foto berhasil diupload!', photos });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// DELETE portfolio item
router.delete('/portfolio/:id', auth, async (req, res) => {
  try {
    const item = await pool.query('SELECT * FROM portfolio_items WHERE id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
    if (!item.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    await pool.query('DELETE FROM portfolio_items WHERE id=$1', [req.params.id]);
    res.json({ message: 'Portfolio dihapus' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// PATCH update portfolio item
router.patch('/portfolio/:id', auth, async (req, res) => {
  const { title, description, is_public } = req.body;
  try {
    const item = await pool.query('SELECT * FROM portfolio_items WHERE id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
    if (!item.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });

    await pool.query(`
      UPDATE portfolio_items SET title=COALESCE($1,title), description=COALESCE($2,description), is_public=COALESCE($3,is_public) WHERE id=$4
    `, [title||null, description||null, is_public!=null?is_public:null, req.params.id]);

    res.json({ message: 'Portfolio diupdate!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
