# Deploy Otomatis AkuBisa — GitHub Actions

Setiap push ke branch `main` repo `Hachiko66/akubisa` otomatis men-deploy ke VPS
(`43.157.202.60`, `/var/www/akubisa`). Workflow: `.github/workflows/deploy.yml`.

## Cara kerja

1. GitHub Actions SSH ke VPS sebagai `ubuntu`.
2. `git fetch origin main` + `git reset --hard origin/main` (kode di VPS selalu
   sama persis dengan `main`; file `.env` di VPS TIDAK tersentuh karena
   gitignored — begitu juga file upload di `frontend/uploads/`).
3. `npm ci --omit=dev` di `backend/` (fallback `npm install` bila lock tidak sinkron).
4. Migrasi database `config/migrate-menus.sql` + `config/migrate-social.sql`
   (idempotent, aman diulang) — dijalankan lewat `node` + `pg` memakai koneksi
   yang sama dengan backend (`.env`: `DATABASE_URL` atau `DB_HOST/DB_USER/
   DB_PASS/DB_NAME/DB_PORT`). Auto-migrate `config/schema.sql` saat boot tetap
   jalan sebagai jaring pengaman kedua.
5. Restart PM2 (`pm2 restart server`, fallback `sudo -n pm2 restart server`,
   fallback start baru bila proses belum ada). Proses backend bernama `server`
   (nama default PM2 dari `server.js`).
6. Health check `http://localhost:3000/api/health`.

## Setup sekali saja (dilakukan pemilik)

### 1. Buat deploy key (di komputer sendiri — Windows PowerShell)

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\akubisa-deploy -N ""
```

Ini menghasilkan `akubisa-deploy` (PRIVATE — jangan dibagikan ke siapa pun,
jangan dikirim lewat chat) dan `akubisa-deploy.pub` (public).

### 2. Tambahkan public key ke VPS

```powershell
type $env:USERPROFILE\.ssh\akubisa-deploy.pub | ssh ubuntu@43.157.202.60 "cat >> ~/.ssh/authorized_keys"
```

Cek: `ssh -i $env:USERPROFILE\.ssh\akubisa-deploy ubuntu@43.157.202.60 "echo ok"`
harus menampilkan `ok` tanpa meminta password.

### 3. Tambahkan 3 secret di GitHub

Repo `Hachiko66/akubisa` → **Settings → Secrets and variables → Actions →
New repository secret**:

| Nama | Isi |
| --- | --- |
| `VPS_HOST` | `43.157.202.60` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | isi file `akubisa-deploy` (private key) SELURUHNYA, termasuk baris `-----BEGIN OPENSSH PRIVATE KEY-----` dan `-----END OPENSSH PRIVATE KEY-----` |

### 4. Isi `.env` di VPS (sekali saja, lewat SSH dari komputer sendiri)

Di `/var/www/akubisa/backend/.env`, pastikan ada (tambahkan bila belum ada):

```
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=465
EMAIL_USER=resend
EMAIL_PASS=<API key Resend, diawali re_ — ambil dari dashboard Resend, JANGAN dari chat>
EMAIL_FROM=AkuBisa <noreply@akubisa.co>
```

Tanpa `EMAIL_PASS`, email verifikasi/reset tetap gagal (server jalan, email
tidak terkirim). Contoh lengkap: `backend/.env.example` di repo.

## Menjalankan / memeriksa deploy

- Otomatis: setiap push ke `main`.
- Manual: repo → **Actions → Deploy AkuBisa ke VPS → Run workflow**.
- Bila sebuah run gagal (mis. secret belum diisi): perbaiki penyebabnya, lalu
  **Actions → run yang gagal → Re-run jobs**.
- Log lengkap tiap langkah (termasuk migrasi, `pm2 list`, log boot, health
  check) ada di halaman run tersebut.

## Catatan penting

- **Pembayaran crypto tetap NONAKTIF sampai go-live disiapkan** (keputusan
  2026-11-23: pembayaran dikerjakan terakhir). Kode Solana/USDC ikut
  ter-deploy, tapi tanpa file keypair escrow (`ESCROW_KEYPAIR_PATH`) dan RPC
  mainnet, endpoint pembayaran/withdraw gagal tertutup (503) dan server tetap
  jalan normal untuk fitur lain. Jangan isi `ESCROW_*` / `SOLANA_NETWORK=
  mainnet-beta` sebelum mengikuti checklist `docs/pembayaran-solana.md` §7+§10.
- Deploy memakai `git reset --hard`: perubahan lokal apa pun di `/var/www/
  akubisa` yang belum di-commit ke `main` akan hilang. Jangan edit kode
  langsung di VPS — ubah di repo, lalu push.
- Bila proses PM2 di VPS berjalan sebagai `root` dan `ubuntu` tidak punya
  `sudo` tanpa password, langkah restart gagal — solusinya: tambahkan
  `ubuntu ALL=(ALL) NOPASSWD: /usr/bin/pm2` via `visudo` (sekali saja, di VPS),
  atau jalankan PM2 backend sebagai `ubuntu`.
