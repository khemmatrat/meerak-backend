#!/bin/bash
# แก้ YAML ใน docker-compose.golive.v12.yml (mobile environment — ค่ามี : และ https://)
set -euo pipefail
COMPOSE="${1:-docker-compose.golive.v12.yml}"
cd "$(dirname "$0")/.."

python3 <<'PY'
from pathlib import Path
import re

path = Path("docker-compose.golive.v12.yml")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        r'VITE_BACKEND_URL: \$\{VITE_BACKEND_URL:-https://api\.aqond\.com\}',
        'VITE_BACKEND_URL: "${VITE_BACKEND_URL:-https://api.aqond.com}"',
    ),
    (
        r'VITE_BACKEND_URL_HTTPS: \$\{VITE_BACKEND_URL_HTTPS:-https://api\.aqond\.com\}',
        'VITE_BACKEND_URL_HTTPS: "${VITE_BACKEND_URL_HTTPS:-https://api.aqond.com}"',
    ),
    (
        r'VITE_FIREBASE_API_KEY: \$\{VITE_FIREBASE_API_KEY(?::-)?\}',
        'VITE_FIREBASE_API_KEY: "${VITE_FIREBASE_API_KEY:-}"',
    ),
    (
        r'VITE_FIREBASE_AUTH_DOMAIN: \$\{VITE_FIREBASE_AUTH_DOMAIN:-[^}]+\}',
        'VITE_FIREBASE_AUTH_DOMAIN: "${VITE_FIREBASE_AUTH_DOMAIN:-aqond-production.firebaseapp.com}"',
    ),
    (
        r'VITE_FIREBASE_PROJECT_ID: \$\{VITE_FIREBASE_PROJECT_ID:-[^}]+\}',
        'VITE_FIREBASE_PROJECT_ID: "${VITE_FIREBASE_PROJECT_ID:-aqond-production}"',
    ),
    (
        r'VITE_FIREBASE_STORAGE_BUCKET: \$\{VITE_FIREBASE_STORAGE_BUCKET:-[^}]+\}',
        'VITE_FIREBASE_STORAGE_BUCKET: "${VITE_FIREBASE_STORAGE_BUCKET:-aqond-production.firebasestorage.app}"',
    ),
    (
        r'VITE_FIREBASE_MESSAGING_SENDER_ID: \$\{VITE_FIREBASE_MESSAGING_SENDER_ID:-[^}]+\}',
        'VITE_FIREBASE_MESSAGING_SENDER_ID: "${VITE_FIREBASE_MESSAGING_SENDER_ID:-187301416431}"',
    ),
    (
        r'VITE_FIREBASE_APP_ID: "?\$\{VITE_FIREBASE_APP_ID:-1:187301416431:web:774a67a1d8554faccbfa1a\}"?',
        'VITE_FIREBASE_APP_ID: "${VITE_FIREBASE_APP_ID:-1:187301416431:web:774a67a1d8554faccbfa1a}"',
    ),
]

out = text
for pat, rep in replacements:
    out2 = re.sub(pat, rep, out)
    out = out2

path.write_text(out, encoding="utf-8")
print("Patched", path)
PY

docker compose -f "$COMPOSE" config --quiet && echo "YAML OK"
