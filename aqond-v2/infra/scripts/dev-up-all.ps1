#Requires -Version 5.1
<#
  ONE command to bring up AQOND v2 dev stack (Windows-friendly, no in-Docker Go compile).

  PRODUCT dev (marketplace + feed/video + AI Jarvis) — recommended daily driver:
    pwsh -File infra/scripts/dev-marketplace.ps1
    pwsh -File infra/scripts/dev-marketplace.ps1 -Quick

  Infra only (Docker: DB/Redis/Kong/MinIO/Kafka — no Go compile):
    pwsh -File infra/scripts/dev-up-all.ps1 -InfraOnly
    pwsh -File infra/scripts/dev-up-all.ps1 -InfraOnly -Product   # + Scylla + CDN

  First time — marketplace/API (~17 services):
    pwsh -ExecutionPolicy Bypass -File infra/scripts/dev-up-all.ps1 -InstallGo

  Product stack (~21 Go svc + feed/video/rec + Scylla):
    pwsh -File infra/scripts/dev-up-all.ps1 -Product -InstallGo

  Full demo (search + shipping + AI + seed) — Phase 0:
    pwsh -File infra/scripts/phase-0-demo.ps1

  All 31 Go services (slow):
    pwsh -File infra/scripts/dev-up-all.ps1 -InstallGo -Full

  Daily restart (minutes — reuses E:\aqond-data\bin + existing images):
    pwsh -ExecutionPolicy Bypass -File infra/scripts/dev-up-all.ps1 -Quick

  Full rebuild after code changes:
    pwsh -File infra/scripts/dev-up-all.ps1 -ForceRebuild
#>
param(
  [switch] $Quick,
  [switch] $Full,
  [switch] $Product,
  [switch] $InfraOnly,
  [switch] $ForceRebuild,
  [switch] $InstallGo,
  [switch] $SkipMigrations,
  [switch] $SkipHealthCheck,
  [switch] $WithStorefront,
  [switch] $OpenBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ScriptDir = $PSScriptRoot
Set-Location $Root

$DataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT -replace '/', '\' } else { "E:\aqond-data" }
$BinRoot = Join-Path $DataRoot "bin"
# Go toolchain + module cache on C: (E: drive has hardware errors)
$env:GOROOT = "C:\tools\go"
if (-not $env:GOMODCACHE -or $env:GOMODCACHE -match '^E:\\') { $env:GOMODCACHE = "C:\tools\go-mod-cache" }
if (-not $env:GOCACHE -or $env:GOCACHE -match '^E:\\') { $env:GOCACHE = "C:\tools\go-build-cache" }
$env:PATH = "C:\tools\go\bin;$env:PATH"
$envFile = @("--env-file", "infra/.env")
$profile = @("--profile", "dev-lite")

$infraBase = @("aqond-db", "aqond-redis", "redpanda", "minio", "scylla", "kong", "redpanda-console", "cdn-edge")

function Get-InfraList {
  if ($Product -or $Full) {
    return $infraBase
  }
  return @("aqond-db", "aqond-redis", "kong", "minio", "redpanda", "redpanda-console")
}

function Get-GoServicesFromWork {
  $goWork = Join-Path $Root "go.work"
  $list = @()
  foreach ($line in Get-Content $goWork) {
    if ($line -match '^\s*\./services/([a-z0-9-]+)\s*$') { $list += $Matches[1] }
  }
  return $list
}

$goServices = Get-GoServicesFromWork

$minimalServices = @(
  "foundation-svc", "catalog-svc", "promotions-svc", "coupon-svc",
  "account-svc", "coins-svc", "creator-svc", "wallet-svc",
  "inventory-svc", "payment-svc", "order-svc", "cart-svc",
  "checkout-svc", "settings-svc", "search-svc", "shipping-svc",
  "bff-svc"
)

# TikTok-style feed + video + recommendations (commerce + delivery + shop slice)
$productExtraServices = @(
  "feed-svc", "video-svc", "rec-svc"
)

function Get-TargetServices {
  if ($Full) { return $goServices }
  if ($Product) { return $minimalServices + $productExtraServices }
  return $minimalServices
}

function Get-ModeLabel {
  if ($InfraOnly) {
    if ($Product -or $Full) { return "Infra only (product: Scylla + CDN + core)" }
    return "Infra only (DB/Redis/Kong/MinIO/Kafka)"
  }
  if ($Quick) {
    if ($Full) { return "Quick — full 31 services" }
    if ($Product) { return "Quick — product stack (commerce + feed/video)" }
    return "Quick — minimal marketplace (17 svc)"
  }
  if ($Full) { return "Full 31 services" }
  if ($Product) { return "Product (commerce + feed/video/rec + Scylla)" }
  return "Minimal marketplace (17 svc + search/shipping)"
}

function Invoke-GoHostBuild {
  param(
    [string[]] $Names,
    [switch] $WithInstall
  )
  if ($WithInstall) {
    & (Join-Path $ScriptDir "go-host-build.ps1") -InstallGo @Names
  } else {
    & (Join-Path $ScriptDir "go-host-build.ps1") @Names
  }
}

function Wait-DockerReady {
  param([int] $MaxWaitSec = 300)
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  $n = 0
  while ((Get-Date) -lt $deadline) {
    $n++
    docker version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      docker info 2>&1 | Select-String "Server Version" | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker engine ready." -ForegroundColor Green
        return
      }
    }
    Write-Host "  waiting for Docker engine... ($n)" -ForegroundColor DarkYellow
    Start-Sleep -Seconds 5
  }
  throw "Docker not ready after ${MaxWaitSec}s. Open Docker Desktop until 'Engine running', then re-run."
}

