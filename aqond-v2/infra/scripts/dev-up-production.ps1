#Requires -Version 5.1
<#
  Full production-local stack: host-build all Go services, migrations, seed shops, smoke tests.

  Usage (one command — takes 30-90 min first time):
    pwsh -ExecutionPolicy Bypass -File infra/scripts/dev-up-production.ps1

  Skip heavy infra (scylla/citus/redis-cluster) if RAM limited:
    pwsh -File infra/scripts/dev-up-production.ps1 -SkipHeavy

  Daily restart:
    pwsh -File infra/scripts/dev-up-production.ps1 -Quick

  Or use Phase 0 (recommended for demo + AI):
    pwsh -File infra/scripts/phase-0-demo.ps1 -Quick
#>
param(
  [switch] $Quick,
  [switch] $SkipHeavy,
  [switch] $SkipSeed,
  [switch] $SkipSmoke,
  [switch] $SkipMigrations,
  [switch] $ForceRebuild,
  [int] $ShopCount = 30
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ScriptDir = $PSScriptRoot
Set-Location $Root

$DataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT -replace '/', '\' } else { "E:\aqond-data" }
$BinRoot = Join-Path $DataRoot "bin"
$envFile = @("--env-file", "infra/.env")
$profile = @("--profile", "dev-lite")

$infra = @("aqond-db", "aqond-redis", "kong", "minio", "redpanda", "redpanda-console")

$step1 = @(
  "foundation-svc", "catalog-svc", "promotions-svc", "coupon-svc",
  "account-svc", "coins-svc", "creator-svc", "wallet-svc",
  "order-svc", "cart-svc", "checkout-svc", "settings-svc", "bff-svc"
)

$step2 = @(
  "inventory-svc", "payment-svc", "shipping-svc",
  "search-svc", "locale-svc", "address-svc",
  "reviews-svc", "trust-svc", "compliance-svc",
  "policy-svc", "notification-svc", "settings-svc",
  "readmodel-svc", "rec-svc", "recsys-svc",
  "sre-svc"
)

$step3 = @("feed-svc", "video-svc", "transcode-worker", "cdn-edge")

$heavy = @("scylla", "citus-worker-1", "citus-worker-2", "citus-coordinator", "redis-node-1", "redis-node-2", "redis-node-3")

$aiDeps = @("ollama", "ai-core")

$allGo = @(
  "foundation-svc", "catalog-svc", "promotions-svc", "coupon-svc",
  "account-svc", "coins-svc", "creator-svc", "wallet-svc",
  "inventory-svc", "payment-svc", "order-svc", "cart-svc", "checkout-svc",
  "readmodel-svc", "feed-svc", "video-svc", "transcode-worker", "rec-svc",
  "search-svc", "recsys-svc", "reviews-svc", "trust-svc",
  "locale-svc", "shipping-svc", "address-svc", "compliance-svc",
  "policy-svc", "notification-svc", "bff-svc", "settings-svc", "sre-svc"
) | Select-Object -Unique

function Wait-DockerReady {
  $deadline = (Get-Date).AddMinutes(10)
  while ((Get-Date) -lt $deadline) {
    docker version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "Docker ready." -ForegroundColor Green; return }
    Start-Sleep -Seconds 5
  }
  throw "Docker not ready"
}

function Compose-Up {
  param([string[]] $Services, [switch] $Build)
  foreach ($svc in $Services) {
    Write-Host "  up $svc" -ForegroundColor DarkGray
    if ($Build) {
      docker compose @envFile @profile up -d --build $svc 2>&1 | Out-Null
    } else {
      docker compose @envFile @profile up -d --no-build $svc 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { Write-Warning "  failed: $svc" }
    Start-Sleep -Milliseconds 800
  }
}

function Build-GoService {
  param([string] $Svc)
  $bin = Join-Path $BinRoot $Svc
  if (-not $ForceRebuild -and (Test-Path $bin)) {
    $src = Join-Path $Root "services\$Svc"
    if (Test-Path $src) {
      $newest = Get-ChildItem $src, (Join-Path $Root "pkg") -Recurse -Filter *.go -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
      if ($newest -and $newest.LastWriteTimeUtc -le (Get-Item $bin).LastWriteTimeUtc) {
        return
      }
    }
  }
  Write-Host "  compile $Svc" -ForegroundColor DarkCyan
  & (Join-Path $ScriptDir "go-host-build.ps1") $Svc
  if ($LASTEXITCODE -ne 0) { throw "go build failed: $Svc" }
}

function Package-GoService {
  param([string] $Svc)
  $img = "aqond-v2-${Svc}:latest"
  if (-not $ForceRebuild) {
    docker image inspect $img 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $BinRoot $Svc))) {
      $imgT = docker image inspect $img --format "{{.Created}}" 2>$null
      try {
        if ([DateTime]::Parse($imgT).ToUniversalTime() -ge (Get-Item (Join-Path $BinRoot $Svc)).LastWriteTimeUtc) {
          return
        }
      } catch { }
    }
  }
  Write-Host "  package $Svc" -ForegroundColor DarkCyan
  $env:DOCKER_BUILDKIT = "0"
  & (Join-Path $ScriptDir "docker-package-prebuilt.ps1") $Svc
}

