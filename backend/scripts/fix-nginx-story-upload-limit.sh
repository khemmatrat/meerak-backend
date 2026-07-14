#!/usr/bin/env bash
# แก้ nginx upload limit — แก้เฉพาะไฟล์ใน sites-enabled (ไม่แตะ .bak)
# sed -i 's/\r$//' ~/apps/backend-1.2/scripts/fix-nginx-story-upload-limit.sh
# bash ~/apps/backend-1.2/scripts/fix-nginx-story-upload-limit.sh
set -eu

echo "=== sites-enabled ==="
ls -la /etc/nginx/sites-enabled/

if [ -L /etc/nginx/sites-enabled/aqond-api.conf ]; then
  echo "ลบ symlink ซ้ำ aqond-api.conf"
  rm -f /etc/nginx/sites-enabled/aqond-api.conf
fi

for f in /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  case "$f" in
    *.bak*) continue ;;
  esac
  if grep -q "api.aqond.com" "$f" 2>/dev/null; then
    if grep -q "client_max_body_size" "$f"; then
      echo "OK มี client_max_body_size แล้ว: $f"
    else
      cp -a "$f" "${f}.bak.$(date +%Y%m%d%H%M%S)"
      sed -i "/server_name.*api.aqond.com/a\\    client_max_body_size 100m;" "$f"
      echo "เพิ่ม client_max_body_size ใน: $f"
    fi
  fi
done

nginx -t && systemctl reload nginx
echo "เสร็จ — อย่าวาง output สคริปต์กลับเข้า terminal"
