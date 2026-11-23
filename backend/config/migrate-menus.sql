-- ============================================================
-- MIGRASI MENU KATEGORI — AkuBisa (2026-11-23)
-- Jalankan SEKALI di database LIVE (VPS), mis:
--   psql "$DATABASE_URL" -f backend/config/migrate-menus.sql
-- atau biarkan auto-migrate server.js (membaca config/schema.sql
-- tiap boot) yang menjalankannya — pernyataan di sini IDEMPOTEN,
-- aman di-run berulang kali.
--
-- Isi: tambah kolom parent_slug + 23 subkategori baru untuk tiga
-- menu (Freelance, Produk Digital, Open to Work) + rename
-- 'Lowongan Kerja' -> 'Open to Work'. TIDAK mengubah id/slug
-- kategori lama, jadi listing & job request yang sudah ada
-- (category_id) tetap jalan.
-- ============================================================

-- 1. Kolom parent_slug (NULL = menu utama / tanpa induk)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_slug VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_slug);

-- 2. Rename induk lama (slug + id dipertahankan)
UPDATE categories SET name='Open to Work', icon='🙋'
WHERE slug='lowongan' AND name='Lowongan Kerja';

-- 3. Seed subkategori (ON CONFLICT DO NOTHING = aman di-run ulang)
INSERT INTO categories (name, slug, icon, parent_slug) VALUES
  ('Web Developer', 'freelance-web-developer', '💻', 'freelance'),
  ('Design Grafis', 'freelance-design-grafis', '🎨', 'freelance'),
  ('Akunting', 'freelance-akunting', '🧮', 'freelance'),
  ('Marketing', 'freelance-marketing', '📣', 'freelance'),
  ('Konten Kreator', 'freelance-konten-kreator', '🎬', 'freelance'),
  ('AI', 'digital-ai', '🤖', 'digital'),
  ('Design Grafis', 'digital-design-grafis', '🎨', 'digital'),
  ('Web Developer', 'digital-web-developer', '💻', 'digital'),
  ('Marketing', 'digital-marketing', '📣', 'digital'),
  ('Crypto', 'digital-crypto', '₿', 'digital'),
  ('Trading', 'digital-trading', '📈', 'digital'),
  ('Memasak', 'digital-memasak', '🍳', 'digital'),
  ('Lainnya', 'digital-lainnya', '📦', 'digital'),
  ('Marketing', 'otw-marketing', '📣', 'lowongan'),
  ('Design Grafis', 'otw-design-grafis', '🎨', 'lowongan'),
  ('Akunting', 'otw-akunting', '🧮', 'lowongan'),
  ('Admin', 'otw-admin', '🗂️', 'lowongan'),
  ('Customer Service', 'otw-customer-service', '🎧', 'lowongan'),
  ('Social Media Manager', 'otw-social-media-manager', '📱', 'lowongan'),
  ('Konten Kreator', 'otw-konten-kreator', '🎬', 'lowongan'),
  ('Community Builder', 'otw-community-builder', '👥', 'lowongan'),
  ('Analis', 'otw-analis', '📊', 'lowongan'),
  ('AI Expert', 'otw-ai-expert', '🤖', 'lowongan')
ON CONFLICT (slug) DO NOTHING;

-- 4. Verifikasi (cek hasil setelah jalan):
-- SELECT slug, name, parent_slug FROM categories ORDER BY parent_slug NULLS FIRST, name;
-- Harus ada 6 baris parent_slug NULL + 23 baris subkategori.
