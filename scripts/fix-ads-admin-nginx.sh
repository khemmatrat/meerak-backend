#!/bin/bash
# แก้ ads-admin.aqond.com ให้ /api/ ส่งต่อ backend (port 3001)
# รันบน server: bash /root/apps/scripts/fix-ads-admin-nginx.sh
set -euo pipefail

patch_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -q "server_name ads-admin.aqond.com" "$f" && ! grep -q "ads-admin.aqond.com" "$f" -A20 | grep -q "location /api/"; then
    echo "Patching $f"
    python3 - "$f" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8", errors="replace").read()
needle = "server_name ads-admin.aqond.com;"
if needle not in text or "location /api/" in text.split(needle, 1)[1].split("server {", 1)[0]:
    sys.exit(0)
insert = '''    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        include proxy_params;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

'''
idx = text.index(needle)
loc = text.find("    location / {", idx)
if loc == -1:
    sys.exit("no location / block for ads-admin in " + path)
text = text[:loc] + insert + text[loc:]
open(path, "w", encoding="utf-8").write(text)
print("OK:", path)
PY
  fi
}

for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*; do
  patch_file "$f"
done

nginx -t
systemctl reload nginx

echo "Verify:"
curl -s -o /dev/null -w "ads-admin /api POST -> HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"x","password":"y"}' \
  https://ads-admin.aqond.com/api/auth/admin-login
curl -sI -X POST -H "Content-Type: application/json" -d '{"email":"x","password":"y"}' \
  https://ads-admin.aqond.com/api/auth/admin-login | grep -i content-type || true
echo "(ต้องเป็น application/json ไม่ใช่ text/html)"
