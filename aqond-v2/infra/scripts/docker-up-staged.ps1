# Staged docker compose up — pull heavy images in batches.
# Go services: prefer host compile (stable):
#   pwsh -File infra/scripts/docker-up-go.ps1 -Step1
#   pwsh -File infra/scripts/docker-up-go.ps1 bff-svc -InstallGo
# Run AFTER Docker Desktop shows Running.
$ErrorActionPreference = "Stop"
$Root = "G:\meerak\aqond-v2"
Set-Location $Root

Write-Host "=== Docker staged startup (E: disk) ===" -ForegroundColor Cyan
docker version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker not ready — run docker-unstick.ps1 first" }

$envFile = "--env-file", "infra/.env"
$profile = "--profile", "dev-lite"

function Pull-Batch($label, [string[]]$services) {
  Write-Host "`n--- Pull: $label ---" -ForegroundColor Yellow
  docker compose @envFile @profile pull @services
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Pull failed for $label — retry this batch after Docker restart"
    throw "pull failed: $label"
  }
}

# Batch 1: small infra
Pull-Batch "core infra" @("aqond-db", "kong", "aqond-redis", "redpanda", "redpanda-console", "minio", "livekit")

# Batch 2: heavy images one-by-one (each can take several minutes)
foreach ($svc in @("scylla", "citus-coordinator", "citus-worker-1", "citus-worker-2", "ollama")) {
  Pull-Batch $svc @($svc)
}

Write-Host "`n--- Start containers (build Go services) ---" -ForegroundColor Yellow
Write-Host "This will take 15-30 min on first run. Do NOT close Docker Desktop.`n"
docker compose @envFile @profile up -d --build

Write-Host "`n=== Status ===" -ForegroundColor Cyan
docker compose @envFile @profile ps

Write-Host @"

Next:
  ./infra/scripts/apply-migrations.ps1
  ./infra/scripts/smoke-test-p201-p230.ps1

"@ -ForegroundColor Green
