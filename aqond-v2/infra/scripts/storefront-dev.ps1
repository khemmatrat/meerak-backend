#Requires -Version 5.1
<#
  Marketplace UI (Next.js storefront) — like `npm run dev`, hot reload, no Docker build for UI.

  Needs API on Kong (from dev-up-all): http://127.0.0.1:8000
  Open: http://localhost:3003  (3000 = mobile Vite — do not use for storefront)

  Usage (2nd terminal while dev-up-all runs, after Kong is up):
    pwsh -File infra/scripts/storefront-dev.ps1

  First time:
    pwsh -File infra/scripts/storefront-dev.ps1 -Install
#>
param(
  [switch] $Install,
  [switch] $KillExisting,
  [int] $Port = 3003
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Storefront = Join-Path $Root "apps\storefront"
$DataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT -replace '/', '\' } else { "E:\aqond-data" }

if (-not (Test-Path $Storefront)) { throw "Not found: $Storefront" }

$env:BFF_URL = "http://127.0.0.1:8000/api/v1/bff"
$env:NEXT_PUBLIC_BFF_URL = $env:BFF_URL
$env:KONG_URL = "http://127.0.0.1:8000"
$env:NEXT_PUBLIC_KONG_URL = $env:KONG_URL
# Legacy meerak backend — shared login/register with mobile (server.js :3001)
$env:MEERAK_BACKEND_URL = if ($env:MEERAK_BACKEND_URL) { $env:MEERAK_BACKEND_URL } else { "http://127.0.0.1:3001" }
# Storefront server-side auth proxy uses 127.0.0.1; Kong uses host.docker.internal (see infra/.env)
$env:AQOND_REGION = "TH"
$env:NEXT_PUBLIC_AQOND_REGION = "TH"
$env:AQOND_LOCALE = "th-TH"
$env:NEXT_PUBLIC_AQOND_LOCAL_DEV = '1'
$env:NEXT_PUBLIC_AQOND_ALLOW_LOCAL_ORDERS = '1'
$env:AIVOS_MERCHANT_AD_DEV_KEY = if ($env:AIVOS_MERCHANT_AD_DEV_KEY) { $env:AIVOS_MERCHANT_AD_DEV_KEY } else { 'aqond-dev-merchant-ad' }
$env:STOREFRONT_INTERNAL_URL = "http://127.0.0.1:$Port"
$env:NPM_CONFIG_CACHE = if ($env:NPM_CONFIG_CACHE) { $env:NPM_CONFIG_CACHE } else { Join-Path $DataRoot "npm-cache" }

$EnvFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([^=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim().Trim('"').Trim("'")
      if ($k -eq 'AI_CORE_API_KEY' -and $v) { $env:AI_CORE_API_KEY = $v }
      if ($k -eq 'KONG_JWT_SECRET' -and $v) { $env:KONG_JWT_SECRET = $v }
      if ($k -eq 'MEERAK_JWT_SECRET' -and $v) { $env:MEERAK_JWT_SECRET = $v }
      if ($k -eq 'MEERAK_BACKEND_URL' -and $v) {
        # Next.js on host must not use host.docker.internal — keep localhost for storefront proxy
        if ($v -notmatch 'host\.docker\.internal') { $env:MEERAK_BACKEND_URL = $v }
      }
      if ($k -match '^NEXT_PUBLIC_FIREBASE_' -and $v) { Set-Item -Path "env:$k" -Value $v }
      if ($k -match '^MINIO_' -and $v) { Set-Item -Path "env:$k" -Value $v }
    }
  }
  if ($env:AI_CORE_API_KEY) {
    Write-Host "AI_CORE_API_KEY loaded from infra/.env" -ForegroundColor DarkGray
  } else {
    Write-Host "Tip: set AI_CORE_API_KEY in infra/.env for Hermes AI routes" -ForegroundColor Yellow
  }
  if ($env:MINIO_ROOT_PASSWORD) {
    $env:MINIO_ACCESS_KEY = if ($env:MINIO_ROOT_USER) { $env:MINIO_ROOT_USER } else { $env:MINIO_ACCESS_KEY }
    $env:MINIO_SECRET_KEY = $env:MINIO_ROOT_PASSWORD
    $env:MINIO_ENDPOINT = if ($env:MINIO_ENDPOINT) { $env:MINIO_ENDPOINT } else { "http://127.0.0.1:9000" }
    Write-Host "MinIO env loaded (listing images → $($env:MINIO_PUBLIC_URL))" -ForegroundColor DarkGray
  }
}

