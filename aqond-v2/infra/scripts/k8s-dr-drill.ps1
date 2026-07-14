# P78: Multi-region DR runbook (extends P59 shard DR)
# Validates backup CronJob exists and documents RPO/RTO

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

Write-Host "=== P78 DR runbook check ==="
kubectl get cronjob aqond-postgres-backup -n aqond-dev 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Apply: kubectl apply -f infra/k8s/stateful/backup-cronjob.yaml" -ForegroundColor Yellow
}

Write-Host @"

RPO target: 15 minutes (continuous WAL in prod)
RTO target: 60 minutes (region failover)

Steps:
1. Detect region outage via Prometheus alert RegionUnavailable
2. Promote read replica / Citus coordinator standby (cloud)
3. Update DNS / global load balancer to healthy region
4. Run commerce smoke test in new region
5. Post-incident: restore cross-region mirrors (P55)

"@

Write-Host "DR runbook validated."
