# P47-P48: Bootstrap Citus cluster + apply schema + distribute tables
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Compose = Join-Path $Root "docker-compose.yml"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "=== Start Citus nodes ==="
docker compose --env-file $EnvFile -f $Compose --profile dev-lite up -d citus-worker-1 citus-worker-2 citus-coordinator

Write-Host "=== Wait for coordinator ==="
for ($i = 0; $i -lt 40; $i++) {
  $hc = docker inspect aqond-v2-citus-coord --format '{{.State.Health.Status}}' 2>$null
  if ($hc -eq "healthy") { break }
  Start-Sleep -Seconds 5
}

Write-Host "=== Bootstrap workers (P47) ==="
docker compose --env-file $EnvFile -f $Compose --profile dev-lite cp (Join-Path $Root "infra\citus\bootstrap-cluster.sh") citus-coordinator:/tmp/bootstrap-cluster.sh
docker compose --env-file $EnvFile -f $Compose --profile dev-lite exec -T -e "POSTGRES_PASSWORD=$Pass" -e "POSTGRES_USER=$User" citus-coordinator bash /tmp/bootstrap-cluster.sh

$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD

function Run-CitusSql($File) {
  Write-Host "  -> $(Split-Path $File -Leaf)"
  Get-Content $File -Raw | docker compose --env-file $EnvFile -f $Compose --profile dev-lite `
    exec -T -e "PGPASSWORD=$Pass" citus-coordinator psql -U $User -d commerce -v ON_ERROR_STOP=1
}

Write-Host "=== Apply commerce schema on Citus ==="
Run-CitusSql (Join-Path $Root "infra\postgres\migrations\008_commerce_core.sql")
Run-CitusSql (Join-Path $Root "infra\postgres\migrations\009_feed_media.sql")
Run-CitusSql (Join-Path $Root "infra\postgres\migrations\010_shard_catalog.sql")

Write-Host "=== Distribute tables (P48) ==="
Run-CitusSql (Join-Path $Root "infra\citus\012_distribute_tables.sql")

Write-Host "Citus bootstrap complete. Coordinator: localhost:5434"
