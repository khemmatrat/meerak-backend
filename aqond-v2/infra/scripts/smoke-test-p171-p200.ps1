# P171-P200 Scale, SLO, resilience, readiness smoke test (Epoch 10)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

function J($obj) { $obj | ConvertTo-Json -Depth 6 }
function Url($p) { "http://127.0.0.1:${Kong}$p" }

Write-Host "=== P171 sre-svc health + SLO list ==="
$h = Invoke-RestMethod -Uri (Url "/api/v1/sre/health") -TimeoutSec 30
if (-not $h.ok) { throw "sre-svc unhealthy" }
$slos = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/slo") -TimeoutSec 30
Write-Host "OK slos=$($slos.slos.Count)"

Write-Host "`n=== P171 SLO record + budget ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/slo/record") -Method POST -ContentType "application/json" `
  -Body (J @{ slo_id="slo-checkout-avail"; observed=0.9996; region="TH" }) | Out-Null
$bud = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/slo/budget?journey=checkout") -TimeoutSec 30
Write-Host "OK release_allowed=$($bud.release_allowed)"

Write-Host "`n=== P172 capacity + headroom ==="
$cap = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/capacity?tier=100M") -TimeoutSec 30
$hd = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/capacity/headroom?tier=1B") -TimeoutSec 30
Write-Host "OK services=$($cap.services.Count) headroom=$($hd.headroom_ok)"

Write-Host "`n=== P173 load test run registry ==="
$lr = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/loadtest/runs") -Method POST -ContentType "application/json" `
  -Body (J @{ scenario="mixed-traffic"; vus=30; duration_sec=60; p95_ms=120; error_rate=0.01; passed=$true })
Write-Host "OK run_id=$($lr.run_id)"

Write-Host "`n=== P177-P179 tier health ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/tier/health") -Method POST -ContentType "application/json" `
  -Body (J @{ tier="kafka"; status="healthy"; consumer_lag_max=100 }) | Out-Null
$th = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/tier/health") -TimeoutSec 30
Write-Host "OK tiers=$(($th.tiers.PSObject.Properties | Measure-Object).Count)"

Write-Host "`n=== P180 tail latency sample ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/latency/tail") -Method POST -ContentType "application/json" `
  -Body (J @{ service="order-svc"; route="/v1/flash/buy"; p99_ms=45; p999_ms=120 }) | Out-Null
Write-Host "OK tail recorded"

Write-Host "`n=== P181 region status + P182 failover ==="
$reg = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/region/status") -Headers @{ "X-Aqond-Region"="TH" } -TimeoutSec 30
$fo = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/region/failover") -Method POST -ContentType "application/json" `
  -Body (J @{ from_region="TH"; to_region="SEA"; trigger="game-day"; rto_sec=300; rpo_sec=60 })
Write-Host "OK regions=$($reg.regions.Count) failover=$($fo.failover_id)"

Write-Host "`n=== P183 chaos gameday ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/chaos/gameday") -Method POST -ContentType "application/json" `
  -Body (J @{ scenario="broker_loss"; blast_radius="staging"; recovered=$true; score=85 }) | Out-Null
Write-Host "OK chaos recorded"

Write-Host "`n=== P184 degradation + shed ==="
$deg = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/degrade/state") -TimeoutSec 30
$shed = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/degrade/shed") -Method POST -ContentType "application/json" `
  -Body (J @{ surface="browse"; level="brownout" })
Write-Host "OK level=$($deg.level) browse_shed=$($shed.should_shed)"

Write-Host "`n=== P185-P188 ops stubs ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/cost/metrics") -TimeoutSec 15 | Out-Null
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/cdc/status") -TimeoutSec 15 | Out-Null
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/ml/platform") -TimeoutSec 15 | Out-Null
Write-Host "OK cost/cdc/ml"

Write-Host "`n=== P189-P195 security/compliance/runbooks ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/security/posture") -TimeoutSec 15 | Out-Null
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/compliance/audit") -Method POST -TimeoutSec 15 | Out-Null
$rb = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/runbooks") -TimeoutSec 15
$vg = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/vendors/slo") -TimeoutSec 15
Write-Host "OK runbooks=$($rb.runbooks.Count) vendors=$($vg.vendors.Count)"

Write-Host "`n=== P193 release gates ==="
$rg = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/release/gates?journey=checkout") -TimeoutSec 15
Write-Host "OK release_allowed=$($rg.release_allowed)"

Write-Host "`n=== P196-P197 edge + tenancy ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/edge/cdn") -TimeoutSec 15 | Out-Null
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/tenancy/merchants") -TimeoutSec 15 | Out-Null
Write-Host "OK edge/tenancy"

Write-Host "`n=== P198 rehearsal scorecard ==="
$reh = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/rehearsal/scorecard") -Method POST -ContentType "application/json" `
  -Body (J @{ flash_passed=$true; feed_passed=$true; checkout_passed=$true; slo_met=$true; chaos_injected=$true })
Write-Host "OK rehearsal score=$($reh.score) passed=$($reh.passed)"

Write-Host "`n=== P199 readiness review ==="
$rev = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/readiness/review") -Method POST -ContentType "application/json" `
  -Body (J @{ scale_tier="100M"; score=85; go_no_go="conditional"; gaps=@(); signoffs=@{} })
Write-Host "OK review=$($rev.review_id) go_no_go=$($rev.go_no_go)"

Write-Host "`n=== P200 program cadence ==="
Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/program/cadence") -Method POST -ContentType "application/json" `
  -Body (J @{ event_type="slo_review"; scheduled_for="2026-07-01"; completed=$false }) | Out-Null
$prog = Invoke-RestMethod -Uri (Url "/api/v1/sre/v1/program/cadence") -TimeoutSec 15
Write-Host "OK cadence events=$($prog.cadence.Count)"

Write-Host "`n=== Epoch 10 (P171-P200) smoke test complete ==="
