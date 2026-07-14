#Requires -Version 5.1
<#
  3-VPS / Phase 0 smoke — legacy paths + v2 paths + notifications.

  Usage:
    pwsh -File infra/scripts/smoke-test-3vps.ps1
    pwsh -File infra/scripts/smoke-test-3vps.ps1 -SkipLegacy
#>
param(
  [switch] $SkipLegacy,
  [string] $Kong = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $Root 'infra\.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
  }
}

$fail = 0
function Pass($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red; $script:fail++ }

Write-Host "=== 3-VPS smoke (Kong $Kong) ===" -ForegroundColor Cyan

try {
  $n = Invoke-RestMethod -Uri "$Kong/api/v1/notify/health" -TimeoutSec 8
  if ($n.ok) { Pass 'Kong + notification-svc' } else { Fail 'notification-svc health' }
} catch { Fail "notification-svc: $($_.Exception.Message)" }

try {
  $p = Invoke-RestMethod -Uri "$Kong/api/v1/notify/v1/push/status?user_id=smoke" -TimeoutSec 8
  if ($p.user_id) { Pass 'push status API' } else { Fail 'push status' }
} catch { Fail "push status: $($_.Exception.Message)" }

try {
  $b = Invoke-RestMethod -Uri "$Kong/api/v2/merchant/v1/home" -Headers @{
    'X-User-Id' = 'smoke'; 'X-Session-Id' = 'smoke'; 'X-Aqond-Region' = 'TH'
  } -TimeoutSec 15
  Pass 'v2 alias /api/v2/merchant/v1/home'
} catch { Fail "v2 merchant: $($_.Exception.Message)" }

if (-not $SkipLegacy) {
  $legacyBase = if ($env:CLOUD2_BACKEND_URL) { $env:CLOUD2_BACKEND_URL } else { $env:MEERAK_BACKEND_URL }
  if ($legacyBase) {
    try {
      $lb = $legacyBase.TrimEnd('/')
      Invoke-WebRequest -Uri "$lb/api/auth/login" -Method POST -Body '{}' -ContentType 'application/json' -TimeoutSec 5 -ErrorAction Stop | Out-Null
      Pass "Cloud2 direct $lb (reachable)"
    } catch {
      if ($_.Exception.Response.StatusCode.value__ -in 400, 401, 422) {
        Pass 'Cloud2 /api/auth/login (reachable, validation expected)'
      } else {
        Fail "Cloud2 legacy: $($_.Exception.Message)"
      }
    }
    try {
      Invoke-RestMethod -Uri "$Kong/api/auth/login" -Method POST -Body '{}' -ContentType 'application/json' -TimeoutSec 8 -ErrorAction Stop
      Fail 'Kong /api/auth should proxy (unexpected 200 on empty body)'
    } catch {
      if ($_.Exception.Response.StatusCode.value__ -in 400, 401, 422, 502) {
        Pass 'Kong /api/auth → Cloud2 proxy path'
      } else {
        Fail "Kong legacy auth: $($_.Exception.Message)"
      }
    }
  } else {
    Write-Host '[SKIP] legacy — set CLOUD2_BACKEND_URL in infra/.env' -ForegroundColor Yellow
  }
}

Write-Host ''
if ($fail -eq 0) {
  Write-Host '3-VPS smoke: ALL PASS' -ForegroundColor Green
  exit 0
}
Write-Host "3-VPS smoke: $fail FAIL(S)" -ForegroundColor Yellow
exit 1
