#!/usr/bin/env bash
# แก้ Cloudflare Error 526 — origin ไม่มี SSL สำหรับ app.aqond.com
# หลังตั้ง Cloudflare เป็น Full (strict) ต้องมี cert บน nginx ทุก subdomain
#
# sed -i 's/\r$//' ~/apps/backend-1.2/scripts/fix-cloudflare-526-ssl.sh
# bash ~/apps/backend-1.2/scripts/fix-cloudflare-526-ssl.sh
set -eu

echo "=== 526 = Cloudflare Full (strict) แต่ origin ไม่มี cert ถูกต้อง ==="
echo "=== ตรวจ port 443 และ cert ปัจจุบัน ==="
ss -tlnp | grep ':443' || echo "(ยังไม่ฟัง 443 — ต้องรัน certbot)"
ls -la /etc/letsencrypt/live/ 2>/dev/null || true

echo ""
echo "=== ออก cert ให้ app (และ subdomain อื่นถ้ายังไม่มี) ==="
echo "รัน certbot ทีละโดเมน (ตอบ email / agree):"

DOMAINS="app.aqond.com aqond.com www.aqond.com admin.aqond.com"
for d in $DOMAINS; do
  if [ -d "/etc/letsencrypt/live/${d}" ]; then
    echo "  มี cert แล้ว: ${d}"
  else
    echo "  ขอ cert: ${d}"
    certbot --nginx -d "$d" --non-interactive --agree-tos --register-unsafely-without-email || \
      certbot --nginx -d "$d"
  fi
done

echo ""
echo "=== ตรวจ nginx ==="
nginx -t
systemctl reload nginx

echo ""
echo "=== ทดสอบ SSL origin (จากเซิร์ฟเวอร์) ==="
for d in app.aqond.com api.aqond.com; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "https://127.0.0.1/" -H "Host: ${d}" || echo "000")
  echo "${d} → HTTPS localhost HTTP ${code}"
done

echo ""
echo "=== เสร็จ ==="
echo "เปิด https://app.aqond.com อีกครั้ง — 526 ควรหาย"
echo "Cloudflare SSL/TLS ควรเป็น Full (strict)"
