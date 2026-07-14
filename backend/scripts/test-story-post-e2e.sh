#!/usr/bin/env bash
# ทดสอบ POST /api/stories ตรงๆ (ข้ามแอป) — รันบนเซิร์ฟเวอร์:
#   export TOKEN='jwt จาก localStorage meerak_token'
#   sed -i 's/\r$//' ~/apps/backend-1.2/scripts/test-story-post-e2e.sh
#   bash ~/apps/backend-1.2/scripts/test-story-post-e2e.sh
set -euo pipefail

if [ -z "${TOKEN:-}" ]; then
  echo "ตั้ง TOKEN ก่อน: export TOKEN='...'"
  exit 1
fi

PNG="/tmp/aqond-story-test-$$.png"
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > "$PNG"

echo "=== A) POST ไป backend ตรง (127.0.0.1:3001) ==="
code_local=$(curl -s -o /tmp/story-post-local.json -w "%{http_code}" \
  -X POST "http://127.0.0.1:3001/api/stories" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "media=@${PNG};type=image/png;filename=story-test.png" \
  -F "media_type=text" \
  -F "text_overlay=e2e-test")
echo "HTTP ${code_local}"
head -c 500 /tmp/story-post-local.json 2>/dev/null || true
echo ""

echo "=== B) POST ผ่าน nginx (https://api.aqond.com) ==="
code_pub=$(curl -s -o /tmp/story-post-pub.json -w "%{http_code}" \
  -X POST "https://api.aqond.com/api/stories" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "media=@${PNG};type=image/png;filename=story-test.png" \
  -F "media_type=text" \
  -F "text_overlay=e2e-test")
echo "HTTP ${code_pub}"
head -c 500 /tmp/story-post-pub.json 2>/dev/null || true
echo ""

echo "=== C) COUNT ใน DB ==="
docker exec aqond-postgres psql -U meera -d meera_db -t -c "SELECT COUNT(*) FROM user_stories;"

echo "=== D) log [stories] ล่าสุด ==="
docker logs aqond-backend --tail 30 2>&1 | grep '\[stories\]' || echo "(ไม่มี log — deploy backend ที่มี console.log [stories])"

rm -f "$PNG"

echo ""
echo "201 ที่ A แต่ 502 ที่ B → แก้ nginx/Cloudflare"
echo "201 ทั้งคู่ แต่แอปยัง 0 แถว → แอปไม่เรียก API / token คนละ user"
echo "4xx/5xx → ดู JSON ด้านบน + docker logs aqond-backend --tail 80"
