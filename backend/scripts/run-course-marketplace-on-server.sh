#!/usr/bin/env bash
# Course Marketplace — production deploy บน server (รันหลัง sync โค้ดแล้ว)
# Usage (บน server):
#   cd /root/apps && bash backend-1.2/scripts/run-course-marketplace-on-server.sh
#   bash backend-1.2/scripts/run-course-marketplace-on-server.sh --skip-build
set -euo pipefail

APPS="${AQOND_APPS_DIR:-/root/apps}"
BACKEND_DIR="${AQOND_BACKEND_SRC:-backend-1.2}"
COMPOSE="${AQOND_COMPOSE_FILE:-docker-compose.golive.v12.yml}"
CONTAINER="${AQOND_BACKEND_CONTAINER:-aqond-backend}"
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

cd "${APPS}"

echo "=== Course Marketplace Production Deploy ==="
echo "Apps: ${APPS} | Backend src: ${BACKEND_DIR} | Compose: ${COMPOSE}"
echo ""

if [ ! -f "${APPS}/.env" ]; then
  echo "❌ ไม่พบ ${APPS}/.env — ต้องมี DB_PASSWORD, VITE_BACKEND_URL, AWS/PaySo keys"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${APPS}/.env"
set +a

echo "=== 0. Backup DB (quick dump) ==="
BACKUP_DIR="${APPS}/backups"
mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/pre_course_marketplace_${STAMP}.sql.gz"
if docker ps --format '{{.Names}}' | grep -qx aqond-postgres; then
  docker exec aqond-postgres pg_dump -U meera meera_db | gzip > "${BACKUP_FILE}" || {
    echo "⚠️  backup failed — ดำเนินการต่อ (หยุดเองถ้าไม่ยอมรับความเสี่ยง)"
  }
  echo "✓ Backup: ${BACKUP_FILE}"
else
  echo "⚠️  aqond-postgres ไม่รัน — ข้าม backup"
fi
echo ""

echo "=== 1. Migrations 235–246 (course marketplace) ==="
export DB_HOST="${DB_HOST:-127.0.0.1}"
export DB_PORT="${DB_PORT:-5432}"
export DB_DATABASE="${DB_DATABASE:-meera_db}"
export DB_USER="${DB_USER:-meera}"
node "${BACKEND_DIR}/scripts/run-migration.js" --pending-min 235
echo ""

if [ "${SKIP_BUILD}" = true ]; then
  echo "=== 2. Skip build (--skip-build) — restart backend only ==="
  docker compose -f "${COMPOSE}" up -d --force-recreate backend
else
  echo "=== 2. Rebuild backend + mobile + admin ==="
  docker compose -f "${COMPOSE}" build backend
  # mobile/admin ใช้ volume mount — rebuild dist ใน container หรือ build บน host ถ้ามี script
  docker compose -f "${COMPOSE}" up -d --force-recreate backend mobile admin
fi

echo "Waiting for backend..."
sleep 18

echo ""
echo "=== 3. Verify routes in container ==="
docker exec "${CONTAINER}" sh -c 'grep -q course-marketplace/health server.js 2>/dev/null || grep -q registerCourseMarketplaceRoutes server.js' \
  && echo "✓ Course marketplace routes registered in server.js" \
  || echo "⚠️  ตรวจ server.js ไม่เจอ marketplace — sync backend-1.2 ไม่ครบ?"

echo ""
echo "=== 4. Launch checks (inside container) ==="
docker exec "${CONTAINER}" node scripts/run-course-phase18-check.js || {
  echo "❌ Phase 18 check failed"
  exit 1
}

echo ""
echo "=== 5. HTTP smoke (host → backend) ==="
bash "${BACKEND_DIR}/scripts/verify-course-marketplace-production.sh" || {
  echo "❌ Smoke tests failed"
  exit 1
}

echo ""
echo "=== 6. Production sign-off (DB + E2E) ==="
docker exec "${CONTAINER}" node scripts/run-course-production-signoff.js || {
  echo "❌ Production sign-off failed — ดู course-production-signoff.json"
  exit 1
}

echo ""
echo "=== 7. Course payout cron (optional) ==="
if docker exec "${CONTAINER}" test -f scripts/auto-payout-cron.js 2>/dev/null; then
  echo "✓ auto-payout-cron.js present (includes course payout release)"
  echo "  Ensure crontab: docker exec aqond-backend node scripts/auto-payout-cron.js"
else
  echo "⚠️  auto-payout-cron.js not found in container"
fi

echo ""
echo "✅ Course Marketplace deploy complete"
echo "Manual QA: ดู backend/COURSE_MARKETPLACE_DEPLOY.txt § Manual sign-off"
echo "Rollback: restore ${BACKUP_FILE:-backup} + redeploy previous backend-1.2 snapshot"
