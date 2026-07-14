#Requires -Version 5.1
<#
  Step 1 smoke path — HOST Go compile + tiny Docker images (no in-VM golang build).

  Usage:
    pwsh -File infra/scripts/docker-build-step1.ps1
    pwsh -File infra/scripts/docker-build-step1.ps1 -From bff-svc
    pwsh -File infra/scripts/docker-build-step1.ps1 -InstallGo
#>
param(
  [string] $From = "",
  [switch] $InstallGo
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$BuildOne = Join-Path $ScriptDir "docker-build-one.ps1"

Write-Host "=== Infra (pull only) ===" -ForegroundColor Cyan
foreach ($infra in @("aqond-db", "aqond-redis", "kong", "minio", "redpanda")) {
  & $BuildOne -Service $infra -PullOnly
}

$step1 = @(
  "foundation-svc", "catalog-svc", "promotions-svc", "coupon-svc",
  "account-svc", "coins-svc", "creator-svc", "wallet-svc",
  "order-svc", "cart-svc", "checkout-svc", "bff-svc"
)

$start = 0
if ($From) {
  $idx = [array]::IndexOf($step1, $From)
  if ($idx -lt 0) { throw "Unknown -From service: $From" }
  $start = $idx
}

for ($i = $start; $i -lt $step1.Count; $i++) {
  $svc = $step1[$i]
  Write-Host "`n========== [$($i + 1)/$($step1.Count)] $svc (host build) ==========" -ForegroundColor Cyan
  & $BuildOne -Service $svc @($(if ($InstallGo) { "-InstallGo" }))
}

Write-Host "`n=== Step 1 complete ===" -ForegroundColor Green
Write-Host "Next: pwsh -File infra/scripts/apply-migrations.ps1"
Write-Host "      pwsh -File infra/scripts/smoke-test-p201-p230.ps1"
