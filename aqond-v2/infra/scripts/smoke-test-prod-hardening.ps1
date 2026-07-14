# Production hardening static checks (no Docker required)
# Usage:
#   pwsh infra/scripts/smoke-test-prod-hardening.ps1          # dev-safe wiring checks
#   pwsh infra/scripts/smoke-test-prod-hardening.ps1 -ProdEnv # also run verify-prod-env.ps1
param(
  [switch]$ProdEnv
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fail = [System.Collections.Generic.List[string]]::new()

function Fail([string]$msg) { $fail.Add($msg) }

Write-Host "=== AQOND production hardening smoke (static) ===" -ForegroundColor Cyan

$guardPaths = @(
  "infra/lib/prod-guard.js",
  "infra/ai-core/lib/prod-guard.js",
  "marketplace/sync-service/lib/prod-guard.js",
  "marketplace/escrow-service/lib/prod-guard.js",
  "cms/lib/prod-guard.js",
  "analytics/lib/prod-guard.js",
  "live/token-service/lib/prod-guard.js",
  "notifications/lib/prod-guard.js"
)

foreach ($rel in $guardPaths) {
  $p = Join-Path $Root $rel
  if (-not (Test-Path $p)) { Fail "missing prod-guard: $rel" }
}

$kongPath = Join-Path $Root "gateway/kong.yml"
$kong = Get-Content $kongPath -Raw
$placeholders = @(
  "CHANGE_ME_escrow_internal_key",
  "CHANGE_ME_ai_core_key",
  "CHANGE_ME_cms_api_key",
  "CHANGE_ME_merchant_sync_key",
  "CHANGE_ME_live_merchant_key",
  "CHANGE_ME_analytics_key",
  "CHANGE_ME_notify_key",
  "dev-jwt-secret-change-in-prod"
)
foreach ($ph in $placeholders) {
  if ($kong -notmatch [regex]::Escape($ph)) { Fail "kong.yml missing placeholder: $ph" }
}

$corsHeaders = @("X-CMS-Api-Key", "X-Live-Merchant-Api-Key", "X-Analytics-Api-Key", "X-Bagisto-Sync-Secret")
foreach ($h in $corsHeaders) {
  if ($kong -notmatch [regex]::Escape($h)) { Fail "kong.yml CORS missing header: $h" }
}

$nodeServers = @(
  "infra/ai-core/server.js",
  "marketplace/sync-service/server.js",
  "marketplace/escrow-service/server.js",
  "cms/server.js",
  "analytics/server.js",
  "live/token-service/server.js",
  "notifications/server.js"
)
foreach ($rel in $nodeServers) {
  $p = Join-Path $Root $rel
  if (-not (Test-Path $p)) { Fail "missing server: $rel"; continue }
  node --check $p 2>$null
  if ($LASTEXITCODE -ne 0) { Fail "node --check failed: $rel" }
}

$compose = Get-Content (Join-Path $Root "docker-compose.yml") -Raw
foreach ($key in @("AQOND_ENV", "CMS_API_KEY", "LIVE_MERCHANT_API_KEY")) {
  if ($compose -notmatch [regex]::Escape($key)) { Fail "docker-compose.yml missing $key" }
}

$example = Get-Content (Join-Path $Root "infra/.env.example") -Raw
foreach ($key in @("AQOND_ENV", "CMS_API_KEY", "LIVE_MERCHANT_API_KEY", "KONG_CORS_ORIGINS")) {
  if ($example -notmatch "(?m)^$key=") { Fail "infra/.env.example missing $key" }
}

$voice = Get-Content (Join-Path $Root "voice/server.py") -Raw
if ($voice -notmatch "assert_prod_secrets") { Fail "voice/server.py missing assert_prod_secrets()" }

if ($fail.Count) {
  Write-Host "`nFAIL ($($fail.Count)):" -ForegroundColor Red
  $fail | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "OK — prod-guard wiring, kong template, compose, and syntax checks passed." -ForegroundColor Green

if ($ProdEnv) {
  Write-Host "`nRunning verify-prod-env.ps1 ..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "verify-prod-env.ps1")
  exit $LASTEXITCODE
}

Write-Host "`nProd deploy prep (when Docker is up):"
Write-Host "  pwsh infra/scripts/rotate-secrets.ps1"
Write-Host "  pwsh infra/scripts/render-kong-config.ps1"
Write-Host "  pwsh infra/scripts/verify-prod-env.ps1"
Write-Host "  docker compose --env-file infra/.env up -d --build"
