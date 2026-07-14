# =============================================================================
# Deploy ไป Server (root@147.50.231.183)
# =============================================================================
# Usage:
#   .\scripts\deploy-to-server.ps1              # Deploy ทั้งหมด + restart
#   .\scripts\deploy-to-server.ps1 -MobileOnly   # เฉพาะ mobile (components)
#   .\scripts\deploy-to-server.ps1 -BackendOnly # เฉพาะ backend
#   .\scripts\deploy-to-server.ps1 -AdminOnly   # เฉพาะ admin (User Payout fix)
# =============================================================================

param(
    [switch]$MobileOnly,
    [switch]$MobileFull,
    [switch]$BackendOnly,
    [switch]$AdminOnly,
    [switch]$ComposeOnly
)

$ErrorActionPreference = "Stop"
$SERVER = "root@147.50.231.183"
$REMOTE = "/root/apps"
$PROJECT_ROOT = $PSScriptRoot + "\.."

Set-Location $PROJECT_ROOT

function Deploy-Mobile {
    Write-Host "Deploying mobile (components, pages, config)..." -ForegroundColor Cyan
    scp -r components pages ${SERVER}:${REMOTE}/
    scp App.tsx main.tsx index.html vite.config.ts tsconfig.json package.json package-lock.json ${SERVER}:${REMOTE}/
    Write-Host "Restarting mobile container..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE && docker-compose -f docker-compose.golive.yml restart mobile"
    Write-Host "Done." -ForegroundColor Green
}

function Deploy-MobileSimple {
    Write-Host "Deploying components only..." -ForegroundColor Cyan
    scp -r components ${SERVER}:${REMOTE}/
    Write-Host "Restarting mobile..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE && docker-compose -f docker-compose.golive.yml restart mobile"
    Write-Host "Done." -ForegroundColor Green
}

function Deploy-Backend {
    Write-Host "Deploying backend..." -ForegroundColor Cyan
    scp -r backend ${SERVER}:${REMOTE}/
    Write-Host "Restarting backend..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE && docker-compose -f docker-compose.golive.yml restart backend"
    Write-Host "Done." -ForegroundColor Green
}

function Deploy-Compose {
    Write-Host "Deploying docker-compose.golive.yml..." -ForegroundColor Cyan
    scp docker-compose.golive.yml ${SERVER}:${REMOTE}/
    Write-Host "Recreating containers..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE && docker-compose -f docker-compose.golive.yml up -d"
    Write-Host "Done." -ForegroundColor Green
}

function Deploy-Admin {
    Write-Host "Deploying admin (nexus-admin-core)..." -ForegroundColor Cyan
    if (-not (Test-Path "nexus-admin-core")) {
        Write-Host "nexus-admin-core folder not found!" -ForegroundColor Red
        exit 1
    }
    # ส่งไฟล์ admin ไปที่ /root/apps/admin (docker-compose ใช้ working_dir: /app/admin)
    scp -r nexus-admin-core\* ${SERVER}:${REMOTE}/admin/
    Write-Host "Restarting admin container (จะ rebuild อัตโนมัติ)..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE && docker-compose -f docker-compose.golive.yml up -d --force-recreate admin"
    Write-Host "Done. รอ 1-2 นาที ให้ admin rebuild แล้วลองเข้า admin.aqond.com อีกครั้ง" -ForegroundColor Green
}

if ($ComposeOnly) {
    Deploy-Compose
} elseif ($AdminOnly) {
    Deploy-Admin
} elseif ($BackendOnly) {
    Deploy-Backend
} elseif ($MobileFull) {
    Deploy-Mobile
} else {
    Deploy-MobileSimple
    Write-Host "`nTip: -MobileFull, -BackendOnly, -AdminOnly, -ComposeOnly" -ForegroundColor Gray
}
