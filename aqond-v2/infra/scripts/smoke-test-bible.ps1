# Architecture Bible — full smoke (Phase 0-5)
param(
  [string]$Kong = "http://127.0.0.1:8000",
  [string]$Storefront = "http://127.0.0.1:3000",
  [switch]$SkipLegacy,
  [switch]$SkipAi
)

$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fail = 0

Write-Host "=== Architecture Bible smoke ===" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "render-kong-config.ps1")
if ($LASTEXITCODE -ne 0) { $fail++ }

& (Join-Path $PSScriptRoot "smoke-test-3vps.ps1") -Kong $Kong @($SkipLegacy ? @{SkipLegacy=$true} : @{})
if ($LASTEXITCODE -ne 0) { $fail++ }

if (-not $SkipAi) {
  & (Join-Path $PSScriptRoot "smoke-test-tier3-storefront.ps1") -Storefront $Storefront
  if ($LASTEXITCODE -ne 0) { $fail++ }
}

try {
  $d = Invoke-RestMethod -Uri "$Kong/api/v1/dispatch/health" -TimeoutSec 8
  if ($d.ok) { Write-Host "[OK] dispatch-svc health" -ForegroundColor Green }
  else { Write-Host "[FAIL] dispatch health" -ForegroundColor Red; $fail++ }
} catch {
  Write-Host "[FAIL] dispatch: $($_.Exception.Message)" -ForegroundColor Red
  $fail++
}

try {
  $r = Invoke-RestMethod -Uri "$Kong/api/v2/rider-merch/v1/dispatch/jobs?status=open" -Headers @{
    'X-User-Id' = 'smoke'; 'X-Aqond-Region' = 'TH'
  } -TimeoutSec 10
  Write-Host "[OK] v2 rider-merch alias" -ForegroundColor Green
} catch {
  if ($_.Exception.Response.StatusCode.value__ -in 401, 403) {
    Write-Host "[OK] v2 rider-merch alias (auth gate)" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] v2 rider-merch: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
  }
}

if ($fail -eq 0) {
  Write-Host "`nBible smoke: ALL PASS" -ForegroundColor Green
  exit 0
}
Write-Host "`nBible smoke: $fail section(s) failed" -ForegroundColor Red
exit 1
