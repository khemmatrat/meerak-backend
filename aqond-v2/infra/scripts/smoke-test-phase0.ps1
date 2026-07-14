#Requires -Version 5.1
<#
  Phase 0 smoke: catalog seed, search, shipping, AI stack.

  Usage:
    pwsh -File infra/scripts/smoke-test-phase0.ps1
    pwsh -File infra/scripts/smoke-test-phase0.ps1 -SkipAI
#>
param(
  [switch] $SkipAI,
  [int] $SearchTimeoutSec = 30,
  [int] $AiTimeoutSec = 120
)

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Kong = "http://127.0.0.1:8000"
$envFile = Join-Path $Root "infra\.env"

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$AiKey = if ($env:AI_CORE_API_KEY) { $env:AI_CORE_API_KEY } else { "CHANGE_ME_ai_core_key" }
$fail = 0

function Pass($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:fail++ }

Write-Host "=== Phase 0 smoke test ===" -ForegroundColor Cyan

# Catalog / BFF home
try {
  $home = Invoke-RestMethod -Uri "$Kong/api/v1/bff/v1/home" -Headers @{
    "X-User-Id" = "phase0-smoke"
    "X-Session-Id" = "phase0"
    "X-Aqond-Region" = "TH"
  } -TimeoutSec $SearchTimeoutSec
  $n = @($home.products.products).Count
  if ($n -ge 10) { Pass "BFF home: $n products" } else { Fail "BFF home: only $n products (run seed?)" }
} catch {
  Fail "BFF home: $($_.Exception.Message)"
}

# Search svc
try {
  $sh = Invoke-RestMethod -Uri "$Kong/api/v1/search/health" -TimeoutSec 10
  if ($sh.ok) { Pass "search-svc health" } else { Fail "search-svc health not ok" }
} catch {
  Fail "search-svc: $($_.Exception.Message)"
}

try {
  $sr = Invoke-RestMethod -Uri "$Kong/api/v1/search/v1/search?q=matcha&limit=5" -TimeoutSec $SearchTimeoutSec
  $hits = @($sr.results).Count
  if ($hits -gt 0) { Pass "search query 'matcha': $hits hits" } else { Fail "search query returned 0 (run reindex?)" }
} catch {
  Fail "search query: $($_.Exception.Message)"
}

# Shipping svc
try {
  $ship = Invoke-RestMethod -Uri "$Kong/api/v1/shipping/health" -TimeoutSec 10
  if ($ship.ok) { Pass "shipping-svc health" } else { Fail "shipping-svc health not ok" }
} catch {
  Fail "shipping-svc: $($_.Exception.Message)"
}

if (-not $SkipAI) {
  try {
    $ai = Invoke-RestMethod -Uri "$Kong/api/v1/ai/health" -Headers @{ "X-AI-Core-Api-Key" = $AiKey } -TimeoutSec 15
    if ($ai.ok) { Pass "ai-core health" } else { Fail "ai-core health not ok" }
    if ($ai.ollama.ok) { Pass "ollama reachable from ai-core" } else { Fail "ollama not ready (pull-models.ps1?)" }
  } catch {
    Fail "ai-core: $($_.Exception.Message)"
  }

  # Quick vision test with tiny 1x1 png base64 (may still call ollama — optional skip on timeout)
  $tinyB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  try {
    Write-Host "  AI onboard probe (up to ${AiTimeoutSec}s)..." -ForegroundColor DarkGray
    $body = @{ image_base64 = $tinyB64; merchant_hint = "test product cotton shirt 199 THB" } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$Kong/api/v1/ai/v1/onboard/product" -Method POST `
      -Headers @{ "X-AI-Core-Api-Key" = $AiKey; "Content-Type" = "application/json" } `
      -Body $body -TimeoutSec $AiTimeoutSec
    if ($resp.product -or $resp.vision_description) {
      Pass "AI onboard/product responded"
    } else {
      Fail "AI onboard: empty response"
    }
  } catch {
    Fail "AI onboard: $($_.Exception.Message) (models may still be loading — retry after pull-models)"
  }
}

Write-Host ""
if ($fail -eq 0) {
  Write-Host "Phase 0 smoke: ALL PASS" -ForegroundColor Green
  exit 0
}
Write-Host "Phase 0 smoke: $fail FAIL(S)" -ForegroundColor Yellow
exit 1
