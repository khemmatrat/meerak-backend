#!/usr/bin/env bash
# ติดตั้ง/อัปเดต nginx สำหรับ api.aqond.com + client_max_body_size 100m
# รันบนเซิร์ฟเวอร์: bash ~/apps/backend-1.2/scripts/setup-nginx-aqond-api.sh
set -euo pipefail

CONF_DST="/etc/nginx/sites-available/aqond-api.conf"
CONF_LINK="/etc/nginx/sites-enabled/aqond-api.conf"
SRC="${HOME}/apps/nginx-aqond-fix.conf"

echo "=== 1) ตรวจสภาพปัจจุบัน ==="
command -v nginx >/dev/null 2>&1 && nginx -v || echo "nginx: ยังไม่ติดตั้ง"
ss -tlnp 2>/dev/null | grep -E ':80|:443|:3001' || true
curl -sI https://api.aqond.com/health 2>/dev/null | head -5 || true

echo ""
echo "=== 2) ติดตั้ง nginx (ถ้ายังไม่มี) ==="
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi

echo ""
echo "=== 3) เขียน config api.aqond.com (HTTP → backend :3001, 100MB) ==="
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > "$CONF_DST" <<'NGINX'
# AQOND API — สร้างโดย setup-nginx-aqond-api.sh
# หลัง certbot: เพิ่ม listen 443 ssl ใน server block นี้ หรือรัน certbot --nginx -d api.aqond.com

server {
    listen 80;
    listen [::]:80;
    server_name api.aqond.com;
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 75s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
NGINX

ln -sf "$CONF_DST" "$CONF_LINK"

# ลบ default ที่ชน server_name _ ถ้ามี
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

echo ""
echo "=== 4) ทดสอบและ reload nginx ==="
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl start nginx

echo ""
echo "=== 5) ถ้ายังไม่มี SSL — รัน (ครั้งเดียว) ==="
echo "  certbot --nginx -d api.aqond.com"
echo "  แล้วเปิดไฟล์ $CONF_DST ตรวจว่า block listen 443 มี client_max_body_size 100m;"

echo ""
echo "=== 6) Cloudflare (ถ้าใช้) ==="
echo "  DNS api → IP เซิร์ฟเวอร์, Proxy เปิด (ส้ม) ได้"
echo "  ถ้ายัง 413 หลัง nginx OK → ลอง Grey cloud (DNS only) ชั่วคราวเพื่อทดสอบ"

echo ""
echo "=== เสร็จ ==="
echo "ทดสอบ: curl -sI http://127.0.0.1/health -H 'Host: api.aqond.com' | head -3"
