// ===== FITUR SOSIAL — FEED / FOLLOW / LIKE / KOMENTAR =====
// AkuBisa sebagai media sosial: user posting update skill / pamer
// karya, follow talent, like & komentar. Tabel: follows, social_posts,
// post_likes, post_comments (lihat backend/config/schema.sql +
// backend/config/migrate-social.sql).
//
// Auth: memakai middleware JWT yang sama seperti route lain
// (backend/middleware/auth). GET /feed dan GET /users/:id/* bisa
// diakses publik; bila ada token, respons ditambah liked_by_me /
// following_author / is_following. optionalAuth di bawah memakai
// jwt.verify yang sama — bukan skema auth baru.
// TIDAK ada upload gambar di ronde ini: postingan hanya bisa menautkan
// penawaran (listing) atau item portfolio yang SUDAH ADA.
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { notifyUser } = require('../utils/notify');

const MAX_POST_LEN = 2000;
const MAX_COMMENT_LEN = 1000;
const POST_TYPES = ['update', 'portfolio', 'showcase'];

// Auth opsional: isi req.viewerId bila ada token valid; bila tidak ada
// token / token tidak valid, lanjut sebagai tamu (viewerId = null).
function optionalAuth(req, res, next) {
  const h = req.headers['authorization'];
  const token = h && h.split(' ')[1];
  req.viewerId = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.viewerId = decoded.id;
    } catch { /* tamu */ }
  }
  next();
}

// Kolom penulis + tautan yang dipakai di semua respons postingan.
const POST_SELECT = `
  SELECT p.id, p.user_id, p.body, p.type, p.listing_id, p.portfolio_item_id,
    p.created_at, p.updated_at,
    u.full_name AS author_name, u.avatar AS author_avatar,
    u.role AS author_role, u.city AS author_city, u.is_verified AS author_verified,
    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
    CASE WHEN $1::int IS NULL THEN false
      ELSE EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) END AS liked_by_me,
    CASE WHEN $1::int IS NULL THEN false
      ELSE EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id) END AS following_author,
    l.title AS listing_title, l.price AS listing_price,
    c.name AS listing_category_name,
    pi.title AS portfolio_title, pi.photos AS portfolio_photos
  FROM social_posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN listings l ON l.id = p.listing_id
  LEFT JOIN categories c ON c.id = l.category_id
  LEFT JOIN portfolio_items pi ON pi.id = p.portfolio_item_id
  WHERE p.deleted_at IS NULL
`;

function rowToPost(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    body: r.body,
    type: r.type,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author: {
      id: r.user_id,
      full_name: r.author_name,
      avatar: r.author_avatar,
      role: r.author_role,
      city: r.author_city,
      is_verified: r.author_verified,
    },
    like_count: parseInt(r.like_count || 0),
    comment_count: parseInt(r.comment_count || 0),
    liked_by_me: !!r.liked_by_me,
    following_author: !!r.following_author,
    listing: r.listing_id ? {
      id: r.listing_id,
      title: r.listing_title,
      price: r.listing_price,
      category_name: r.listing_category_name,
    } : null,
    portfolio_item: r.portfolio_item_id ? {
      id: r.portfolio_item_id,
      title: r.portfolio_title,
      photos: Array.isArray(r.portfolio_photos) ? r.portfolio_photos : [],
    } : null,
  };
}

