# P52: Online rebalance — add capacity / move shards (Citus rebalance_table_shards)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD

Write-Host "=== P52 rebalance_table_shards (commerce.orders) ==="
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite `
  exec -T -e "PGPASSWORD=$Pass" citus-coordinator psql -U $User -d commerce -c `
  "SELECT rebalance_table_shards('commerce.orders');"

Write-Host "=== Shard placement after rebalance ==="
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite `
  exec -T -e "PGPASSWORD=$Pass" citus-coordinator psql -U $User -d commerce -c `
  "SELECT nodename, count(*) FROM pg_dist_shard_placement GROUP BY nodename;"

Write-Host "Rebalance complete. See infra/citus/TOPOLOGY.md for runbook."