function Wait-DbHealthy {
  param([int] $MaxWaitSec = 180)
  Get-Content (Join-Path $Root "infra\.env") | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
  }
  $user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
  $pass = $env:POSTGRES_PASSWORD
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  while ((Get-Date) -lt $deadline) {
    docker compose @envFile exec -T -e "PGPASSWORD=$pass" aqond-db pg_isready -U $user -d postgres 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Postgres healthy." -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 3
  }
  throw "aqond-db not healthy after ${MaxWaitSec}s"
}

function Wait-ScyllaHealthy {
  param([int] $MaxWaitSec = 300)
  if (-not ($Product -or $Full)) { return }
  Write-Host "Waiting for Scylla (feed keyspace)..." -ForegroundColor DarkYellow
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  while ((Get-Date) -lt $deadline) {
    docker compose @envFile @profile ps scylla 2>&1 | Select-String "healthy" | Out-Null
    if ($LASTEXITCODE -eq 0) {
      docker compose @envFile exec -T scylla cqlsh -e "describe cluster" 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "Scylla healthy." -ForegroundColor Green
        return
      }
    }
    Start-Sleep -Seconds 5
  }
  Write-Warning "Scylla not healthy after ${MaxWaitSec}s — feed-svc may fail until Scylla is ready"
}

function Test-BinaryFresh {
  param([string] $Service)
  if ($ForceRebuild) { return $false }
  $bin = Join-Path $BinRoot $Service
  if (-not (Test-Path $bin)) { return $false }
  $binTime = (Get-Item $bin).LastWriteTimeUtc
  $paths = @(
    (Join-Path $Root "services\$Service"),
    (Join-Path $Root "pkg")
  )
  foreach ($p in $paths) {
    if (-not (Test-Path $p)) { continue }
    $newest = Get-ChildItem $p -Recurse -Filter *.go -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($newest -and $newest.LastWriteTimeUtc -gt $binTime) { return $false }
  }
  return $true
}

function Get-ComposeProjectName {
  $project = $env:COMPOSE_PROJECT_NAME
  if (-not $project -and (Test-Path (Join-Path $Root "infra\.env"))) {
    Get-Content (Join-Path $Root "infra\.env") | ForEach-Object {
      if ($_ -match '^\s*COMPOSE_PROJECT_NAME=(.+)$') { $project = $matches[1].Trim() }
    }
  }
  if (-not $project) { $project = "aqond-v2" }
  return $project
}

