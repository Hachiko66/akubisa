-- ============================================================
-- MIGRASI FITUR SOSIAL (FEED / FOLLOW / LIKE / KOMENTAR)
-- AkuBisa (2026-11-23)
-- Jalankan SEKALI di database LIVE (VPS), mis:
--   psql "$DATABASE_URL" -f backend/config/migrate-social.sql
-- atau biarkan auto-migrate server.js (membaca config/schema.sql
-- tiap boot) yang menjalankannya — pernyataan di sini IDEMPOTEN,
-- aman di-run berulang kali. Isi file ini = blok yang sama di
-- backend/config/schema.sql (bagian "FITUR SOSIAL").
--
-- Isi: tabel follows, social_posts, post_likes, post_comments.
-- TIDAK mengubah tabel yang sudah ada, jadi listing, transaksi,
-- dan data user yang sudah ada tetap jalan.
--
-- Catatan FK: portfolio_item_id TIDAK memakai FOREIGN KEY karena
-- tabel portfolio_items dibuat manual di DB live dan tidak
-- didefinisikan di schema.sql; integritasnya dijaga di
-- routes/social.js (hanya item milik penulis yang boleh ditautkan).
-- ============================================================

-- Follow: satu baris per pasangan (follower -> yang diikuti).
CREATE TABLE IF NOT EXISTS follows (
  id SERIAL PRIMARY KEY,
  follower_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Postingan feed.
-- type: 'update' | 'portfolio' (tautkan portfolio_item_id) |
--   'showcase' (tautkan listing_id). deleted_at = soft delete.
CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'update' CHECK (type IN ('update','portfolio','showcase')),
  listing_id INT REFERENCES listings(id) ON DELETE SET NULL,
  portfolio_item_id INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_feed ON social_posts(created_at DESC) WHERE deleted_at IS NULL;

-- Like: satu user hanya bisa like satu postingan sekali.
CREATE TABLE IF NOT EXISTS post_likes (
  post_id INT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

-- Komentar: teks pendek di bawah postingan.
CREATE TABLE IF NOT EXISTS post_comments (
  id SERIAL PRIMARY KEY,
  post_id INT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at ASC);
