# P32 chaos drills on flash-sale hot path (dev-lite)
param(
  [ValidateSet('kill-order', 'metrics-check', 'all')]
  [string]$Drill = 'all'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

function Show-Metrics {
  Write-Host "`n--- order-svc /metrics ---"
  try {
    Invoke-RestMethod "http://127.0.0.1:8113/metrics" -TimeoutSec 5 | Out-String | Write-Host
  } catch {
    Write-Host "order metrics unavailable (start dev-lite profile)"
  }
  Write-Host "`n--- inventory-svc /metrics ---"
  try {
    Invoke-RestMethod "http://127.0.0.1:8111/metrics" -TimeoutSec 5 | Out-String | Write-Host
  } catch {
    Write-Host "inventory metrics unavailable"
  }
}

if ($Drill -eq 'metrics-check' -or $Drill -eq 'all') {
  Show-Metrics
}

if ($Drill -eq 'kill-order' -or $Drill -eq 'all') {
  Write-Host "`nRestarting order-svc (simulates consumer crash)..."
  docker compose --env-file (Join-Path $Root 'infra\.env') -f (Join-Path $Root 'docker-compose.yml') restart order-svc 2>&1 | Out-Host
  Start-Sleep -Seconds 8
  Write-Host "Flash buy should recover after consumer restarts (Kafka redelivery + dedup)."
  Show-Metrics
}

Write-Host "`nP32 SLO targets (dev-lite baseline):"
Write-Host "  flash buy p95 < 5000ms under 50 VUs"
Write-Host "  error rate < 10% (excluding expected 409 stock conflicts)"
Write-Host "  no negative inventory after load test"
Write-Host "Run: pwsh infra/scripts/run-loadtest-baseline.ps1 -Scenario flash-sale"
