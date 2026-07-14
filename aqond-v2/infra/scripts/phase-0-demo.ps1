#Requires -Version 5.1
<#
  Phase 0 — full local demo: search + shipping + AI + seed 30 shops.

  First run (30-90 min if models not pulled):
    pwsh -ExecutionPolicy Bypass -File infra/scripts/phase-0-demo.ps1

  Daily restart (skip compile + model pull):
    pwsh -File infra/scripts/phase-0-demo.ps1 -Quick

  Skip Ollama model pull (already pulled):
    pwsh -File infra/scripts/phase-0-demo.ps1 -SkipModels

  Usage:
    pwsh -File infra/scripts/phase-0-demo.ps1
    pwsh -File infra/scripts/phase-0-demo.ps1 -Quick -SkipSeed
#>
param(
  [switch] $Quick,
  [switch] $SkipSeed,
  [switch] $SkipModels,
  [switch] $SkipSmoke,
  [switch] $SkipMigrations,
  [switch] $ResetSeed,
  [switch] $ForceRebuild,
  [switch] $PruneDocker,
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

# Services added in Phase 0 beyond dev-up-all minimal
$phase0Go = @("search-svc", "shipping-svc")

function Wait-DockerReady {
  $deadline = (Get-Date).AddMinutes(8)
  while ((Get-Date) -lt $deadline) {
    docker version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      docker info 2>&1 | Select-String "Server Version" | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker engine ready." -ForegroundColor Green
        return
      }
    }
    Write-Host "  waiting for Docker..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 5
  }
  throw "Docker not ready — open Docker Desktop until Engine running"
}

function Test-DockerDisk {
  Write-Host "`n=== Docker disk ===" -ForegroundColor Cyan
  $bucketBroken = $false
  docker images 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $bucketBroken = $true
    Write-Host "ERROR: Docker image store broken ('unable to read target bucket')." -ForegroundColor Red
    Write-Host "  Run: pwsh -File infra/scripts/docker-repair.ps1" -ForegroundColor Yellow
    Write-Host "  Then restart Docker Desktop and re-run phase-0-demo.ps1" -ForegroundColor Yellow
    if (-not $Quick) { throw "Docker bucket error — fix before Phase 0 can start new services (search/AI)" }
  } else {
    try { docker system df 2>&1 | Write-Host } catch { }
  }

  if ($PruneDocker -and -not $bucketBroken) {
    Write-Host "Pruning unused Docker data..." -ForegroundColor Yellow
    docker system prune -f 2>&1 | Out-Null
    Write-Host "Prune done." -ForegroundColor Green
    return
  }

  if (-not $bucketBroken) {
    Write-Host @"
If 'docker compose up' fails with disk errors:
  pwsh -File infra/scripts/docker-repair.ps1
  pwsh -File infra/scripts/phase-0-demo.ps1 -PruneDocker
"@ -ForegroundColor DarkGray
  }
}

function Start-GoService {
  param([string] $Svc)

  $bin = Join-Path $BinRoot $Svc
  if (-not $Quick) {
    $needBuild = $ForceRebuild -or -not (Test-Path $bin)
    if (-not $needBuild -and (Test-Path (Join-Path $Root "services\$Svc"))) {
      $newest = Get-ChildItem (Join-Path $Root "services\$Svc"), (Join-Path $Root "pkg") -Recurse -Filter *.go -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
      if ($newest -and $newest.LastWriteTimeUtc -gt (Get-Item $bin).LastWriteTimeUtc) { $needBuild = $true }
    }
    if ($needBuild) {
      Write-Host "  compile $Svc" -ForegroundColor DarkCyan
      & (Join-Path $ScriptDir "go-host-build.ps1") $Svc
    }
    $img = "aqond-v2-${Svc}:latest"
    $needPkg = $ForceRebuild
    if (-not $needPkg) {
      docker image inspect $img 2>$null | Out-Null
      $needPkg = ($LASTEXITCODE -ne 0)
    }
    if (-not $needPkg -and (Test-Path $bin)) {
      try {
        $imgT = [DateTime]::Parse((docker image inspect $img --format "{{.Created}}" 2>$null)).ToUniversalTime()
        $needPkg = (Get-Item $bin).LastWriteTimeUtc -gt $imgT
      } catch { $needPkg = $true }
    }
    if ($needPkg) {
      Write-Host "  package $Svc" -ForegroundColor DarkCyan
      $env:DOCKER_BUILDKIT = "0"
      & (Join-Path $ScriptDir "docker-package-prebuilt.ps1") $Svc
    }
  }

  Write-Host "  up $Svc" -ForegroundColor DarkGray
  docker compose @envFile @profile up -d --no-build $Svc 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "  compose up failed: $Svc — try -PruneDocker or restart Docker"
    return $false
  }
  return $true
}

