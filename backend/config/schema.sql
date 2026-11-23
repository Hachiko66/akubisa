-- USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'worker' CHECK (role IN ('worker', 'client')),
  avatar VARCHAR(255),
  bio TEXT,
  city VARCHAR(100),
  phone VARCHAR(20),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  icon VARCHAR(10),
  listing_count INT DEFAULT 0
);

-- ===== MENU KATEGORI: SUBKATEGORI (2026-11-23) =====
-- Tiga menu utama (Freelance, Produk Digital, Open to Work) punya
-- subkategori sendiri. parent_slug menunjuk ke slug kategori induk
-- (NULL = menu utama / kategori tanpa induk). Slug dibuat BERPREFIX
-- per menu (mis. freelance-marketing, digital-marketing,
-- otw-marketing) agar tetap UNIK secara global — nama yang sama boleh
-- muncul di menu berbeda tanpa bentrok, dan filter lama yang memakai
-- `c.slug = $1` tetap jalan tanpa diubah. Sengaja TIDAK memakai
-- foreign key ke slug induk: admin boleh mengganti nama/slug induk
-- tanpa cascade; integritas dijaga di seed + endpoint admin.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_slug VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_slug);

-- LISTINGS
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id INT REFERENCES categories(id),
  price VARCHAR(100),
  price_unit VARCHAR(50),
  city VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  views INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INT REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INT REFERENCES users(id) ON DELETE CASCADE,
  listing_id INT REFERENCES listings(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  reviewer_id INT REFERENCES users(id) ON DELETE CASCADE,
  reviewed_id INT REFERENCES users(id) ON DELETE CASCADE,
  listing_id INT REFERENCES listings(id) ON DELETE SET NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- SEED CATEGORIES
-- Menu utama (parent_slug NULL) + subkategori per menu.
-- Slug subkategori berprefix per menu supaya unik global.
-- ON CONFLICT (slug) DO NOTHING: baris lama tidak tertimpa saat
-- schema di-run ulang; perubahan nama induk lama ditangani UPDATE
-- di bawah (khusus 'Lowongan Kerja' -> 'Open to Work').
INSERT INTO categories (name, slug, icon, parent_slug) VALUES
  ('Edukasi & Course', 'edukasi', '📚', NULL),
  ('Freelance', 'freelance', '💼', NULL),
  ('Properti & Sewa', 'properti', '🏠', NULL),
  ('Transportasi', 'transportasi', '🚗', NULL),
  ('Produk Digital', 'digital', '📦', NULL),
  ('Open to Work', 'lowongan', '🙋', NULL),
  -- Freelance
  ('Web Developer', 'freelance-web-developer', '💻', 'freelance'),
  ('Design Grafis', 'freelance-design-grafis', '🎨', 'freelance'),
  ('Akunting', 'freelance-akunting', '🧮', 'freelance'),
  ('Marketing', 'freelance-marketing', '📣', 'freelance'),
  ('Konten Kreator', 'freelance-konten-kreator', '🎬', 'freelance'),
  -- Produk Digital
  ('AI', 'digital-ai', '🤖', 'digital'),
  ('Design Grafis', 'digital-design-grafis', '🎨', 'digital'),
  ('Web Developer', 'digital-web-developer', '💻', 'digital'),
  ('Marketing', 'digital-marketing', '📣', 'digital'),
  ('Crypto', 'digital-crypto', '₿', 'digital'),
  ('Trading', 'digital-trading', '📈', 'digital'),
  ('Memasak', 'digital-memasak', '🍳', 'digital'),
  ('Lainnya', 'digital-lainnya', '📦', 'digital'),
  -- Open to Work
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

-- Rename kategori induk lama di DB yang sudah berisi seed lama
-- (id/slug 'lowongan' dipertahankan agar listing & job request lama
-- tidak putus; hanya nama + ikon yang berubah).
UPDATE categories SET name='Open to Work', icon='🙋'
WHERE slug='lowongan' AND name='Lowongan Kerja';

-- Email verification & password reset tokens
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link VARCHAR(255),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
-- Kolom aksi: dipakai notif "Pekerjaan Selesai" (action='approve' +
-- metadata {trx_id}) supaya klik notifikasi langsung menyetujui
-- pekerjaan lalu mengarah ke pelunasan. (Dulu insert ini gagal
-- karena kolomnya belum ada — lihat routes/transactions.js.)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id INT REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  reported_listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  reason VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Featured listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS featured_until TIMESTAMP;

-- Admin role
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('worker','client','admin'));

-- ===== PERBAIKAN PEMBAYARAN (2026-11-23) =====
-- Tabel/kolom di bawah ini WAJIB juga ada di DB live (jalankan file ini
-- sekali di VPS, atau biarkan auto-migrate di server.js yang
-- menjalankannya tiap boot). Tanpa migrasi ini, refund/auto-release/
-- pembelian digital berbayar akan gagal di query pertama yang menyentuhnya.

