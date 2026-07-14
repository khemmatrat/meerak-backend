# P61-P80: Deploy AQOND to local kind cluster
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Chart = Join-Path $Root "infra\helm\aqond"

Write-Host "=== Create kind cluster (if missing) ==="
if (-not (kind get clusters 2>$null | Select-String "aqond")) {
  kind create cluster --name aqond --config (Join-Path $Root "infra\k8s\kind-config.yaml")
}

Write-Host "=== Apply base namespace + stateful ==="
kubectl apply -f (Join-Path $Root "infra\k8s\base\namespace.yaml")
kubectl apply -f (Join-Path $Root "infra\k8s\stateful\")

Write-Host "=== Helm install (dev values) ==="
helm upgrade --install aqond $Chart `
  -f (Join-Path $Chart "values-dev.yaml") `
  -n aqond-dev --create-namespace

Write-Host "=== Wait for deployments ==="
kubectl rollout status deployment/kong -n aqond-dev --timeout=120s 2>$null

Write-Host "Port-forward: kubectl port-forward -n aqond-dev svc/kong-proxy 8000:80"
Write-Host "Grafana: kubectl port-forward -n aqond-dev svc/grafana 3000:3000"
Write-Host "Deploy complete. Run smoke-test-p61-p80-k8s.ps1 after images are loaded into kind."
