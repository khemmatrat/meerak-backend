#Requires -Version 5.1
<#
  Build and start ONE compose service — defaults to HOST compile (stable on Docker Desktop).

  Usage:
    pwsh -File infra/scripts/docker-build-one.ps1 bff-svc
    pwsh -File infra/scripts/docker-build-one.ps1 bff-svc -DockerCompile   # old risky path
    pwsh -File infra/scripts/docker-build-one.ps1 kong -PullOnly

  Host path (default for Go services):
    go-host-build -> tiny distroless image -> compose up --no-build
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $Service,

  [switch] $DockerCompile,
  [switch] $SkipBuild,
  [switch] $PullOnly,
  [switch] $InstallGo
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root
$ScriptDir = $PSScriptRoot

$env:DOCKER_BUILDKIT = if ($DockerCompile) { "1" } else { "0" }
$env:COMPOSE_PARALLEL_LIMIT = "1"

$envFile = @("--env-file", "infra/.env")
$profile = @("--profile", "dev-lite")

function Test-DockerReady {
  docker version 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker engine not ready — wait for Engine running or reset Docker Desktop"
  }
}

function Test-GoService {
  param([string] $Name)
  $goWork = Join-Path $Root "go.work"
  if (-not (Test-Path $goWork)) { return $false }
  $content = Get-Content $goWork -Raw
  return $content -match "./services/$Name"
}

function Invoke-DockerCompileBuild {
  param([string] $Name)
  $config = docker compose @envFile @profile config --format json 2>$null | ConvertFrom-Json
  if (-not $config.services.$Name) {
    throw "Unknown service '$Name'"
  }
  $svc = $config.services.$Name
  if (-not $svc.build) { return $false }
  $ctx = if ($svc.build.context) { $svc.build.context } else { "." }
  $df = if ($svc.build.dockerfile) { $svc.build.dockerfile } else { "Dockerfile" }
  if ([System.IO.Path]::IsPathRooted($ctx)) {
    $ctxPath = ($ctx -replace '/', '\').TrimEnd('\')
  } else {
    $rel = ($ctx -replace '/', '\').TrimStart('.\').TrimStart('\')
    $ctxPath = if ($rel) { Join-Path $Root $rel } else { $Root }
  }
  if (-not (Test-Path $ctxPath)) { throw "Build context not found: $ctxPath" }
  $dfPath = if ([System.IO.Path]::IsPathRooted($df)) { $df } else { Join-Path $ctxPath $df }
  if (-not (Test-Path $dfPath)) { throw "Dockerfile not found: $dfPath" }
  $image = "aqond-v2-${Name}:latest"
  Write-Host "Docker compile (heavy): $Name" -ForegroundColor Yellow
  Push-Location $ctxPath
  try {
    $buildArgs = @("build", "-f", $dfPath, "-t", $image, ".")
    if ($env:DOCKER_BUILDKIT -ne "0") {
      $buildArgs = @("build", "--progress=plain", "-f", $dfPath, "-t", $image, ".")
    }
    docker @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "docker build failed: $Name" }
  } finally {
    Pop-Location
  }
  return $true
}

Test-DockerReady
Write-Host "=== docker-build-one: $Service ===" -ForegroundColor Cyan

if ($PullOnly -or (-not (Test-GoService $Service) -and -not $DockerCompile)) {
  $config = docker compose @envFile @profile config --format json 2>$null | ConvertFrom-Json
  $hasBuild = $config.services.$Service.build
  if ($PullOnly -or -not $hasBuild) {
    Write-Host "Pull/up: $Service" -ForegroundColor Yellow
    docker compose @envFile @profile pull $Service 2>$null
    docker compose @envFile @profile up -d $Service
    if ($LASTEXITCODE -ne 0) { throw "compose up failed: $Service" }
    docker compose @envFile @profile ps $Service
    exit 0
  }
}

if ((Test-GoService $Service) -and -not $DockerCompile) {
  Write-Host "Host compile path (recommended)" -ForegroundColor Green
  if (-not $SkipBuild) {
    if ($InstallGo) { & (Join-Path $ScriptDir "go-host-build.ps1") -InstallGo $Service }
    else { & (Join-Path $ScriptDir "go-host-build.ps1") $Service }
  }
  & (Join-Path $ScriptDir "docker-package-prebuilt.ps1") $Service
  docker compose @envFile @profile up -d --no-build $Service
  if ($LASTEXITCODE -ne 0) { throw "compose up failed: $Service" }
  Write-Host "`nOK: $Service" -ForegroundColor Green
  docker compose @envFile @profile ps $Service
  exit 0
}

if (-not $SkipBuild) {
  $built = Invoke-DockerCompileBuild -Name $Service
  if (-not $built) {
    docker compose @envFile @profile up -d $Service
  } else {
    docker compose @envFile @profile up -d --no-build $Service
  }
} else {
  docker compose @envFile @profile up -d --no-build $Service
}

if ($LASTEXITCODE -ne 0) { throw "compose up failed: $Service" }
Write-Host "`nOK: $Service" -ForegroundColor Green
docker compose @envFile @profile ps $Service
