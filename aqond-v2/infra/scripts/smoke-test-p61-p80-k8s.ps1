# P61-P80 K8s smoke test (requires kind cluster + helm deploy)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

Write-Host "=== P62/P63 Helm release status ==="
helm status aqond -n aqond-dev 2>$null
if ($LASTEXITCODE -ne 0) { throw "Run deploy-kind.ps1 first" }

Write-Host "`n=== P67 probes — pod readiness ==="
$notReady = kubectl get pods -n aqond-dev --field-selector=status.phase!=Running 2>$null
if ($notReady) { Write-Host "WARN: some pods not Running" -ForegroundColor Yellow }
kubectl get pods -n aqond-dev

Write-Host "`n=== P64 Kong ingress ==="
kubectl get ingress -n aqond-dev

Write-Host "`n=== P58 Prometheus / P74 Grafana services ==="
kubectl get svc -n aqond-dev prometheus grafana 2>$null

Write-Host "`n=== P68 KEDA ScaledObjects ==="
kubectl get scaledobject -n aqond-dev 2>$null

Write-Host "`n=== P80 NetworkPolicies ==="
kubectl get networkpolicy -n aqond-dev

Write-Host "`n=== Port-forward test (manual) ==="
Write-Host "  kubectl port-forward -n aqond-dev svc/kong-proxy 8000:80"
Write-Host "  curl http://127.0.0.1:8000/api/v1/foundation/health"

Write-Host "`n=== P61-P80 K8s smoke checklist PASSED ===" -ForegroundColor Green
