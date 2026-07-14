#Requires -Version 5.1
<#
  Build any Go service using Docker (when local C:\tools\go is broken).

  Usage:
    pwsh -File infra/scripts/go-build.ps1 notification-svc
    pwsh -File infra/scripts/go-build.ps1 checkout-svc
    pwsh -File infra/scripts/go-build.ps1 -All
#>
param(
  [Parameter(Position = 0)]
  [string] $Service = 'notification-svc',
  [switch] $All
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

$services = @(
  'notification-svc', 'bff-svc', 'checkout-svc', 'dispatch-svc',
  'payment-svc', 'order-svc', 'catalog-svc', 'feed-svc'
)

$targets = if ($All) { $services } else { @($Service) }

foreach ($svc in $targets) {
  $df = "services/$svc/Dockerfile"
  if (-not (Test-Path $df)) {
    Write-Warning "Skip $svc — no Dockerfile"
    continue
  }
  Write-Host "=== docker build $svc ===" -ForegroundColor Cyan
  docker compose --profile dev-lite build $svc
  if ($LASTEXITCODE -ne 0) { throw "build failed: $svc" }
}
Write-Host "Go build(s) OK via Docker" -ForegroundColor Green
