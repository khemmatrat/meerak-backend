# Step 1: Database Setup Verification
# รันบนเครื่อง 147.50.231.183 หลัง docker-compose up -d
$ErrorActionPreference = "Stop"

Write-Host "`n=== 1. Container Status ===" -ForegroundColor Cyan
docker ps -a --filter "name=aqond"

Write-Host "`n=== 2. PostgreSQL Log (Ready to accept connections?) ===" -ForegroundColor Cyan
docker logs aqond-postgres 2>&1 | Select-String -Pattern "ready to accept|listening|database system is ready" | Select-Object -Last 5

Write-Host "`n=== 3. Health Check ===" -ForegroundColor Cyan
docker inspect aqond-postgres --format='{{.State.Health.Status}}' 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host "PostgreSQL Health: $(docker inspect aqond-postgres --format='{{.State.Health.Status}}')" }

Write-Host "`n=== 4. Test Connection (จาก Host) ===" -ForegroundColor Cyan
$env:PGPASSWORD = "meera123"
psql -h 127.0.0.1 -p 5432 -U meera -d meera_db -c "SELECT 1 as ok;" 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host "OK: Database พร้อมรับ connection" -ForegroundColor Green } else { Write-Host "ถ้าไม่มี psql: ใช้ node backend/scripts/run-migration.js 009 เพื่อทดสอบ" }
