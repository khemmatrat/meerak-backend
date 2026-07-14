#Requires -Version 5.1
<#
  Check localhost / Kong routes after dev-up-all.

  Usage:
    pwsh -File infra/scripts/dev-health-check.ps1
    pwsh -File infra/scripts/dev-health-check.ps1 -WithStorefront
    pwsh -File infra/scripts/dev-health-check.ps1 -RunSmoke
#>
param(
  [switch] $WithStorefront,
  [switch] $RunSmoke,
  [switch] $OpenBrowser
)

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Kong = "http://127.0.0.1:8000"
$results = @()

function Add-Result($Name, $Url, $Ok, $Detail) {
  $script:results += [pscustomobject]@{
    Check  = $Name
    URL    = $Url
    Status = if ($Ok) { "OK" } else { "FAIL" }
    Detail = $Detail
  }
  $color = if ($Ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1} — {2}" -f $(if ($Ok) { "OK" } else { "FAIL" }), $Name, $Detail) -ForegroundColor $color
  if ($Url -and $Ok -and $OpenBrowser) {
    Start-Process $Url | Out-Null
  }
}

function Test-HttpGet {
  param([string] $Name, [string] $Url, [int] $TimeoutSec = 15, [scriptblock] $Validate)
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    $ok = $r.StatusCode -ge 200 -and $r.StatusCode -lt 400
    if ($ok -and $Validate) {
      try { $ok = [bool](& $Validate $r) } catch { $ok = $false }
    }
    Add-Result $Name $Url $ok "HTTP $($r.StatusCode)"
  } catch {
    Add-Result $Name $Url $false ($_.Exception.Message)
  }
}

function Test-HttpJson {
  param([string] $Name, [string] $Url, [scriptblock] $Validate, [hashtable] $Headers = @{})
  try {
    $j = Invoke-RestMethod -Uri $Url -TimeoutSec 20 -Headers $Headers
    $ok = $true
    if ($Validate) { $ok = [bool](& $Validate $j) }
    Add-Result $Name $Url $ok "JSON ok"
  } catch {
    Add-Result $Name $Url $false ($_.Exception.Message)
  }
}

Write-Host "=== AQOND v2 localhost health check ===" -ForegroundColor Cyan

# Docker engine
try {
  docker version 2>&1 | Out-Null
  Add-Result "Docker engine" "" ($LASTEXITCODE -eq 0) "docker version"
} catch {
  Add-Result "Docker engine" "" $false $_.Exception.Message
}

# Container count
try {
  $running = (docker ps --format "{{.Names}}" 2>$null | Measure-Object).Count
  Add-Result "Containers running" "" ($running -gt 0) "$running container(s)"
} catch {
  Add-Result "Containers running" "" $false "docker ps failed"
}

# Postgres
try {
  $envFile = Join-Path $Root "infra\.env"
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
  }
  $user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
  $pass = $env:POSTGRES_PASSWORD
  docker compose --env-file $envFile exec -T -e "PGPASSWORD=$pass" aqond-db pg_isready -U $user -d postgres 2>&1 | Out-Null
  Add-Result "Postgres (5433)" "localhost:5433" ($LASTEXITCODE -eq 0) "pg_isready"
} catch {
  Add-Result "Postgres (5433)" "localhost:5433" $false $_.Exception.Message
}

Test-HttpGet "Kong gateway" "$Kong/" 10 { param($r) $true }
Test-HttpGet "Redpanda Console" "http://127.0.0.1:8088/" 15
Test-HttpGet "MinIO health" "http://127.0.0.1:9000/minio/health/live" 10

# Go services via Kong
$apiChecks = @(
  @{ Name = "promotions-svc"; Path = "/api/v1/promotions/health"; Validate = { param($j) $j.ok -eq $true } }
  @{ Name = "foundation-svc"; Path = "/api/v1/foundation/health"; Validate = { param($j) $j.ok -eq $true } }
  @{ Name = "catalog-svc"; Path = "/api/v1/catalog/health"; Validate = { param($j) $j.ok -eq $true } }
  @{ Name = "wallet-svc"; Path = "/api/v1/wallet/health"; Validate = { param($j) $j.ok -eq $true } }
  @{ Name = "order-svc"; Path = "/api/v1/orders/health"; Validate = { param($j) $j.ok -eq $true } }
  @{ Name = "bff-svc (via home)"; Path = "/api/v1/bff/v1/home"; Validate = { param($j) $null -ne $j } }
  @{ Name = "search-svc"; Path = "/api/v1/search/health"; Validate = { param($j) $j.ok -eq $true } }
  @{ Name = "shipping-svc"; Path = "/api/v1/shipping/health"; Validate = { param($j) $j.ok -eq $true } }
)

foreach ($c in $apiChecks) {
  $url = "$Kong$($c.Path)"
  Test-HttpJson -Name $c.Name -Url $url -Validate $c.Validate -Headers @{
    "X-User-Id" = "health-check"
    "X-Session-Id" = "health-check"
    "X-Aqond-Region" = "TH"
  }
}

# AI stack (optional — needs ollama + ai-core from phase-0-demo.ps1)
Get-Content (Join-Path $Root "infra\.env") | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}
$aiKey = if ($env:AI_CORE_API_KEY) { $env:AI_CORE_API_KEY } else { "" }
if ($aiKey) {
  Test-HttpJson -Name "ai-core" -Url "$Kong/api/v1/ai/health" -Validate { param($j) $j.ok -eq $true } -Headers @{
    "X-AI-Core-Api-Key" = $aiKey
  }
}

if ($WithStorefront) {
  $pages = @("/", "/shop", "/login", "/cart", "/feed", "/m/home", "/creator/studio")
  foreach ($p in $pages) {
    Test-HttpGet "Storefront $p" "http://127.0.0.1:3000$p" 30
  }
}

Write-Host ""
$fail = @($results | Where-Object { $_.Status -eq "FAIL" })
$ok = @($results | Where-Object { $_.Status -eq "OK" })
Write-Host "Summary: $($ok.Count) OK / $($fail.Count) FAIL / $($results.Count) total" -ForegroundColor $(if ($fail.Count -eq 0) { "Green" } else { "Yellow" })

if ($fail.Count -gt 0) {
  Write-Host "`nFailed checks:" -ForegroundColor Yellow
  $fail | Format-Table Check, URL, Detail -AutoSize | Out-String | Write-Host
}

Write-Host "`nOpen in browser:" -ForegroundColor Cyan
Write-Host "  API (Kong):     $Kong/api/v1/bff/v1/home  (needs X-User-Id header in client)"
Write-Host "  Redpanda UI:    http://127.0.0.1:8088"
Write-Host "  MinIO:          http://127.0.0.1:9000"
if ($WithStorefront) { Write-Host "  Storefront:     http://127.0.0.1:3000" }

if ($RunSmoke) {
  Write-Host "`n=== Running smoke-test-p201-p230 ===" -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "smoke-test-p201-p230.ps1")
}

if ($fail.Count -gt 0) { exit 1 }
exit 0
