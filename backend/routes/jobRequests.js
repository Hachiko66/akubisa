const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { sendEmailNotif } = require('../config/email');

// GET semua job requests
router.get('/', async (req, res) => {
  const { category, search, page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['jr.is_active = true', "jr.status = 'open'"];
  let params = [];
  let i = 1;
  if (category) { where.push(`c.slug = $${i++}`); params.push(category); }
  if (search) { where.push(`(jr.title ILIKE $${i} OR jr.description ILIKE $${i})`); params.push(`%${search}%`); i++; }
  const whereStr = 'WHERE ' + where.join(' AND ');
  try {
    const result = await pool.query(`
      SELECT jr.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
             u.full_name, u.avatar, u.city as user_city, u.is_verified,
             COUNT(ja.id) as application_count
      FROM job_requests jr
      LEFT JOIN categories c ON jr.category_id = c.id
      LEFT JOIN users u ON jr.user_id = u.id
      LEFT JOIN job_applications ja ON ja.job_request_id = jr.id
      ${whereStr}
      GROUP BY jr.id, c.id, u.id
      ORDER BY jr.created_at DESC
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, limit, offset]);
    const count = await pool.query(`SELECT COUNT(*) FROM job_requests jr LEFT JOIN categories c ON jr.category_id = c.id ${whereStr}`, params);
    res.json({ requests: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET job request milik user
router.get('/my', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT jr.*, c.name as category_name, c.icon as category_icon,
             COUNT(ja.id) as application_count
      FROM job_requests jr
      LEFT JOIN categories c ON jr.category_id = c.id
      LEFT JOIN job_applications ja ON ja.job_request_id = jr.id
      WHERE jr.user_id = $1
      GROUP BY jr.id, c.id
      ORDER BY jr.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET detail job request
router.get('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE job_requests SET views = views + 1 WHERE id=$1', [req.params.id]);
    const result = await pool.query(`
      SELECT jr.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
             u.full_name, u.avatar, u.city as user_city, u.is_verified, u.bio,
             COUNT(ja.id) as application_count
      FROM job_requests jr
      LEFT JOIN categories c ON jr.category_id = c.id
      LEFT JOIN users u ON jr.user_id = u.id
      LEFT JOIN job_applications ja ON ja.job_request_id = jr.id
      WHERE jr.id = $1
      GROUP BY jr.id, c.id, u.id
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST buat job request
router.post('/', auth, async (req, res) => {
  const { title, description, category_id, budget_min, budget_max, deadline, city, twitter_url } = req.body;
  if (!title || !description) return res.status(400).json({ message: 'Judul dan deskripsi wajib diisi' });
  try {
    const result = await pool.query(`
      INSERT INTO job_requests (user_id, title, description, category_id, budget_min, budget_max, deadline, city, twitter_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.user.id, title, description, category_id||null, budget_min||null, budget_max||null, deadline||null, city||null, twitter_url||null]);
    res.status(201).json({ message: 'Permintaan berhasil diposting!', data: result.rows[0] });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// DELETE job request
router.delete('/:id', auth, async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM job_requests WHERE id=$1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    await pool.query('DELETE FROM job_requests WHERE id=$1', [req.params.id]);
    res.json({ message: 'Permintaan dihapus!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET aplikasi untuk job request tertentu (hanya owner)
router.get('/:id/applications', auth, async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM job_requests WHERE id=$1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    const result = await pool.query(`
      SELECT ja.*, u.full_name, u.avatar, u.city, u.is_verified, u.bio,
             COALESCE(AVG(r.rating),0) as avg_rating, COUNT(r.id) as review_count
      FROM job_applications ja
      JOIN users u ON ja.applicant_id = u.id
      LEFT JOIN reviews r ON r.reviewed_id = u.id
      WHERE ja.job_request_id = $1
      GROUP BY ja.id, u.id
      ORDER BY ja.created_at ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST apply ke job request
router.post('/:id/apply', auth, async (req, res) => {
  const { cover_letter, offered_price, estimated_days } = req.body;
  if (!cover_letter) return res.status(400).json({ message: 'Cover letter wajib diisi' });
  try {
    const jr = await pool.query('SELECT * FROM job_requests WHERE id=$1', [req.params.id]);
    if (!jr.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (jr.rows[0].user_id === req.user.id) return res.status(400).json({ message: 'Tidak bisa apply ke permintaan sendiri' });
    const result = await pool.query(`
      INSERT INTO job_applications (job_request_id, applicant_id, cover_letter, offered_price, estimated_days)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [req.params.id, req.user.id, cover_letter, offered_price||null, estimated_days||null]);
    // Email ke pemilik job request
    const applicant = await pool.query('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
    sendEmailNotif(jr.rows[0].user_id, 'new_job_application', {
      applicantName: applicant.rows[0]?.full_name || 'Seseorang',
      jobTitle: jr.rows[0].title
    }, pool);
    res.status(201).json({ message: 'Lamaran terkirim!', data: result.rows[0] });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ message: 'Kamu sudah melamar sebelumnya' });
    res.status(500).json({ message: e.message });
  }
});

// PATCH accept aplikasi
router.patch('/applications/:appId/accept', auth, async (req, res) => {
  try {
    const app = await pool.query(`
      SELECT ja.*, jr.user_id as owner_id FROM job_applications ja
      JOIN job_requests jr ON ja.job_request_id = jr.id
      WHERE ja.id = $1
    `, [req.params.appId]);
    if (!app.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    if (app.rows[0].owner_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    await pool.query("UPDATE job_applications SET status='accepted' WHERE id=$1", [req.params.appId]);
    await pool.query("UPDATE job_applications SET status='rejected' WHERE job_request_id=$1 AND id!=$2", [app.rows[0].job_request_id, req.params.appId]);
    await pool.query("UPDATE job_requests SET status='in_progress' WHERE id=$1", [app.rows[0].job_request_id]);
    res.json({ message: 'Pelamar diterima!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