# Local ai-core (Windows Ollama) — bypass Kong when Docker AI containers down
$env:AI_CORE_DIRECT_URL = if ($env:AI_CORE_DIRECT_URL) { $env:AI_CORE_DIRECT_URL } else { "http://127.0.0.1:8100" }
try {
  $aiH = Invoke-RestMethod -Uri "$($env:AI_CORE_DIRECT_URL)/health" -TimeoutSec 2 -ErrorAction Stop
  if ($aiH.ok) {
    Write-Host "ai-core local: $($env:AI_CORE_DIRECT_URL) (OK)" -ForegroundColor Green
  }
} catch {
  Write-Host "Tip: start AI — pwsh -File infra/scripts/ai-core-local.ps1" -ForegroundColor Yellow
}

if (-not (Test-Path $env:NPM_CONFIG_CACHE)) {
  New-Item -ItemType Directory -Path $env:NPM_CONFIG_CACHE -Force | Out-Null
}

Write-Host "=== AQOND Marketplace (storefront dev) ===" -ForegroundColor Cyan
Write-Host "BFF: $($env:NEXT_PUBLIC_BFF_URL)" -ForegroundColor DarkGray
Write-Host "Open: http://localhost:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "Pages:" -ForegroundColor Yellow
@(
  "/           — Home",
  "/shop       — Shop catalog",
  "/search     — Search",
  "/cart       — Cart",
  "/checkout   — Checkout",
  "/orders     — Orders",
  "/feed       — Feed",
  "/live       — Live",
  "/login      — Login",
  "/m/login    — Mobile login (shared AQOND account)",
  "/m/register — Mobile register (Firebase OTP)",
  "/account    — Account",
  "/creator/studio — Creator studio",
  "/m/home     — Mobile home",
  "/m/search   — Mobile search + image",
  "/m/sell     — AI product listing",
  "/m/cart     — Mobile cart",
  "/m/checkout — Mobile checkout",
  "/m/orders   — Mobile orders",
  "/m/product/[id] — Product detail",
  "/m/account  — Mobile account",
  "/m/account/notifications — Push + LINE"
) | ForEach-Object { Write-Host "  http://localhost:${Port}$($_ -replace '^([^\s]+).*','$1')" -ForegroundColor DarkGray }

try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/" -UseBasicParsing -TimeoutSec 3
  Write-Host "`nKong :8000 reachable (HTTP $($r.StatusCode))" -ForegroundColor Green
} catch {
  Write-Host "`nWarning: Kong :8000 not ready yet — UI loads but API may fail until dev-up-all finishes." -ForegroundColor Yellow
}

function Get-PortOwnerPid([int] $P) {
  $lines = netstat -ano | Select-String "LISTENING" | Select-String ":$P\s"
  if (-not $lines) { return $null }
  $line = ($lines | Select-Object -First 1).ToString().Trim()
  $parts = $line -split '\s+'
  $pidStr = $parts[-1]
  if ($pidStr -match '^\d+$') { return [int]$pidStr }
  return $null
}

$ownerPid = Get-PortOwnerPid $Port
if ($ownerPid) {
  $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
  if ($KillExisting -and $owner) {
    Write-Host "`nPort $Port in use by $($owner.ProcessName) (PID $ownerPid) — stopping..." -ForegroundColor Yellow
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $nextCache = Join-Path $Storefront ".next"
    if (Test-Path $nextCache) {
      Write-Host "Clearing stale .next cache..." -ForegroundColor DarkGray
      Remove-Item -Recurse -Force $nextCache -ErrorAction SilentlyContinue
    }
  } else {
    try {
      $probe = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/m/home" -UseBasicParsing -TimeoutSec 3
      if ($probe.StatusCode -eq 200) {
        Write-Host "`nStorefront already running on http://localhost:$Port (PID $ownerPid)." -ForegroundColor Green
        Write-Host "Open that URL — or restart with: pwsh -File infra/scripts/storefront-dev.ps1 -KillExisting" -ForegroundColor DarkGray
        exit 0
      }
    } catch { }
    throw "Port $Port already in use (PID $ownerPid). Use -KillExisting or -Port 3003"
  }
}

Push-Location $Storefront
try {
  if ($Install -or -not (Test-Path "node_modules")) {
    Write-Host "`nnpm install..." -ForegroundColor Cyan
    npm install
  }
  Write-Host "`nStarting next dev (Ctrl+C to stop)..." -ForegroundColor Cyan
  npx next dev -p $Port
} finally {
  Pop-Location
}
