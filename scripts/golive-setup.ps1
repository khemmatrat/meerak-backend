# AQOND Go Live Setup — รันบนเครื่อง 147.50.231.183 (Windows)
# ลำดับ: 1.DB -> 2.Migrations -> 3.Admin -> 4.Test Backend -> 5.Frontend
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== 1. Start Docker (PostgreSQL + Redis) ===" -ForegroundColor Cyan
docker-compose -f docker-compose.golive.yml up -d db redis
Start-Sleep -Seconds 10

Write-Host "=== 2. Run migrations ===" -ForegroundColor Cyan
node backend/scripts/run-migration.js 009 010 035

Write-Host "=== 3. Create Admin (admin@nexus.com / admin123) ===" -ForegroundColor Cyan
node backend/scripts/set-admin-password.js admin123

Write-Host "=== 4. Start Backend + Test Login ===" -ForegroundColor Cyan
docker-compose -f docker-compose.golive.yml up -d backend
Start-Sleep -Seconds 15
$resp = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/admin-login" -Method POST -ContentType "application/json" -Body '{"email":"admin@nexus.com","password":"admin123"}'
if ($resp.access_token) { Write-Host "OK: Login ได้ access_token" -ForegroundColor Green } else { Write-Host "WARN: ตรวจสอบ login เอง" -ForegroundColor Yellow }

Write-Host "=== 5. Start Frontend (Admin, Landing, Mobile) ===" -ForegroundColor Cyan
# VITE_ADMIN_API_URL ตั้งใน docker-compose.golive.yml แล้ว (http://147.50.231.183:3001)
docker-compose -f docker-compose.golive.yml up -d admin landing mobile

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Admin: admin@nexus.com / admin123"
Write-Host "Backend: http://localhost:3001 | Admin: http://localhost:8080 | Landing: 3009 | Mobile: 3000"
