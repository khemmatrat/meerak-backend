# P60: Chaos drill on sharded cluster — worker stop + recovery check
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Write-Host "=== P60 chaos: baseline shard metrics ==="
$base = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/metrics" -TimeoutSec 30
Write-Host "hot_shards=$($base.hot_shards | ConvertTo-Json -Compress)"

Write-Host "`n=== Stop citus-worker-2 (simulate shard outage) ==="
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite stop citus-worker-2
Start-Sleep -Seconds 5

Write-Host "=== Topology should show degraded worker ==="
try {
  $topo = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/topology" -TimeoutSec 15
  Write-Host "catalog entries: $($topo.catalog.Count)"
} catch {
  Write-Host "WARN: topology check failed during outage (expected if Citus required)" -ForegroundColor Yellow
}

Write-Host "`n=== Recover worker-2 ==="
docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") --profile dev-lite start citus-worker-2
Start-Sleep -Seconds 15

Write-Host "`n=== Post-recovery admin report (P51) ==="
$report = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/admin/report" -TimeoutSec 30
Write-Host "orders_by_shard rows: $($report.rows.Count)"

Write-Host "`nP60 chaos drill complete. SLO: coordinator available, scatter-gather admin queries recover."