function Build-AllGo {
  Write-Host "`n=== Host compile all Go services ($($allGo.Count)) ===" -ForegroundColor Cyan
  $i = 0
  foreach ($svc in $allGo) {
    $i++
    Write-Host "[$i/$($allGo.Count)] $svc" -ForegroundColor Yellow
    Build-GoService $svc
    Package-GoService $svc
  }
}

function Start-ProductionStack {
  Write-Host "`n=== Infra ===" -ForegroundColor Cyan
  Compose-Up $infra

  Write-Host "Waiting for Postgres..." -ForegroundColor DarkGray
  Start-Sleep -Seconds 15

  if (-not $SkipHeavy) {
    Write-Host "`n=== Heavy infra (scylla, citus, redis cluster) ===" -ForegroundColor Cyan
    Compose-Up @("scylla")
    Write-Host "  waiting scylla health (up to 5 min)..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 60
    Compose-Up @("citus-worker-1", "citus-worker-2")
    Start-Sleep -Seconds 45
    Compose-Up @("citus-coordinator")
    Compose-Up @("redis-node-1", "redis-node-2", "redis-node-3")
  } else {
    Write-Host "`n=== SkipHeavy: feed-svc may degrade without scylla ===" -ForegroundColor Yellow
  }

  Write-Host "`n=== AI deps (hermes/transcode) ===" -ForegroundColor Cyan
  $env:DOCKER_BUILDKIT = "0"
  docker compose @envFile up -d ollama ai-core 2>&1 | Out-Null

  Write-Host "`n=== Step 1 — Epoch 11 + BFF ===" -ForegroundColor Cyan
  Compose-Up $step1

  Write-Host "`n=== Step 2 — Commerce / payment ===" -ForegroundColor Cyan
  Compose-Up ($step2 | Select-Object -Unique)

  Write-Host "`n=== Step 3 — Feed / video ===" -ForegroundColor Cyan
  Compose-Up $step3

  Write-Host "`n=== Hermes orchestrator ===" -ForegroundColor Cyan
  $env:DOCKER_BUILDKIT = "0"
  docker compose @envFile @profile up -d --build hermes-orchestrator 2>&1 | Out-Null
}

# --- main ---
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AQOND v2 PRODUCTION LOCAL SETUP" -ForegroundColor Cyan
Write-Host "  Shops seed: $ShopCount | Heavy: $(if ($SkipHeavy) { 'skip' } else { 'yes' })" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Wait-DockerReady

if ($Quick) {
  Write-Host "`n=== Quick mode ===" -ForegroundColor Cyan
  Compose-Up $infra
  Compose-Up ($step1 + $step2 + $step3 | Select-Object -Unique)
} else {
  Build-AllGo
  Start-ProductionStack
}

if (-not $SkipMigrations) {
  Write-Host "`n=== Migrations (001-022) ===" -ForegroundColor Cyan
  & (Join-Path $ScriptDir "apply-migrations.ps1")
}

if (-not $SkipSeed) {
  Write-Host "`n=== Seed $ShopCount shops ===" -ForegroundColor Cyan
  & (Join-Path $ScriptDir "seed-production-shops.ps1") -ShopCount $ShopCount
}

if (-not $SkipSmoke) {
  Write-Host "`n=== Smoke: P201-P230 ===" -ForegroundColor Cyan
  & (Join-Path $ScriptDir "smoke-test-p201-p230.ps1")
}

$sw.Stop()
Write-Host "`n=== PRODUCTION LOCAL READY ($([math]::Round($sw.Elapsed.TotalMinutes, 1)) min) ===" -ForegroundColor Green

Write-Host @"

  API:  http://127.0.0.1:8000/api/v1/bff/v1/home
  UI:   pwsh -File infra/scripts/storefront-dev.ps1  -> http://localhost:3000

  Pages: /shop /search /cart /checkout /feed /login /account /m/home
"@ -ForegroundColor Green

docker compose @envFile @profile ps --format "table {{.Name}}\t{{.Status}}" 2>&1 | Select-Object -First 45
