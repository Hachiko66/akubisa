#!/usr/bin/env bash
# Deploy manual AkuBisa di VPS — jalankan dari /var/www/akubisa:
#   bash scripts/deploy.sh
# Langkah yang sama dengan workflow GitHub Actions
# (.github/workflows/deploy.yml). Idempotent, aman diulang.
# .env di backend/ TIDAK disentuh (gitignored), begitu juga file
# upload di frontend/uploads/.
set -euo pipefail

echo "===== Deploy AkuBisa mulai: $(date -u +%FT%TZ) ====="
cd "$(dirname "$0")/.." || { echo "ERROR: jalankan dari repo AkuBisa"; exit 1; }
if [ ! -d .git ]; then echo "ERROR: bukan git checkout"; exit 1; fi

echo "--- 1. Tarik kode terbaru dari main ---"
git fetch origin main
git reset --hard origin/main
echo "Commit ter-deploy: $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"

cd backend
echo "--- 2. Install dependensi backend ---"
npm ci --omit=dev || npm install --omit=dev

echo "--- 3. Migrasi database (menu + sosial) ---"
for v in DATABASE_URL DB_HOST DB_USER DB_PASSWORD DB_NAME DB_PORT; do
  val=$(grep -E "^$v=" .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  [ -n "$val" ] && export "$v=$val"
done
if [ -n "${DATABASE_URL:-}" ] || [ -n "${DB_NAME:-}" ]; then
  echo "Mode koneksi: $([ -n "${DATABASE_URL:-}" ] && echo DATABASE_URL || echo DB_HOST/DB_USER/DB_PASSWORD/DB_NAME)"
  node -e "
    const { Client } = require('pg');
    const fs = require('fs');
    (async () => {
      const cfg = process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
        : { host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT || 5432 };
      const c = new Client(cfg);
      await c.connect();
      for (const f of ['config/migrate-menus.sql', 'config/migrate-social.sql', 'config/migrate-notifications.sql']) {
        console.log('Migrasi:', f);
        await c.query(fs.readFileSync(f, 'utf8'));
      }
      await c.end();
      console.log('Migrasi selesai.');
    })().catch(e => { console.error('MIGRASI GAGAL:', e.message); process.exit(1); });
  "
else
  echo "INFO: tidak ada DATABASE_URL/DB_NAME di backend/.env — migrasi file dilewati. Auto-migrate schema.sql saat boot tetap jalan."
fi

echo "--- 4. Restart backend (PM2) ---"
if pm2 restart server 2>/dev/null; then
  echo "PM2 restart OK (user ubuntu)"
elif sudo -n pm2 restart server 2>/dev/null; then
  echo "PM2 restart OK (sudo)"
else
  echo "Proses 'server' tidak ditemukan — start baru..."
  pm2 start /var/www/akubisa/backend/server.js --name server --cwd /var/www/akubisa/backend || sudo -n pm2 start /var/www/akubisa/backend/server.js --name server --cwd /var/www/akubisa/backend
fi
sleep 6

echo "--- 5. Status + log boot ---"
pm2 list || sudo -n pm2 list || true
pm2 logs server --lines 25 --nostream 2>/dev/null || sudo -n pm2 logs server --lines 25 --nostream 2>/dev/null || true

echo "--- 6. Health check ---"
curl -fsS -m 10 http://localhost:3000/api/health && echo "HEALTH OK" || echo "WARNING: /api/health tidak menjawab — cek log di atas dan https://akubisa.co"
echo "===== Deploy selesai ====="
