# Recover aqond-v2-db when compose reports "container aqond-v2-db is unhealthy".
# Common on Windows + E: bind mounts after Postgres crash or rotate-secrets + force-recreate.
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Compose = Join-Path $Root "docker-compose.yml"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "=== aqond-v2-db repair ==="
Write-Host "1) Restart Postgres only and wait for health (up to 3 min)..."
docker compose --env-file $EnvFile -f $Compose up -d aqond-db 2>&1 | Out-Host

$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 5
  $status = docker inspect aqond-v2-db --format "{{.State.Health.Status}}" 2>$null
  if ($status -eq "healthy") {
    Write-Host "OK — aqond-v2-db is healthy"
    break
  }
  if (-not $status) { $status = "starting" }
  Write-Host "  status=$status ..."
} while ((Get-Date) -lt $deadline)

if ($status -ne "healthy") {
  Write-Host "`nStill unhealthy. Last 30 log lines:"
  docker logs aqond-v2-db 2>&1 | Select-Object -Last 30 | Out-Host
  Write-Host @"

If logs show 'could not open file' or 'database system is in recovery mode':
  pwsh infra/scripts/sync-postgres-password.ps1
  pwsh infra/scripts/apply-migrations.ps1

If Postgres will not start (crash loop), reset ONLY the postgres data dir (destroys DB data):
  docker compose --env-file infra/.env stop aqond-db
  Rename-Item E:/aqond-data/postgres E:/aqond-data/postgres.bak.$(Get-Date -Format yyyyMMdd-HHmmss)
  docker compose --env-file infra/.env up -d aqond-db
  pwsh infra/scripts/apply-migrations.ps1
  pwsh infra/scripts/sync-postgres-password.ps1
"@
  exit 1
}

Write-Host "2) Sync SCRAM password + start dependent services..."
& (Join-Path $PSScriptRoot "sync-postgres-password.ps1") | Out-Null
docker compose --env-file $EnvFile -f $Compose up -d 2>&1 | Out-Host
Write-Host "3) Restart Kong (upstream IPs change after recreate)..."
docker compose --env-file $EnvFile -f $Compose restart kong 2>&1 | Out-Host
Write-Host "Done."
