# =============================================================================
# Deploy Course Marketplace (Phase 0–18) → Production
# Usage:
#   .\scripts\deploy-course-marketplace-production.ps1
#   .\scripts\deploy-course-marketplace-production.ps1 -BackendOnly
#   .\scripts\deploy-course-marketplace-production.ps1 -SkipRemoteDeploy
# =============================================================================

param(
    [switch]$BackendOnly,
    [switch]$SkipRemoteDeploy
)

$ErrorActionPreference = "Stop"
$SERVER = "root@147.50.231.183"
$REMOTE = "/root/apps"
$ROOT = Join-Path $PSScriptRoot ".."

Set-Location $ROOT

function Sync-Backend {
    Write-Host "Sync backend -> backend-1.2 ..." -ForegroundColor Cyan
    scp -r backend/* "${SERVER}:${REMOTE}/backend-1.2/"
}

function Sync-Mobile {
    Write-Host "Sync mobile -> mobile-1.2 ..." -ForegroundColor Cyan
    if (-not (Test-Path "mobile")) {
        Write-Host "mobile/ not found — skip" -ForegroundColor Yellow
        return
    }
    scp -r mobile/* "${SERVER}:${REMOTE}/mobile-1.2/"
}

function Sync-Admin {
    Write-Host "Sync nexus-admin-core -> admin-1.3 ..." -ForegroundColor Cyan
    if (-not (Test-Path "nexus-admin-core")) {
        Write-Host "nexus-admin-core/ not found — skip" -ForegroundColor Yellow
        return
    }
    scp -r nexus-admin-core/* "${SERVER}:${REMOTE}/admin-1.3/"
}

function Invoke-RemoteDeploy {
    Write-Host "Running deploy on server ..." -ForegroundColor Yellow
    $cmd = "cd $REMOTE && sed -i 's/\r$//' backend-1.2/scripts/run-course-marketplace-on-server.sh backend-1.2/scripts/verify-course-marketplace-production.sh 2>/dev/null; chmod +x backend-1.2/scripts/run-course-marketplace-on-server.sh backend-1.2/scripts/verify-course-marketplace-production.sh; bash backend-1.2/scripts/run-course-marketplace-on-server.sh"
    ssh $SERVER $cmd
}

Write-Host "=== Course Marketplace Production Deploy ===" -ForegroundColor Green
Write-Host "Target: $SERVER`n" -ForegroundColor Gray

Sync-Backend
if (-not $BackendOnly) {
    Sync-Mobile
    Sync-Admin
}

if (-not $SkipRemoteDeploy) {
    Invoke-RemoteDeploy
} else {
    Write-Host "SkipRemoteDeploy — sync only. SSH แล้วรัน run-course-marketplace-on-server.sh" -ForegroundColor Yellow
}

Write-Host "`nDone. Verify: https://api.aqond.com/api/course-marketplace/health" -ForegroundColor Green
Write-Host "Manual QA: backend/COURSE_MARKETPLACE_DEPLOY.txt" -ForegroundColor Gray
