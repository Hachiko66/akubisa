-- ============================================================
-- MIGRASI NOTIFIKASI — tambah kolom action + metadata
-- ============================================================
-- Dipakai notif "Pekerjaan Selesai" (action='approve' + metadata
-- {trx_id}) supaya klik notifikasi langsung menyetujui pekerjaan
-- lalu mengarah ke pelunasan (lihat routes/transactions.js dan
-- frontend/js/features.js clickNotif).
-- Idempotent: aman dijalankan berkali-kali.
-- Cara jalan: psql "$DATABASE_URL" -f backend/config/migrate-notifications.sql
-- (atau biarkan server.js menjalankan schema.sql saat boot —
-- kolom yang sama juga ditambahkan di sana).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
