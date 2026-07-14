# P174: extreme flash-sale profile (dev-lite capped VUs; scale VUS in cloud).
param(
  [int]$Vus = 100,
  [string]$Duration = '60s'
)
& (Join-Path $PSScriptRoot 'run-loadtest-baseline.ps1') -Scenario 'flash-sale' -Vus $Vus -Duration $Duration
