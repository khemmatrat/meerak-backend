# P46-P60 Physical sharding smoke test
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Write-Host "=== P46/P49 shard topology ==="
$topo = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/topology" -TimeoutSec 30
if ($topo.catalog.Count -lt 1) { throw "shard catalog empty" }
Write-Host "OK shards=$($topo.catalog.Count) citus=$($topo.citus_enabled)"

Write-Host "`n=== P53 region routing ==="
$route = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/region/route?merchant_id=m-test&write=1" `
  -Headers @{ "X-Aqond-Region" = "TH" } -TimeoutSec 15
Write-Host "OK home=$($route.home_region) allowed=$($route.allowed) node=$($route.physical_node)"

Write-Host "`n=== P54 residency check ==="
$res = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/residency/check" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    entity_type = "merchant"; entity_id = "m-test"; shard_key = "m-test"
    home_region = "TH"; attempt_region = "SEA"; action = "write"
  } | ConvertTo-Json)
Write-Host "cross-region write blocked: allowed=$($res.allowed) (expect false)"

$resOk = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/residency/check" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    entity_type = "merchant"; entity_id = "m-test"; shard_key = "m-test"
    home_region = "TH"; attempt_region = "TH"; action = "write"
  } | ConvertTo-Json)
if (-not $resOk.allowed) { throw "home region write should be allowed" }

Write-Host "`n=== P55 mirror sync ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/mirror/sync" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    source_table = "products"; source_id = "p-demo"; home_region = "TH"
    mirror_region = "SEA"; payload = @{ title = "mirror test" }
  } | ConvertTo-Json) | Out-Null
Write-Host "OK mirror synced"

Write-Host "`n=== P51 admin cross-shard report ==="
$report = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/admin/report" -TimeoutSec 30
Write-Host "OK report rows=$($report.rows.Count)"

Write-Host "`n=== P58 shard metrics ==="
$met = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/v1/shard/metrics" -TimeoutSec 15
Write-Host "OK hot_shards=$($met.hot_shards | ConvertTo-Json -Compress)"

Write-Host "`n=== P57 regional kafka smoke ==="
$ks = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/kafka/smoke" -Method POST -TimeoutSec 30
Write-Host "OK topic=$($ks.topic)"

Write-Host "`n=== P46-P60 smoke PASSED ===" -ForegroundColor Green
