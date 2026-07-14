#Requires -Version 5.1
<#
  RECOMMENDED path for Go microservices on Docker Desktop (Windows):
    1) Compile on host (E: caches) — no golang image / no parallel compile in VM
    2) Tiny distroless image (~20MB context)
    3) compose up --no-build

  Usage:
    pwsh -File infra/scripts/docker-up-go.ps1 bff-svc
    pwsh -File infra/scripts/docker-up-go.ps1 bff-svc -SkipHostBuild   # binary already built
    pwsh -File infra/scripts/docker-up-go.ps1 -Step1                   # smoke-test core set
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Services = @(),

  [switch] $Step1,
  [switch] $SkipHostBuild,
  [switch] $InstallGo
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root
$ScriptDir = $PSScriptRoot

$coreServices = @(
  "foundation-svc", "catalog-svc", "promotions-svc", "coupon-svc",
  "account-svc", "coins-svc", "creator-svc", "wallet-svc",
  "order-svc", "cart-svc", "checkout-svc", "bff-svc"
)

$targets = if ($Step1) { $coreServices } elseif ($Services.Count -gt 0) { @($Services) } else {
  throw "Usage: docker-up-go.ps1 bff-svc  |  docker-up-go.ps1 -Step1"
}

$envFile = @("--env-file", "infra/.env")
$composeProfile = @("--profile", "dev-lite")

Write-Host "=== docker-up-go (host compile + tiny image) ===" -ForegroundColor Cyan

if (-not $SkipHostBuild) {
  if ($InstallGo) {
    & (Join-Path $ScriptDir "go-host-build.ps1") -InstallGo @($targets[0])
  }
  foreach ($svc in $targets) {
    & (Join-Path $ScriptDir "go-host-build.ps1") $svc
  }
}

foreach ($svc in $targets) {
  Write-Host "`n--- package + up: $svc ---" -ForegroundColor Yellow
  & (Join-Path $ScriptDir "docker-package-prebuilt.ps1") $svc
  docker compose @envFile @composeProfile up -d --no-build $svc
  if ($LASTEXITCODE -ne 0) { throw "compose up failed: $svc" }
  Start-Sleep -Seconds 2
}

Write-Host "`n=== done ===" -ForegroundColor Green
docker compose @envFile @composeProfile ps $targets
