#!/usr/bin/env bash
# รันบน server หลัง SSH: bash /root/apps/backend-1.2/scripts/run-prb-on-server.sh
# หรือ copy จาก repo: scripts/run-prb-on-server.sh
set -euo pipefail

APPS="${AQOND_APPS_DIR:-/root/apps}"
COMPOSE="${AQOND_COMPOSE_FILE:-docker-compose.golive.v12.yml}"
cd "${APPS}"

echo "=== 1. Migration 213 ==="
set -a
[ -f .env ] && . ./.env
set +a
export DB_HOST=127.0.0.1
export DB_PORT="${DB_PORT:-5432}"
export DB_DATABASE="${DB_DATABASE:-meera_db}"
export DB_USER="${DB_USER:-meera}"
node backend-1.2/scripts/run-migration.js 213

echo "=== 2. Rebuild backend (ถ้ายังไม่ได้ build image ใหม่) ==="
docker compose -f "${COMPOSE}" build backend
docker compose -f "${COMPOSE}" up -d backend
sleep 15

echo "=== 3. Install hourly cron ==="
chmod +x backend-1.2/scripts/setup-prb-cron-docker.sh
bash backend-1.2/scripts/setup-prb-cron-docker.sh install

echo "=== 4. Test run ==="
docker exec aqond-backend node scripts/prb-order-lifecycle-cron.js
bash backend-1.2/scripts/setup-prb-cron-docker.sh status

echo "=== Done ==="
