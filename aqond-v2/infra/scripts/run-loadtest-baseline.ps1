# P23 baseline load tests via k6 in Docker (no local k6 install required)
param(
  [ValidateSet('flash-sale', 'catalog-read', 'order-placement', 'flash-queue', 'feed-read', 'mixed-traffic', 'feed-fanout', 'soak', 'full-rehearsal')]
  [string]$Scenario = 'flash-sale',
  [int]$Vus = 50,
  [string]$Duration = '30s',
  [string]$Kong = 'http://host.docker.internal:8000'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Loadtest = Join-Path $Root 'loadtest'
$Results = Join-Path $Loadtest 'results'
New-Item -ItemType Directory -Force -Path $Results | Out-Null

$script = Join-Path $Loadtest "$Scenario.js"
if (-not (Test-Path $script)) { throw "Missing $script" }

$network = docker inspect aqond-v2-kong --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>$null
if (-not $network) {
  $network = docker network ls --filter name=aqond --format '{{.Name}}' | Select-Object -First 1
}
if (-not $network) { throw 'Start stack first (docker compose --profile dev-lite up -d)' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Write-Host "=== P23 loadtest: $Scenario vus=$Vus duration=$Duration network=$network ==="

docker run --rm `
  --network $network `
  -v "${Loadtest}:/scripts" `
  -e "KONG=$Kong" `
  -e "VUS=$Vus" `
  -e "DURATION=$Duration" `
  grafana/k6:latest run "/scripts/$Scenario.js" 2>&1 | Tee-Object -FilePath (Join-Path $Results "baseline-$Scenario-$stamp.log")

Write-Host "Log: loadtest/results/baseline-$Scenario-$stamp.log"