function Wait-Ollama {
  param([int] $MaxWaitSec = 120)
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
      if ($r.models) { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Invoke-SearchReindex {
  Write-Host "`n=== Search reindex (catalog -> FTS) ===" -ForegroundColor Cyan
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/search/v1/index/reindex" -Method POST -TimeoutSec 120
    Write-Host "  reindexed: $($r.reindexed) documents" -ForegroundColor Green
  } catch {
    Write-Warning "  reindex failed: $($_.Exception.Message) — search-svc may still be starting"
  }
}

# --- main ---
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AQOND Phase 0 — Full Demo Bootstrap" -ForegroundColor Cyan
Write-Host "  Shops: $ShopCount | Quick: $Quick | Models: $(if ($SkipModels) { 'skip' } else { 'pull' })" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Wait-DockerReady
Test-DockerDisk

# Step 1: core marketplace (minimal 17 svc incl search+shipping)
Write-Host "`n=== Step 1: Marketplace core (dev-up-all) ===" -ForegroundColor Cyan
$devArgs = @()
if ($Quick) { $devArgs += "-Quick" }
if ($SkipMigrations) { $devArgs += "-SkipMigrations" }
if ($ForceRebuild) { $devArgs += "-ForceRebuild" }
$devArgs += "-SkipHealthCheck"
& (Join-Path $ScriptDir "dev-up-all.ps1") @devArgs
if ($LASTEXITCODE -ne 0) { Write-Warning "dev-up-all returned non-zero — continuing Phase 0 extras" }

# Step 2: AI stack (ollama + ai-core)
Write-Host "`n=== Step 2: AI stack (ollama + ai-core) ===" -ForegroundColor Cyan
$env:DOCKER_BUILDKIT = "0"
docker compose @envFile up -d ollama 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Warning "ollama start failed — check Docker disk"
} else {
  Start-Sleep -Seconds 5
  if (Wait-Ollama) {
    Write-Host "Ollama API ready on :11434" -ForegroundColor Green
  } else {
    Write-Warning "Ollama slow to start — continuing"
  }

  if (-not $SkipModels) {
    Write-Host "`n=== Pull Ollama models (lite: hermes3:3b + moondream) ===" -ForegroundColor Cyan
    Write-Host "  This may take 10-40 min on first run..." -ForegroundColor DarkYellow
    & (Join-Path $Root "infra\ai-core\scripts\pull-models.ps1")
    if ($LASTEXITCODE -ne 0) { Write-Warning "Model pull incomplete — AI may fail until models ready" }
  } else {
    Write-Host "SkipModels: assuming models already in E:\aqond-data\ollama" -ForegroundColor DarkGray
  }

  docker compose @envFile up -d --build ai-core 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Warning "ai-core start failed" }
  else { Write-Host "ai-core started" -ForegroundColor Green }
}

# Step 3: search reindex
Start-Sleep -Seconds 3
Invoke-SearchReindex

# Step 4: seed shops
if (-not $SkipSeed) {
  Write-Host "`n=== Step 4: Seed $ShopCount shops ===" -ForegroundColor Cyan
  $seedArgs = @("-ShopCount", $ShopCount)
  if ($ResetSeed) { $seedArgs += "-Reset" }
  & (Join-Path $ScriptDir "seed-production-shops.ps1") @seedArgs
  Invoke-SearchReindex
}

# Step 5: smoke
if (-not $SkipSmoke) {
  Write-Host "`n=== Step 5: Phase 0 smoke test ===" -ForegroundColor Cyan
  Start-Sleep -Seconds 5
  & (Join-Path $ScriptDir "smoke-test-phase0.ps1")
}

$sw.Stop()
Write-Host @"

========================================
  Phase 0 finished ($([math]::Round($sw.Elapsed.TotalMinutes, 1)) min)

  API:  http://127.0.0.1:8000/api/v1/bff/v1/home
  Search: http://127.0.0.1:8000/api/v1/search/v1/search?q=matcha
  AI health: http://127.0.0.1:8000/api/v1/ai/health  (header X-AI-Core-Api-Key)

  UI (2nd terminal):
    pwsh -File infra/scripts/storefront-dev.ps1
    http://localhost:3003/m/home   — camera = visual search
    http://localhost:3003/m/sell   — AI listing

  Re-test only:
    pwsh -File infra/scripts/smoke-test-phase0.ps1
========================================
"@ -ForegroundColor Green

docker compose @envFile @profile ps --format "table {{.Name}}\t{{.Status}}" 2>&1 | Select-String "search|shipping|ollama|ai-core|bff|catalog|kong"
