#!/usr/bin/env bash
# วินิจฉัยสตอรี่บน production — รันบนเซิร์ฟเวอร์:
#   sed -i 's/\r$//' ~/apps/backend-1.2/scripts/verify-stories-production.sh
#   bash ~/apps/backend-1.2/scripts/verify-stories-production.sh
set -euo pipefail

API="${API_BASE:-https://api.aqond.com}"

echo "=== 0) Backend image มี route /api/stories หรือไม่ ==="
if docker exec aqond-backend sh -c 'grep -q "/api/stories" server.js 2>/dev/null'; then
  echo "OK: server.js มี /api/stories (image น่าจะใหม่พอ)"
else
  echo "FAIL: ใน container ไม่พบ /api/stories — ต้อง sync backend-1.2 จาก repo แล้ว:"
  echo "  cd ~/apps && docker compose -f docker-compose.golive.v12.yml build --no-cache backend"
  echo "  docker compose -f docker-compose.golive.v12.yml up -d --force-recreate backend"
fi

echo ""
echo "=== 0b) GET /health — ต้องมี features.user_stories_api ==="
curl -sf "${API}/health" | head -c 400 || echo "(curl /health ล้มเหลว)"
echo ""

echo ""
echo "=== 0c) GET /api/stories/tray ไม่มี token (ต้องได้ 401 ไม่ใช่ 404) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "${API}/api/stories/tray")
echo "HTTP ${code}"
if [ "$code" = "404" ]; then
  echo "FAIL: 404 = backend เก่า/ไม่มี route — build backend ใหม่"
elif [ "$code" = "401" ]; then
  echo "OK: route มีอยู่ (ต้องการ Bearer token)"
else
  echo "หมายเหตุ: คาด 401 — ได้ ${code}"
fi

echo ""
echo "=== 0d) Backend ชี้ DB ไหน (ต้องตรงกับที่ psql ด้านล่าง) ==="
docker exec aqond-backend sh -c 'echo "USE_DATABASE_URL=${USE_DATABASE_URL:-0}"; echo "DB_HOST=${DB_HOST:-}"; if [ -n "${DATABASE_URL:-}" ]; then echo "DATABASE_URL=set (host จาก URL)"; else echo "DATABASE_URL=unset"; fi'
docker logs aqond-backend 2>&1 | grep "Database: PostgreSQL" | tail -1 || true

echo ""
echo "=== 1) ตาราง user_stories (ใน container aqond-postgres — ถ้า backend ใช้ Neon ตัวเลขนี้อาจไม่ตรง) ==="
docker exec aqond-postgres psql -U meera -d meera_db -c '\dt user_stories'

echo ""
echo "=== 2) สตอรี่ล่าสุด 5 รายการ ==="
docker exec aqond-postgres psql -U meera -d meera_db -c \
  "SELECT id, user_id, media_type, (expires_at > NOW()) AS active, LEFT(COALESCE(media_url,''), 60) AS media_url_prefix, created_at FROM user_stories ORDER BY created_at DESC LIMIT 5;"

echo ""
echo "=== 3) จำนวนแถวทั้งหมด ==="
docker exec aqond-postgres psql -U meera -d meera_db -t -c "SELECT COUNT(*)::int FROM user_stories;"

echo ""
echo "=== 4) Backend log [stories] (หลังแชร์สตอรี่ 1 ครั้ง) ==="
docker logs aqond-backend --tail 300 2>&1 | grep -i '\[stories\]' || echo "(ยังไม่มี [stories] ใน log — แชร์อีกครั้งหลัง deploy backend ล่าสุด)"

echo ""
echo "=== 5) AWS S3 ใน container ==="
docker exec aqond-backend sh -c 'test -n "$AWS_ACCESS_KEY_ID" && test -n "$AWS_SECRET_ACCESS_KEY" && echo "AWS keys: set" || echo "AWS keys: MISSING"'

echo ""
echo "=== เสร็จ ==="
echo "COUNT=0 + ไม่มี [stories] ใน log → คำขอไม่ถึง backend (แอปเก่า / route 404 / แชร์ไม่กดสำเร็จ)"
echo "มี [stories] POST แต่ไม่มี created → ล้มที่ S3 หรือ INSERT — ดู log บรรทัดถัดไป"
echo "มี created ใน log แต่ COUNT=0 → ผิด DB (Neon vs local) — ตรวจ USE_DATABASE_URL ใน ~/apps/.env"