function parsePage(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

// ===== FEED =====
// GET /api/social/feed?tab=all|following&page&limit
// tab=all (default): semua postingan, terbaru dulu.
// tab=following: hanya postingan dari user yang diikuti viewer
// (butuh login; tanpa login -> 401).
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const tab = req.query.tab === 'following' ? 'following' : 'all';
    if (tab === 'following' && !req.viewerId) {
      return res.status(401).json({ message: 'Login dulu untuk melihat feed Mengikuti' });
    }
    const { page, limit, offset } = parsePage(req);
    const where = tab === 'following'
      ? ` AND p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)`
      : '';
    const total = await pool.query(
      `SELECT COUNT(*) FROM social_posts p WHERE p.deleted_at IS NULL${where}`,
      tab === 'following' ? [req.viewerId] : []
    );
    const result = await pool.query(
      `${POST_SELECT}${where} ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
      [req.viewerId, limit, offset]
    );
    res.json({
      posts: result.rows.map(rowToPost),
      total: parseInt(total.rows[0].count),
      page, limit,
      has_more: offset + result.rows.length < parseInt(total.rows[0].count),
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== BUAT POSTINGAN =====
// POST /api/social/posts { body, type, listing_id?, portfolio_item_id? }
// type 'portfolio' wajib menautkan item portfolio MILIK penulis;
// type 'showcase' wajib menautkan penawaran MILIK penulis.
router.post('/posts', auth, async (req, res) => {
  const { body, type, listing_id, portfolio_item_id } = req.body || {};
  const text = (body || '').trim();
  if (!text) return res.status(400).json({ message: 'Tulis dulu isi postinganmu' });
  if (text.length > MAX_POST_LEN) return res.status(400).json({ message: `Postingan maksimal ${MAX_POST_LEN} karakter` });
  const postType = type || 'update';
  if (!POST_TYPES.includes(postType)) return res.status(400).json({ message: 'Tipe postingan tidak valid' });
  try {
    if (postType === 'portfolio') {
      if (!portfolio_item_id) return res.status(400).json({ message: 'Pilih item portfolio yang mau dipamerkan' });
      const item = await pool.query(
        'SELECT id FROM portfolio_items WHERE id=$1 AND worker_id=$2 AND is_public=true',
        [portfolio_item_id, req.user.id]
      ).catch(() => null);
      if (!item || !item.rows.length) return res.status(400).json({ message: 'Item portfolio tidak ditemukan atau bukan milikmu' });
    }
    if (postType === 'showcase') {
      if (!listing_id) return res.status(400).json({ message: 'Pilih penawaran yang mau dipamerkan' });
      const listing = await pool.query(
        'SELECT id FROM listings WHERE id=$1 AND user_id=$2 AND is_active=true',
        [listing_id, req.user.id]
      );
      if (!listing.rows.length) return res.status(400).json({ message: 'Penawaran tidak ditemukan atau bukan milikmu' });
    }
    const result = await pool.query(
      `INSERT INTO social_posts (user_id, body, type, listing_id, portfolio_item_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, text, postType,
       postType === 'showcase' ? listing_id : null,
       postType === 'portfolio' ? portfolio_item_id : null]
    );
    const fresh = await pool.query(`${POST_SELECT} AND p.id = $2`, [req.user.id, result.rows[0].id]);
    res.status(201).json({ message: 'Postingan diterbitkan!', post: rowToPost(fresh.rows[0]) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== EDIT POSTINGAN (penulis saja) =====
router.patch('/posts/:id', auth, async (req, res) => {
  const text = (req.body.body || '').trim();
  if (!text) return res.status(400).json({ message: 'Isi postingan tidak boleh kosong' });
  if (text.length > MAX_POST_LEN) return res.status(400).json({ message: `Postingan maksimal ${MAX_POST_LEN} karakter` });
  try {
    const check = await pool.query('SELECT user_id FROM social_posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Postingan tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Hanya penulis yang bisa mengedit postingan ini' });
    const result = await pool.query(
      'UPDATE social_posts SET body=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [text, req.params.id]
    );
    const fresh = await pool.query(`${POST_SELECT} AND p.id = $2`, [req.user.id, result.rows[0].id]);
    res.json({ message: 'Postingan diperbarui!', post: rowToPost(fresh.rows[0]) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== HAPUS POSTINGAN (penulis saja, soft delete) =====
router.delete('/posts/:id', auth, async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM social_posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Postingan tidak ditemukan' });
    if (check.rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Hanya penulis yang bisa menghapus postingan ini' });
    await pool.query('UPDATE social_posts SET deleted_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ message: 'Postingan dihapus' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== LIKE =====
// POST /api/social/posts/:id/like — idempotent (like dua kali tetap 1).
router.post('/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await pool.query('SELECT id, user_id FROM social_posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!post.rows.length) return res.status(404).json({ message: 'Postingan tidak ditemukan' });
    const ins = await pool.query(
      'INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT (post_id, user_id) DO NOTHING',
      [req.params.id, req.user.id]
    );
    const count = await pool.query('SELECT COUNT(*) FROM post_likes WHERE post_id=$1', [req.params.id]);
    res.json({ liked: true, like_count: parseInt(count.rows[0].count) });
    // Notifikasi ke penulis postingan — hanya untuk like BARU dan
    // bukan like ke postingan sendiri (best-effort).
    if (ins.rowCount > 0 && post.rows[0].user_id !== req.user.id) {
      const liker = await pool.query('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
      notifyUser(post.rows[0].user_id, {
        type: 'social',
        title: '❤️ Postinganmu disukai',
        body: `${liker.rows[0]?.full_name || 'Seseorang'} menyukai postinganmu.`,
        link: '#feed'
      });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/social/posts/:id/like — batalkan like.
router.delete('/posts/:id/like', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const count = await pool.query('SELECT COUNT(*) FROM post_likes WHERE post_id=$1', [req.params.id]);
    res.json({ liked: false, like_count: parseInt(count.rows[0].count) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== KOMENTAR =====
// GET /api/social/posts/:id/comments
router.get('/posts/:id/comments', async (req, res) => {
  try {
    const post = await pool.query('SELECT id FROM social_posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!post.rows.length) return res.status(404).json({ message: 'Postingan tidak ditemukan' });
    const result = await pool.query(
      `SELECT pc.id, pc.post_id, pc.user_id, pc.body, pc.created_at,
              u.full_name AS author_name, u.avatar AS author_avatar, u.is_verified AS author_verified
       FROM post_comments pc JOIN users u ON u.id = pc.user_id
       WHERE pc.post_id=$1 ORDER BY pc.created_at ASC LIMIT 50`,
      [req.params.id]
    );
    res.json(result.rows.map(c => ({
      id: c.id, post_id: c.post_id, body: c.body, created_at: c.created_at,
      author: { id: c.user_id, full_name: c.author_name, avatar: c.author_avatar, is_verified: c.author_verified },
    })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/social/posts/:id/comments { body }
router.post('/posts/:id/comments', auth, async (req, res) => {
  const text = (req.body.body || '').trim();
  if (!text) return res.status(400).json({ message: 'Tulis dulu komentarmu' });
  if (text.length > MAX_COMMENT_LEN) return res.status(400).json({ message: `Komentar maksimal ${MAX_COMMENT_LEN} karakter` });
  try {
    const post = await pool.query('SELECT id, user_id FROM social_posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!post.rows.length) return res.status(404).json({ message: 'Postingan tidak ditemukan' });
    const result = await pool.query(
      'INSERT INTO post_comments (post_id, user_id, body) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, text]
    );
    const author = await pool.query('SELECT full_name, avatar, is_verified FROM users WHERE id=$1', [req.user.id]);
    const c = result.rows[0];
    res.status(201).json({
      message: 'Komentar dikirim!',
      comment: {
        id: c.id, post_id: c.post_id, body: c.body, created_at: c.created_at,
        author: { id: req.user.id, full_name: author.rows[0].full_name, avatar: author.rows[0].avatar, is_verified: author.rows[0].is_verified },
      },
    });
    // Notifikasi ke penulis postingan — bukan komentar sendiri (best-effort).
    if (post.rows[0].user_id !== req.user.id) {
      notifyUser(post.rows[0].user_id, {
        type: 'social',
        title: '💬 Komentar baru',
        body: `${author.rows[0].full_name}: ${text.slice(0, 100)}`,
        link: '#feed'
      });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/social/comments/:id — penulis komentar ATAU penulis postingan.
router.delete('/comments/:id', auth, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT pc.user_id AS commenter_id, p.user_id AS post_author_id
       FROM post_comments pc JOIN social_posts p ON p.id = pc.post_id
       WHERE pc.id=$1`, [req.params.id]
    );
    if (!check.rows.length) return res.status(404).json({ message: 'Komentar tidak ditemukan' });
    const { commenter_id, post_author_id } = check.rows[0];
    if (commenter_id !== req.user.id && post_author_id !== req.user.id) {
      return res.status(403).json({ message: 'Tidak diizinkan menghapus komentar ini' });
    }
    await pool.query('DELETE FROM post_comments WHERE id=$1', [req.params.id]);
    res.json({ message: 'Komentar dihapus' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== FOLLOW =====
// POST /api/social/users/:id/follow — idempotent.
router.post('/users/:id/follow', auth, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ message: 'Tidak bisa mengikuti diri sendiri' });
  try {
    const target = await pool.query('SELECT id FROM users WHERE id=$1', [targetId]);
    if (!target.rows.length) return res.status(404).json({ message: 'User tidak ditemukan' });
    const ins = await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT (follower_id, following_id) DO NOTHING',
      [req.user.id, targetId]
    );
    const count = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1', [targetId]);
    res.json({ following: true, followers_count: parseInt(count.rows[0].count) });
    // Notifikasi ke user yang diikuti — hanya untuk follow BARU (best-effort).
    if (ins.rowCount > 0) {
      const follower = await pool.query('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
      notifyUser(targetId, {
        type: 'social',
        title: '👥 Pengikut baru',
        body: `${follower.rows[0]?.full_name || 'Seseorang'} mulai mengikutimu.`,
        link: '#feed'
      });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/social/users/:id/follow — berhenti mengikuti.
router.delete('/users/:id/follow', auth, async (req, res) => {
  const targetId = parseInt(req.params.id);
  try {
    await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, targetId]);
    const count = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1', [targetId]);
    res.json({ following: false, followers_count: parseInt(count.rows[0].count) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/social/users/:id/follow-info — jumlah + status viewer.
// (Dipakai profil publik untuk tombol Ikuti + angka pengikut.)
router.get('/users/:id/follow-info', optionalAuth, async (req, res) => {
  const targetId = parseInt(req.params.id);
  try {
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM follows WHERE following_id=$1) AS followers_count,
         (SELECT COUNT(*) FROM follows WHERE follower_id=$1) AS following_count`,
      [targetId]
    );
    const isFollowing = req.viewerId
      ? (await pool.query('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2', [req.viewerId, targetId])).rows.length > 0
      : false;
    res.json({
      user_id: targetId,
      followers_count: parseInt(counts.rows[0].followers_count),
      following_count: parseInt(counts.rows[0].following_count),
      is_following: isFollowing,
      is_self: req.viewerId === targetId,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/social/users/:id/followers — daftar pengikut.
// GET /api/social/users/:id/following — daftar yang diikuti.
async function followList(req, res, direction) {
  const targetId = parseInt(req.params.id);
  const { limit, offset } = parsePage(req);
  const col = direction === 'followers' ? 'follower_id' : 'following_id';
  const other = direction === 'followers' ? 'following_id' : 'follower_id';
  try {
    const total = await pool.query(`SELECT COUNT(*) FROM follows WHERE ${other}=$1`, [targetId]);
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar, u.role, u.city, u.is_verified,
              (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers_count
       FROM follows f JOIN users u ON u.id = f.${col}
       WHERE f.${other}=$1 ORDER BY f.created_at DESC LIMIT $2 OFFSET $3`,
      [targetId, limit, offset]
    );
    res.json({
      users: result.rows.map(u => ({ ...u, followers_count: parseInt(u.followers_count) })),
      total: parseInt(total.rows[0].count),
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
}
router.get('/users/:id/followers', (req, res) => followList(req, res, 'followers'));
router.get('/users/:id/following', (req, res) => followList(req, res, 'following'));

// ===== DISCOVER — TALENT UNTUK DIIKUTI =====
// GET /api/social/discover — worker paling aktif (transaksi selesai
// terbanyak, lalu pengikut terbanyak). Mengecualikan viewer dan user
// yang sudah diikuti viewer. Publik; bila login, hasilnya difilter.
router.get('/discover', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(12, Math.max(1, parseInt(req.query.limit) || 8));
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar, u.role, u.city, u.is_verified,
              COUNT(DISTINCT l.id) AS listing_count,
              COUNT(DISTINCT t.id) AS completed_transactions,
              COUNT(DISTINCT f.id) AS followers_count
       FROM users u
       LEFT JOIN listings l ON l.user_id = u.id AND l.is_active = true
       LEFT JOIN transactions t ON t.worker_id = u.id AND t.status = 'completed'
       LEFT JOIN follows f ON f.following_id = u.id
       WHERE u.role = 'worker'
         AND ($1::int IS NULL OR u.id <> $1)
         AND ($1::int IS NULL OR NOT EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = $1 AND f2.following_id = u.id))
       GROUP BY u.id
       ORDER BY completed_transactions DESC, followers_count DESC, u.created_at DESC
       LIMIT $2`,
      [req.viewerId, limit]
    );
    res.json(result.rows.map(u => ({
      id: u.id, full_name: u.full_name, avatar: u.avatar, role: u.role,
      city: u.city, is_verified: u.is_verified,
      listing_count: parseInt(u.listing_count),
      completed_transactions: parseInt(u.completed_transactions),
      followers_count: parseInt(u.followers_count),
    })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
