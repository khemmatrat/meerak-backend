#Requires -Version 5.1
<#
  Package a host-built linux binary into a tiny distroless image (no compile in Docker).

  Usage:
    pwsh -File infra/scripts/docker-package-prebuilt.ps1 bff-svc
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $Service
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

$DataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT -replace '/', '\' } else { "E:\aqond-data" }
$BinFile = Join-Path $DataRoot "bin\$Service"
if (-not (Test-Path $BinFile)) {
  throw "Binary not found: $BinFile — run: pwsh -File infra/scripts/go-host-build.ps1 $Service"
}

$envFile = @("--env-file", "infra/.env")
$profile = @("--profile", "dev-lite")

# Reliable ports (compose YAML source of truth)
$ServicePorts = @{
  "foundation-svc" = 8101
  "catalog-svc"    = 8110
  "inventory-svc"  = 8111
  "wallet-svc"     = 8112
  "order-svc"      = 8113
  "payment-svc"    = 8120
  "checkout-svc"   = 8121
  "search-svc"     = 8122
  "bff-svc"        = 8132
  "cart-svc"       = 8133
  "settings-svc"   = 8134
  "sre-svc"        = 8135
  "promotions-svc" = 8136
  "coupon-svc"     = 8137
  "account-svc"    = 8138
  "coins-svc"      = 8139
  "creator-svc"    = 8140
  "readmodel-svc"  = 8114
  "feed-svc"       = 8115
  "video-svc"      = 8116
  "rec-svc"        = 8117
  "reviews-svc"    = 8123
  "trust-svc"      = 8124
  "recsys-svc"     = 8125
  "locale-svc"     = 8126
  "shipping-svc"   = 8127
  "address-svc"    = 8128
  "compliance-svc" = 8129
  "policy-svc"     = 8130
  "notification-svc" = 8131
  "transcode-worker" = 8080
}

function Get-ComposeServicePort {
  param([string] $Name)
  if ($ServicePorts.ContainsKey($Name)) { return $ServicePorts[$Name] }
  return 8080
}

function Get-ComposeProjectName {
  $project = $env:COMPOSE_PROJECT_NAME
  if (-not $project -and (Test-Path (Join-Path $Root "infra\.env"))) {
    Get-Content (Join-Path $Root "infra\.env") | ForEach-Object {
      if ($_ -match '^\s*COMPOSE_PROJECT_NAME=(.+)$') { $project = $matches[1].Trim() }
    }
  }
  if (-not $project) { $project = "aqond-v2" }
  return $project
}

docker version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker engine not ready" }

$project = Get-ComposeProjectName
$port = Get-ComposeServicePort -Name $Service
$image = "${project}-${Service}:latest"
$stageDir = Join-Path $DataRoot "tmp\docker-prebuilt\$Service"
$serviceFile = Join-Path $stageDir "service"
$dockerfile = Join-Path $Root "infra\docker\go-service.prebuilt.Dockerfile"

if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
Copy-Item $BinFile $serviceFile -Force
Copy-Item $dockerfile (Join-Path $stageDir "Dockerfile") -Force

Write-Host "=== docker package (prebuilt) $Service -> $image PORT=$port ===" -ForegroundColor Cyan
$env:DOCKER_BUILDKIT = "0"
$env:COMPOSE_DOCKER_CLI_BUILD = "0"

# Legacy builder (DOCKER_BUILDKIT=0) does not support --progress=plain
docker build `
  --build-arg "PORT=$port" `
  -t $image `
  $stageDir

if ($LASTEXITCODE -ne 0) { throw "docker build failed: $Service" }
Write-Host "OK image $image" -ForegroundColor Green
