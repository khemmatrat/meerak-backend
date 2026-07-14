#!/bin/bash
# AQOND Go Live Setup — รันบนเครื่อง 147.50.231.183
# โครงสร้าง /root/apps: backend | admin | landing | (mobile root)
# ก่อนรัน: ต้อง rename nexus-admin-core->admin, landing-aqond->landing (ดู SSH_GOLIVE_COMMANDS.txt)
# ลำดับ: 1.DB -> 2.Migrations -> 3.Admin -> 4.Test Backend -> 5.Frontend
set -e
cd "$(dirname "$0")/.."

echo "=== 1. Start Docker (PostgreSQL + Redis) ==="
docker-compose -f docker-compose.golive.yml up -d db redis
sleep 10

echo "=== 2. Run migrations ==="
node backend/scripts/run-migration.js 006 007 008 009 010 035

echo "=== 3. Create Admin (admin@nexus.com / admin123) ==="
node backend/scripts/set-admin-password.js admin123

echo "=== 4. Start Backend + Test Login ==="
docker-compose -f docker-compose.golive.yml up -d backend
sleep 15
if curl -s -X POST http://localhost:3001/api/auth/admin-login -H "Content-Type: application/json" -d '{"email":"admin@nexus.com","password":"admin123"}' | grep -q access_token; then
  echo "OK: Login ได้ access_token"
else
  echo "WARN: ตรวจสอบ login เอง"
fi

echo "=== 5. Start Frontend (Admin, Landing, Mobile) ==="
# VITE_ADMIN_API_URL ตั้งใน docker-compose.golive.yml แล้ว (http://147.50.231.183:3001)
docker-compose -f docker-compose.golive.yml up -d admin landing mobile

echo "=== Done ==="
echo "Admin: admin@nexus.com / admin123"
echo "Backend: http://localhost:3001 | Admin: http://localhost:8080 | Landing: 3009 | Mobile: 3000"
