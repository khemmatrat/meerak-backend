#Requires -Version 5.1
<#
  Start feed + video + recsys stack for Creator Studio / Feed production path.

  pwsh -File infra/scripts/dev-up-feed.ps1
  pwsh -File infra/scripts/dev-up-feed.ps1 -Quick
#>
param([switch] $Quick)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ScriptDir = $PSScriptRoot
Set-Location $Root

$feedStack = @(
  "feed-svc", "video-svc", "transcode-worker", "rec-svc", "recsys-svc"
)

Write-Host "=== AQOND Feed/Video/Affiliate stack ===" -ForegroundColor Cyan

if (-not $Quick) {
  & (Join-Path $ScriptDir "go-host-build.ps1") @feedStack
}

foreach ($svc in $feedStack) {
  Write-Host "Starting $svc ..." -ForegroundColor Yellow
  if ($Quick) {
    & (Join-Path $ScriptDir "docker-up-go.ps1") $svc -SkipHostBuild
  } else {
    & (Join-Path $ScriptDir "docker-up-go.ps1") $svc
  }
}

Write-Host "`n=== Health ===" -ForegroundColor Cyan
$Kong = "8000"
foreach ($path in @("/api/v1/feed/health", "/api/v1/video/health", "/api/v1/recsys/health")) {
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}${path}" -TimeoutSec 15
    Write-Host "OK $path ok=$($h.ok)" -ForegroundColor Green
  } catch {
    Write-Host "WARN $path not ready" -ForegroundColor Yellow
  }
}

Write-Host "`nRun smoke: pwsh -File infra/scripts/smoke-test-p33-p45-feed.ps1" -ForegroundColor Cyan
Write-Host "Storefront: pwsh -File infra/scripts/storefront-dev.ps1 -KillExisting" -ForegroundColor Cyan
