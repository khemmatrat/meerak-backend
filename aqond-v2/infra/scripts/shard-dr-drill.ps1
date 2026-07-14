# P59: Per-shard DR drill — backup coordinator + restore verification stub
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $Root "infra\citus\backups"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD

Write-Host "=== P59 DR drill: pg_dump commerce schema+data from Citus coordinator ==="
$out = Join-Path $BackupDir "citus-commerce-$Stamp.sql"
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite `
  exec -T -e "PGPASSWORD=$Pass" citus-coordinator `
  pg_dump -U $User -d commerce --schema=commerce -Fc `
  | Set-Content -Path $out -Encoding Byte

$size = (Get-Item $out).Length
Write-Host "Backup: $out ($size bytes)"
Write-Host "RPO target: 15 min | RTO target: 60 min (documented for Epoch 6 cloud DR)"
Write-Host "DR drill complete — restore test: pg_restore -d commerce $out"
