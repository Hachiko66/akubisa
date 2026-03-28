const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Worker: buat kode diskon
router.post('/', auth, async (req, res) => {
  const { code, listing_id, discount_type, discount_value, max_uses, expires_at } = req.body;
  if (!code || !discount_value) return res.status(400).json({ message: 'Kode dan nilai diskon wajib diisi' });
  if (discount_type === 'percent' && (discount_value < 1 || discount_value > 90)) 
    return res.status(400).json({ message: 'Diskon persen harus antara 1-90%' });
  try {
    // Validasi listing milik user jika listing_id diisi
    if (listing_id) {
      const check = await pool.query('SELECT user_id FROM listings WHERE id=$1', [listing_id]);
      if (!check.rows.length || check.rows[0].user_id !== req.user.id)
        return res.status(403).json({ message: 'Listing bukan milikmu' });
    }
    const result = await pool.query(
      `INSERT INTO discount_codes (code, listing_id, user_id, discount_type, discount_value, max_uses, expires_at)
       VALUES (UPPER($1),$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, listing_id || null, req.user.id, discount_type || 'percent', discount_value, max_uses || null, expires_at || null]
    );
    res.json(result.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ message: 'Kode sudah dipakai, coba kode lain' });
    res.status(500).json({ message: e.message });
  }
});

// Worker: lihat kode diskon milikku
router.get('/my', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dc.*, l.title as listing_title 
       FROM discount_codes dc
       LEFT JOIN listings l ON l.id = dc.listing_id
       WHERE dc.user_id = $1 ORDER BY dc.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Worker: hapus kode diskon
router.delete('/:id', auth, async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM discount_codes WHERE id=$1', [req.params.id]);
    if (!check.rows.length || check.rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: 'Tidak diizinkan' });
    await pool.query('DELETE FROM discount_codes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Validate kode diskon saat checkout
router.post('/validate', auth, async (req, res) => {
  const { code, listing_id, amount } = req.body;
  try {
    const result = await pool.query(
      `SELECT * FROM discount_codes 
       WHERE UPPER(code) = UPPER($1) 
       AND is_active = true
       AND (listing_id IS NULL OR listing_id = $2)
       AND (max_uses IS NULL OR used_count < max_uses)
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [code, listing_id || 0]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Kode diskon tidak valid atau sudah expired' });
    const dc = result.rows[0];
    let discount_amount = 0;
    if (dc.discount_type === 'percent') {
      discount_amount = Math.floor(amount * dc.discount_value / 100);
    } else {
      discount_amount = Math.min(dc.discount_value, amount);
    }
    const final_amount = amount - discount_amount;
    res.json({ valid: true, discount_code_id: dc.id, discount_amount, final_amount, discount_type: dc.discount_type, discount_value: dc.discount_value });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
