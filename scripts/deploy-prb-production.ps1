# =============================================================================
# Deploy PRB module บน production (147.50.231.183 / Docker v12)
# - sync backend → backend-1.2
# - rebuild backend image
# - migration 213
# - ติดตั้ง cron ทุก 1 ชม.
# =============================================================================
# Usage (จากเครื่อง dev ที่มี SSH key ไป root@147.50.231.183):
#   .\scripts\deploy-prb-production.ps1
#   .\scripts\deploy-prb-production.ps1 -SkipBuild   # มี image แล้ว รันแค่ migration+cron
#   .\scripts\deploy-prb-production.ps1 -CronOnly
# =============================================================================

param(
    [switch]$SkipBuild,
    [switch]$CronOnly,
    [switch]$MigrationOnly
)

$ErrorActionPreference = "Stop"
$SERVER = "root@147.50.231.183"
$REMOTE = "/root/apps"
$COMPOSE = "docker-compose.golive.v12.yml"
$PROJECT_ROOT = Join-Path $PSScriptRoot ".."

Set-Location $PROJECT_ROOT

function Invoke-Remote([string]$Cmd) {
    Write-Host ">> ssh $Cmd" -ForegroundColor DarkGray
    ssh $SERVER $Cmd
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit $LASTEXITCODE)" }
}

if (-not $CronOnly) {
    Write-Host "1) Sync backend → ${REMOTE}/backend-1.2 ..." -ForegroundColor Cyan
    # v12 build context = backend-1.2 (mirror ของ repo backend/)
    scp -r backend/db backend/lib backend/scripts backend/data backend/package.json backend/package-lock.json `
        backend/server.js backend/Dockerfile `
        "${SERVER}:${REMOTE}/backend-1.2/"
}

if (-not $CronOnly -and -not $MigrationOnly -and -not $SkipBuild) {
    Write-Host "2) Rebuild backend container ..." -ForegroundColor Cyan
    Invoke-Remote "cd $REMOTE && docker compose -f $COMPOSE build --no-cache backend && docker compose -f $COMPOSE up -d backend"
    Start-Sleep -Seconds 20
}

if (-not $CronOnly) {
    Write-Host "3) Run migration 213 ..." -ForegroundColor Cyan
    Invoke-Remote @"
cd $REMOTE && \
export DB_HOST=127.0.0.1 DB_PORT=5432 DB_DATABASE=meera_db DB_USER=meera && \
set -a && [ -f .env ] && . ./.env && set +a && \
export DB_HOST=127.0.0.1 && \
node backend-1.2/scripts/run-migration.js 213
"@
}

if (-not $MigrationOnly) {
    Write-Host "4) Install PRB lifecycle cron (hourly) ..." -ForegroundColor Cyan
    Invoke-Remote "cd $REMOTE && chmod +x backend-1.2/scripts/setup-prb-cron-docker.sh && bash backend-1.2/scripts/setup-prb-cron-docker.sh install"
    Write-Host "5) Test cron once ..." -ForegroundColor Cyan
    Invoke-Remote "docker exec aqond-backend node scripts/prb-order-lifecycle-cron.js && tail -5 /var/log/aqond-prb-lifecycle.log 2>/dev/null || true"
    Invoke-Remote "bash backend-1.2/scripts/setup-prb-cron-docker.sh status"
}

Write-Host "`nDone. PRB migration + hourly cron on production." -ForegroundColor Green
