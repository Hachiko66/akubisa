const pool = require('../config/db');

exports.getAll = async (req, res) => {
  const { category, search, city, page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['l.is_active = true'];
  let params = [];
  let i = 1;
  if (category) { where.push(`c.slug = $${i++}`); params.push(category); }
  if (search) { where.push(`(l.title ILIKE $${i} OR l.description ILIKE $${i})`); params.push(`%${search}%`); i++; }
  if (city) { where.push(`l.city ILIKE $${i++}`); params.push(`%${city}%`); }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const result = await pool.query(
      `SELECT l.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
              u.full_name, u.avatar, u.is_verified, u.city as user_city
       FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       LEFT JOIN users u ON l.user_id = u.id
       ${whereStr}
       ORDER BY l.is_featured DESC, RANDOM()
       LIMIT $${i} OFFSET $${i+1}`,
      [...params, limit, offset]
    );
    const count = await pool.query(`SELECT COUNT(*) FROM listings l LEFT JOIN categories c ON l.category_id = c.id ${whereStr}`, params);
    res.json({ listings: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    await pool.query('UPDATE listings SET views = views + 1 WHERE id=$1', [req.params.id]);
    const result = await pool.query(
      `SELECT l.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
              u.full_name, u.avatar, u.is_verified, u.bio, u.city as user_city, u.phone,
              COALESCE(AVG(r.rating),0) as avg_rating, COUNT(r.id) as review_count
       FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       LEFT JOIN users u ON l.user_id = u.id
       LEFT JOIN reviews r ON r.reviewed_id = u.id
       WHERE l.id=$1 GROUP BY l.id, c.id, u.id`, [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Listing tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.create = async (req, res) => {
  const { title, description, category_id, price, price_unit, city } = req.body;
  if (!title || !description) return res.status(400).json({ message: 'Judul dan deskripsi wajib diisi' });
  try {
    const result = await pool.query(
      `INSERT INTO listings (user_id, title, description, category_id, price, price_unit, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, title, description, category_id || null, price || null, price_unit || null, city || null]
    );
    res.status(201).json({ message: 'Listing berhasil dibuat!', listing: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.update = async (req, res) => {
  const { title, description, category_id, price, price_unit, city, is_active } = req.body;
  try {
    const check = await pool.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Listing tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    const result = await pool.query(
      `UPDATE listings SET title=$1, description=$2, category_id=$3, price=$4,
       price_unit=$5, city=$6, is_active=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [title, description, category_id, price, price_unit, city, is_active ?? true, req.params.id]
    );
    res.json({ message: 'Listing diperbarui!', listing: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Listing tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    await pool.query('DELETE FROM listings WHERE id=$1', [req.params.id]);
    res.json({ message: 'Listing dihapus!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.myListings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, c.name as category_name, c.icon as category_icon
       FROM listings l LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.user_id=$1 ORDER BY l.is_featured DESC, RANDOM()`, [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
