const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/listingController');

router.get('/', c.getAll);
router.get('/my', auth, c.myListings);
router.get('/:id', c.getOne);
router.post('/', auth, c.create);
router.put('/:id', auth, c.update);
router.delete('/:id', auth, c.delete);


// User promote listing milik sendiri
router.patch('/:id/promote', auth, async (req, res) => {
  const { days = 7 } = req.body;
  const validDays = [7, 14, 30];
  if (!validDays.includes(parseInt(days)))
    return res.status(400).json({ message: 'Durasi tidak valid' });
  try {
    // Cek ownership
    const check = await pool.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Listing tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: 'Bukan listing kamu' });

    const until = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE listings SET is_featured=true, featured_until=$1 WHERE id=$2',
      [until, req.params.id]
    );
    res.json({ message: `Penawaran berhasil dipromosikan selama ${days} hari!` });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;

// ===== DIGITAL PRODUCTS =====
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const digitalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/digital');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `digital_${req.user.id}_${Date.now()}${ext}`);
  }
});

const uploadDigital = multer({
  storage: digitalStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.doc','.docx','.zip','.rar','.png','.jpg','.psd','.ai','.fig','.txt','.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format file tidak didukung'));
  }
});

// Upload file digital saat posting listing
router.post('/upload-digital', auth, uploadDigital.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File tidak ditemukan' });
    res.json({
      file_url: `/uploads/digital/${req.file.filename}`,
      file_name: req.file.originalname,
      file_size: req.file.size
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Beli produk digital (gratis/berbayar - simulasi)
router.post('/:id/purchase', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await pool.query(
      'SELECT * FROM listings WHERE id=$1 AND listing_type=$2 AND is_active=true',
      [id, 'digital']
    );
    if (!listing.rows[0]) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    
    // Simpan purchase
    await pool.query(
      'INSERT INTO digital_purchases (buyer_id, listing_id, amount) VALUES ($1,$2,$3) ON CONFLICT (buyer_id, listing_id) DO NOTHING',
      [req.user.id, id, listing.rows[0].price]
    );
    
    res.json({ success: true, message: 'Pembelian berhasil!' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Download file digital (harus sudah purchase)
router.get('/:id/download', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await pool.query('SELECT * FROM listings WHERE id=$1', [id]);
    const l = listing.rows[0];
    if (!l) return res.status(404).json({ message: 'Tidak ditemukan' });

    // Cek apakah sudah beli atau owner sendiri
    const isPurchased = await pool.query(
      'SELECT id FROM digital_purchases WHERE buyer_id=$1 AND listing_id=$2',
      [req.user.id, id]
    );
    const isOwner = l.user_id === req.user.id;
    
    if (!isPurchased.rows[0] && !isOwner) {
      return res.status(403).json({ message: 'Beli dulu untuk download' });
    }

    // Update download count
    await pool.query('UPDATE listings SET download_count = download_count + 1 WHERE id=$1', [id]);

    const filePath = path.join(__dirname, '..', l.file_url);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File tidak ada' });
    
    res.download(filePath, l.file_name || 'download');
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Cek apakah sudah purchase
router.get('/:id/purchase-status', auth, async (req, res) => {
  try {
    const p = await pool.query(
      'SELECT id FROM digital_purchases WHERE buyer_id=$1 AND listing_id=$2',
      [req.user.id, req.params.id]
    );
    const l = await pool.query('SELECT user_id FROM listings WHERE id=$1', [req.params.id]);
    res.json({ 
      purchased: !!p.rows[0] || l.rows[0]?.user_id === req.user.id
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