function Test-ImageExists {
  param([string] $Service)
  if ($ForceRebuild) { return $false }
  $project = Get-ComposeProjectName
  docker image inspect "${project}-${Service}:latest" 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Test-NeedsPackage {
  param([string] $Service)
  if ($ForceRebuild) { return $true }
  $bin = Join-Path $BinRoot $Service
  if (-not (Test-Path $bin)) { return $false }
  $project = Get-ComposeProjectName
  $imgJson = docker image inspect "${project}-${Service}:latest" --format "{{.Created}}" 2>$null
  if ($LASTEXITCODE -ne 0) { return $true }
  try {
    $imgTime = [DateTime]::Parse($imgJson).ToUniversalTime()
    $binTime = (Get-Item $bin).LastWriteTimeUtc
    return ($binTime -gt $imgTime)
  } catch {
    return $true
  }
}

function Start-Infra {
  $infra = Get-InfraList
  Write-Host "`n=== Starting infra ($($infra.Count) containers) ===" -ForegroundColor Cyan
  foreach ($svc in $infra) {
    Write-Host "  up $svc" -ForegroundColor DarkGray
    docker compose @envFile @profile up -d $svc 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to start $svc" }
  }
  Wait-DbHealthy
  Wait-ScyllaHealthy
}

function Start-GoStack {
  $targets = Get-TargetServices
  Write-Host "`n=== Go services ($($targets.Count) svc — $(Get-ModeLabel)) ===" -ForegroundColor Cyan

  $built = 0
  $packaged = 0
  $started = 0
  $firstCompile = $true
  $i = 0
  foreach ($svc in $targets) {
    $i++
    Write-Host "`n[$i/$($targets.Count)] $svc" -ForegroundColor Yellow

    if (-not (Test-BinaryFresh $svc)) {
      Write-Host "  host compile..." -ForegroundColor DarkCyan
      Invoke-GoHostBuild -Names @($svc) -WithInstall:($InstallGo -and $firstCompile)
      $firstCompile = $false
      $built++
    } else {
      Write-Host "  binary fresh (skip compile)" -ForegroundColor DarkGray
    }

    if (Test-NeedsPackage $svc) {
      Write-Host "  docker package..." -ForegroundColor DarkCyan
      $env:DOCKER_BUILDKIT = "0"
      & (Join-Path $ScriptDir "docker-package-prebuilt.ps1") $svc
      $packaged++
      Start-Sleep -Seconds 1
    } else {
      Write-Host "  image up-to-date (skip package)" -ForegroundColor DarkGray
    }

    docker compose @envFile @profile up -d --no-build $svc 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "  compose up failed: $svc (missing deps?)"
    } else {
      $started++
    }
    Start-Sleep -Seconds 1
  }
  Write-Host "`nGo stack: compiled=$built packaged=$packaged started=$started" -ForegroundColor Green
}

function Start-Quick {
  Write-Host "`n=== Quick mode: start existing images (no compile) ===" -ForegroundColor Cyan
  Start-Infra
  $all = Get-TargetServices
  if ($WithStorefront) { $all += @("storefront") }
  foreach ($svc in $all) {
    docker compose @envFile @profile up -d --no-build $svc 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "  $svc not up (missing image?) — run without -Quick once"
    }
  }
}

# --- main ---
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AQOND v2 dev-up-all" -ForegroundColor Cyan
Write-Host "  Mode: $(Get-ModeLabel)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Wait-DockerReady

if ($InfraOnly) {
  Start-Infra
} elseif ($Quick) {
  Start-Quick
} else {
  Start-Infra
  Start-GoStack
  if ($WithStorefront) {
    Write-Host "`n=== Storefront (optional, may be slow first time) ===" -ForegroundColor Yellow
    Write-Host "  Tip: use dev-marketplace.ps1 + storefront-dev.ps1 instead" -ForegroundColor DarkGray
    docker compose @envFile @profile up -d --build storefront
  }
}

if (-not $SkipMigrations -and -not $InfraOnly) {
  Write-Host "`n=== Migrations ===" -ForegroundColor Cyan
  & (Join-Path $ScriptDir "apply-migrations.ps1")
}

$sw.Stop()
Write-Host "`n=== dev-up-all finished in $([math]::Round($sw.Elapsed.TotalMinutes, 1)) min ===" -ForegroundColor Green
docker compose @envFile @profile ps

if (-not $SkipHealthCheck -and -not $InfraOnly) {
  Write-Host ""
  & (Join-Path $ScriptDir "dev-health-check.ps1") @(
    $(if ($WithStorefront) { "-WithStorefront" })
    $(if ($OpenBrowser) { "-OpenBrowser" })
    "-RunSmoke"
  )
}

$nextCmd = if ($Product) { "dev-marketplace.ps1 -Quick" } else { "dev-up-all.ps1 -Quick" }
Write-Host @"

========================================
  NEXT TIME (fast):
    pwsh -File infra/scripts/$nextCmd

  Infra only (restart DB/Kong when Docker flaky):
    pwsh -File infra/scripts/dev-up-all.ps1 -InfraOnly -Product

  Product terminals (AI Jarvis + UI):
    pwsh -File infra/scripts/ai-core-local.ps1
    pwsh -File infra/scripts/storefront-dev.ps1

  Health check:
    pwsh -File infra/scripts/dev-health-check.ps1 -RunSmoke

  Browser:
    http://127.0.0.1:8000  (Kong API)
    http://127.0.0.1:3000  (storefront-dev)
    /feed /m/home /m/sell (AI listing)
========================================
"@ -ForegroundColor Green
