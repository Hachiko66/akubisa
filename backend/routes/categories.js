const router = require('express').Router();
const pool = require('../config/db');

// Query dasar: satu baris per kategori. listing_count untuk kategori
// induk = listing langsung + listing semua subkategorinya, supaya
// angka di kartu menu / tab induk masuk akal.
const BASE_QUERY = `
  SELECT c.*,
    (SELECT COUNT(*) FROM listings l
      WHERE l.category_id = c.id AND l.is_active = true)
    + (SELECT COUNT(*) FROM listings l2
        JOIN categories c2 ON l2.category_id = c2.id
        WHERE c2.parent_slug = c.slug AND l2.is_active = true)
      AS listing_count
  FROM categories c
  ORDER BY c.parent_slug NULLS FIRST, c.name
`;

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(BASE_QUERY);
    // ?grouped=1 -> { groups: [induk + children], flat: [...] }.
    // Default tetap array datar (kompatibel dengan semua pemanggil lama:
    // app.js loadCategories, panel admin, loadHeroStats).
    if (req.query.grouped === '1') {
      const flat = result.rows;
      const groups = flat
        .filter(c => !c.parent_slug)
        .map(p => ({ ...p, children: flat.filter(c => c.parent_slug === p.slug) }));
      return res.json({ groups, flat });
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
