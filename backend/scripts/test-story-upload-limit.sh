#!/usr/bin/env bash
# ทดสอบ POST /api/stories
# sed -i 's/\r$//' ~/apps/backend-1.2/scripts/test-story-upload-limit.sh
# export TOKEN='jwt จาก localStorage meerak_token'
# bash ~/apps/backend-1.2/scripts/test-story-upload-limit.sh
set -eu

TOKEN="${TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "export TOKEN='...' ก่อน"
  exit 1
fi

dd if=/dev/zero of=/tmp/t2m.bin bs=1M count=2 status=none 2>/dev/null || dd if=/dev/zero of=/tmp/t2m.bin bs=1048576 count=2

echo "=== A) HTTPS ตรง nginx :443 (ข้าม redirect 301 ของ port 80) ==="
code_a=$(curl -sk -o /dev/null -w "%{http_code}" \
  -X POST "https://127.0.0.1/api/stories" \
  -H "Host: api.aqond.com" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "media=@/tmp/t2m.bin;type=image/jpeg;filename=t.jpg" \
  -F "media_type=text" \
  -F "text_overlay=limit-test")
echo "HTTP ${code_a}  (201=OK, 413=limit, 401=token ผิดแต่ถึง backend)"

echo ""
echo "=== B) HTTPS ผ่าน Cloudflare (public) ==="
code_b=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://api.aqond.com/api/stories" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "media=@/tmp/t2m.bin;type=image/jpeg;filename=t.jpg" \
  -F "media_type=text" \
  -F "text_overlay=limit-test" \
  -L --post301 --post302 2>/dev/null || echo "000")
echo "HTTP ${code_b}"

if [ "$code_b" = "301" ] || [ "$code_b" = "302" ]; then
  echo "redirect ไปที่:"
  curl -sI -X POST "https://api.aqond.com/api/stories" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null | grep -i "^location:" || true
fi

rm -f /tmp/t2m.bin

echo ""
echo "=== nginx sites-enabled ==="
grep -n "listen\|server_name.*api\|client_max_body_size\|return 301" /etc/nginx/sites-enabled/aqond 2>/dev/null | head -30

echo ""
if [ "$code_a" = "201" ]; then
  echo "OK — nginx+backend รับอัปโหลดได้ ลองแชร์สตอรี่จาก app.aqond.com"
elif [ "$code_a" = "413" ]; then
  echo "ยัง 413 ที่ nginx — ตรวจ server block listen 443 ใน /etc/nginx/sites-enabled/aqond"
else
  echo "ดู code ด้านบน — 401=token, 502=backend down"
fi
