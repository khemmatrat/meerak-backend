# Fail if infra/.env still has dev placeholders (run before production deploy)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

if (-not (Test-Path $EnvFile)) { throw "Missing $EnvFile" }

$required = @(
  "POSTGRES_PASSWORD",
  "KONG_JWT_SECRET",
  "BAGISTO_WEBHOOK_SECRET",
  "ESCROW_API_KEY",
  "AI_CORE_API_KEY",
  "ANALYTICS_API_KEY",
  "NOTIFY_API_KEY",
  "CMS_API_KEY",
  "LIVE_MERCHANT_API_KEY",
  "MINIO_ROOT_PASSWORD",
  "LIVEKIT_API_SECRET",
  "N8N_ENCRYPTION_KEY"
)

$lines = Get-Content $EnvFile
$vars = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*([^#=]+)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim()
  }
}

if ($vars["AQOND_ENV"] -ne "production") {
  Write-Host "WARN: AQOND_ENV is not 'production' — this check is for prod deploy only." -ForegroundColor Yellow
}

$bad = @()
foreach ($name in $required) {
  $v = $vars[$name]
  if (-not $v -or $v -match "CHANGE_ME" -or $v.Length -lt 16) {
    $bad += $name
  }
}

if ($vars["ANALYTICS_PUBLIC_INGEST"] -eq "1" -and $vars["AQOND_ENV"] -eq "production") {
  Write-Host "WARN: ANALYTICS_PUBLIC_INGEST=1 in production — set to 0 unless intentional." -ForegroundColor Yellow
}

if ($vars["AQOND_ENV"] -eq "production") {
  $cors = $vars["KONG_CORS_ORIGINS"]
  if (-not $cors -or $cors -eq "*") {
    Write-Host "WARN: KONG_CORS_ORIGINS missing or * — set explicit origins and run render-kong-config.ps1" -ForegroundColor Yellow
  }
}

if ($vars["LIVEKIT_API_KEY"] -eq "devkey") {
  $bad += "LIVEKIT_API_KEY (still devkey)"
}

if ($bad.Count) {
  Write-Host "FAIL — weak or missing secrets:" -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "OK — production env secrets look rotated (length >= 16, no CHANGE_ME)."