-- Kredit klien: kewajiban platform saat dispute diputuskan 'refund'.
-- Tidak ada lagi gateway fiat yang bisa me-refund otomatis (Pakasir
-- tutup; Duitku/Xendit dihapus), jadi uang tidak keluar lewat gateway;
-- kewajiban dicatat di sini (status 'available') dan admin
-- menindaklanjuti pencairannya sampai pemakaian kredit di checkout ada.
CREATE TABLE IF NOT EXISTS client_credits (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  transaction_id INT,
  amount INT NOT NULL CHECK (amount > 0),
  reason VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available','applied','voided')),
  created_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_client_credits_user ON client_credits(user_id, status);

-- Pembelian produk digital. Tabel ini dulu hanya ada di DB live (dibuat
-- manual); definisi lengkapnya ditambahkan agar fresh boot ikut benar.
-- status: 'pending' (jumlah USDC terkunci, belum bayar) | 'paid'
-- (verifikasi on-chain lolos). Download HANYA boleh untuk status='paid'.
CREATE TABLE IF NOT EXISTS digital_purchases (
  id SERIAL PRIMARY KEY,
  buyer_id INT REFERENCES users(id) ON DELETE CASCADE,
  listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  amount INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  order_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  UNIQUE(buyer_id, listing_id)
);
-- Kolom baru untuk tabel digital_purchases yang sudah ada di DB live:
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS order_id VARCHAR(100);
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Kolom baru untuk tabel transactions yang sudah ada di DB live:
-- auto_released: true bila transaksi selesai oleh job auto-release
--   (bukan oleh pelunasan client), untuk audit.
-- refunded_at: kapan dispute diputuskan refund.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS auto_released BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;

-- ===== PEMBAYARAN SOLANA + USDC (2026-11-23) =====
-- Semua gateway fiat (Pakasir, Duitku, Xendit) DIHAPUS dari kode.
-- Satu-satunya rel bayar: transfer USDC ke wallet escrow platform,
-- diverifikasi on-chain (lihat backend/utils/solana.js dan
-- docs/pembayaran-solana.md).
-- Aturan: harga di sistem tetap Rupiah; saat transaksi/order dibuat,
-- kurs IDR->USDC DIKUNCI dan jumlah USDC (micro-USDC, 1 USDC =
-- 1.000.000) disimpan di baris terkait. Verifikasi on-chain harus
-- cocok dengan jumlah yang terkunci itu. Fee platform 5%
-- dibebankan ke client di atas harga worker (sempat 10% di ronde
-- crypto, dikembalikan ke 5% per keputusan produk 2026-11-23).
-- Kolom xendit_dp_invoice_id / xendit_final_invoice_id dan
-- duitku_reference / duitku_order_id di tabel transactions TIDAK lagi
-- ditulis (peninggalan gateway lama). Dibiarkan di DB live sebagai
-- kolom mati — jangan dipakai. Bukti bayar sekarang adalah signature
-- on-chain di kolom *_tx_signature + tabel payment_signatures.

-- Kolom USDC untuk tabel transactions:
-- dp_usdc_amount / final_usdc_amount: jumlah terkunci (micro-USDC).
-- usdc_rate_locked: kurs Rp per 1 USDC saat transaksi dibuat.
-- rate_locked_at: kapan kurs dikunci.
-- dp_tx_signature / final_tx_signature: signature Solana pembayaran.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dp_usdc_amount BIGINT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS final_usdc_amount BIGINT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS usdc_rate_locked NUMERIC(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dp_tx_signature VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS final_tx_signature VARCHAR(100);

-- Idempotency signature: satu signature hanya boleh dipakai sekali di
-- SELURUH sistem (DP/final, produk digital, boost, withdraw manual).
-- Diisi oleh utils/solana.js reserveSignature() di dalam transaksi DB
-- yang sama dengan perubahan status.
CREATE TABLE IF NOT EXISTS payment_signatures (
  signature VARCHAR(100) PRIMARY KEY,
  context VARCHAR(50) NOT NULL,
  ref_id INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alamat payout Solana worker (dompet USDC, mis. Phantom). Diisi worker
-- di profil; wajib ada sebelum withdraw. TIDAK ditampilkan publik.
ALTER TABLE users ADD COLUMN IF NOT EXISTS solana_address VARCHAR(64);

-- Kolom USDC untuk pembelian produk digital:
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS usdc_amount BIGINT;
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS rate_idr_per_usdc NUMERIC(12,2);
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS tx_signature VARCHAR(100);

-- Kolom USDC untuk order boost:
ALTER TABLE boost_orders ADD COLUMN IF NOT EXISTS usdc_amount BIGINT;
ALTER TABLE boost_orders ADD COLUMN IF NOT EXISTS rate_idr_per_usdc NUMERIC(12,2);
ALTER TABLE boost_orders ADD COLUMN IF NOT EXISTS tx_signature VARCHAR(100);

-- Kolom USDC untuk withdraw (bank_name/account_number/account_name
-- TIDAK lagi ditulis — peninggalan transfer bank manual):
-- solana_address: snapshot alamat payout saat request dibuat.
-- rate_idr_per_usdc + usdc_estimate: kurs & estimasi USDC saat request
--   (tampilan saja; jumlah final dikunci saat admin approve/mengirim).
-- usdc_amount: jumlah USDC yang BENAR-BENAR dikirim (saat approve).
-- tx_signature: signature transfer USDC dari escrow ke worker.
-- paid_at: kapan USDC terkirim.
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS solana_address VARCHAR(64);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS rate_idr_per_usdc NUMERIC(12,2);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS usdc_estimate BIGINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS usdc_amount BIGINT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS tx_signature VARCHAR(100);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- ===== PENDAPATAN (2026-11-23) =====
-- Keran pemasukan platform (lihat backend/utils/revenue.js — satu
-- sumber kebenaran angka-angka di bawah; migrasi live-DB yang sama
-- ada di backend/config/migrate-revenue.sql):
-- 1. Kunci kurs IDR->USDC berlaku 24 JAM sejak rate_locked_at
--    (RATE_LOCK_TTL_MS). verify-payment menolak kunci kedaluwarsa.
-- 2. Fee produk digital 5% (pembeli bayar harga + fee, penjual
--    terima harga penuh; fee mengendap di escrow).
-- 3. Biaya penarikan 1% (min Rp1.000, maks Rp10.000); member Pro
--    bebas biaya penarikan.
-- 4. Membership Pro Rp49.000 / 30 hari (tabel subscriptions).

-- 1. Kunci kurs 24 jam untuk boost + produk digital (transactions
--    sudah punya rate_locked_at). Baris lama diisi dari created_at.
ALTER TABLE boost_orders ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP;
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP;
UPDATE boost_orders SET rate_locked_at = created_at WHERE rate_locked_at IS NULL;
UPDATE digital_purchases SET rate_locked_at = created_at WHERE rate_locked_at IS NULL;

-- 2. Fee produk digital 5%
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS platform_fee INT NOT NULL DEFAULT 0;
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS total_amount INT;
UPDATE digital_purchases SET total_amount = amount WHERE total_amount IS NULL;

-- 3. Biaya penarikan 1% (min Rp1.000, maks Rp10.000; 0 untuk Pro)
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_rp INT NOT NULL DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_usdc BIGINT;

-- 4. Membership Pro (Rp49.000 / 30 hari)
--    status: 'pending' (menunggu verifikasi bayar USDC) | 'active'
--    | 'expired' (tidak dipakai aktif — kedaluwarsa dibaca dari
--    expires_at).
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired')),
  amount INT NOT NULL DEFAULT 49000,
  usdc_amount BIGINT,
  rate_idr_per_usdc NUMERIC(12,2),
  rate_locked_at TIMESTAMP,
  started_at TIMESTAMP,
  expires_at TIMESTAMP,
  tx_signature VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, plan, status, expires_at);

-- ===== FITUR SOSIAL: FEED, FOLLOW, LIKE, KOMENTAR (2026-11-23) =====
-- AkuBisa sebagai media sosial: user posting update skill / pamer
-- karya, follow talent, like & komentar. TIDAK ada upload gambar di
-- ronde ini — postingan hanya bisa menautkan penawaran (listing) atau
-- item portfolio yang SUDAH ADA (foto ditampilkan dari item itu).
-- Semua pernyataan IDEMPOTEN (IF NOT EXISTS / ON CONFLICT) dan ikut
-- auto-migrate server.js tiap boot. Migrasi live-DB yang sama ada di
-- backend/config/migrate-social.sql (jalankan sekali di VPS).
--
-- Catatan FK: portfolio_item_id TIDAK memakai FOREIGN KEY karena tabel
-- portfolio_items dibuat manual di DB live dan TIDAK didefinisikan di
-- schema.sql ini; integritasnya dijaga di routes/social.js (hanya
-- item milik penulis yang boleh ditautkan, dan item yang dihapus
-- membuat tautan jadi NULL saat dibaca).

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
-- type: 'update' (update skill/status) | 'portfolio' (pamer karya,
--   wajib tautkan portfolio_item_id) | 'showcase' (pamer penawaran,
--   wajib tautkan listing_id).
-- deleted_at: soft delete — baris tetap ada, tidak tampil di feed.
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

