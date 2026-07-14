#Requires -Version 5.1
<#
  Compile AQOND Go services on Windows/host (output: linux/amd64 static binary on E:).
  Avoids Docker BuildKit compile OOM / containerd EOF on Docker Desktop.

  Usage:
    pwsh -File infra/scripts/go-host-build.ps1 bff-svc
    pwsh -File infra/scripts/go-host-build.ps1 -All
    pwsh -File infra/scripts/go-host-build.ps1 bff-svc -InstallGo
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Services = @(),

  [switch] $All,
  [switch] $InstallGo,
  [switch] $RepairToolchain
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$GoWork = Join-Path $Root "go.work"
$DataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT -replace '/', '\' } else { "E:\aqond-data" }
$BinRoot = Join-Path $DataRoot "bin"
# C: avoids E: drive hardware/filesystem errors (Docker + Go on same disk)
$GoRoot = "C:\tools\go"
if ($env:GOROOT -and $env:GOROOT -notmatch '^E:\\' -and (Test-Path (Join-Path $env:GOROOT "bin\go.exe"))) {
  $GoRoot = $env:GOROOT
}
$env:GOROOT = $GoRoot
$GoZipVer = "1.22.10"
$script:ToolchainRepaired = $false

function Ensure-Dir($p) {
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

function Test-GoToolchain {
  $link = Join-Path $GoRoot "pkg\tool\windows_amd64\link.exe"
  $goExe = Join-Path $GoRoot "bin\go.exe"
  if (-not (Test-Path $goExe)) { return $false }
  if (-not (Test-Path $link)) { return $false }
  if ((Get-Item $link).Length -lt 5000000) { return $false }
  & $goExe version 2>&1 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Ensure-GoToolchain {
  param([switch] $ForceInstall)
  if ($RepairToolchain) { $ForceInstall = $true }
  $goExe = Join-Path $GoRoot "bin\go.exe"
  if ((Test-Path $goExe) -and -not $ForceInstall -and (Test-GoToolchain)) {
    $env:GOROOT = $GoRoot
    $env:PATH = "$(Split-Path $goExe -Parent);$env:PATH"
    return
  }
  if (-not $ForceInstall -and (Get-Command go -ErrorAction SilentlyContinue)) {
    $goCmd = Get-Command go | Select-Object -ExpandProperty Source
    if ($goCmd -notmatch '^E:\\') {
      Write-Host "Using go from PATH: $goCmd"
      return
    }
  }
  Write-Host "Installing Go $GoZipVer portable -> $GoRoot" -ForegroundColor Yellow
  Ensure-Dir (Split-Path $GoRoot -Parent)
  $zipUrl = "https://go.dev/dl/go$GoZipVer.windows-amd64.zip"
  $zipPath = Join-Path $DataRoot "tmp\go$GoZipVer.windows-amd64.zip"
  Ensure-Dir (Split-Path $zipPath -Parent)
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
  if (Test-Path $GoRoot) {
    $bak = "$GoRoot.broken.$(Get-Date -Format 'yyyyMMddHHmmss')"
    try { Rename-Item -LiteralPath $GoRoot -NewName (Split-Path $bak -Leaf) -Force }
    catch { Remove-Item -LiteralPath $GoRoot -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Expand-Archive -Path $zipPath -DestinationPath (Split-Path $GoRoot -Parent) -Force
  $expanded = Join-Path (Split-Path $GoRoot -Parent) "go"
  if ($expanded -ne $GoRoot -and (Test-Path $expanded)) {
    if (Test-Path $GoRoot) {
      $bak = "$GoRoot.broken.$(Get-Date -Format 'yyyyMMddHHmmss')"
      Rename-Item -LiteralPath $GoRoot -NewName (Split-Path $bak -Leaf) -Force -ErrorAction SilentlyContinue
    }
    Rename-Item $expanded $GoRoot
  }
  $env:GOROOT = $GoRoot
  $env:PATH = "$(Join-Path $GoRoot 'bin');$env:PATH"
  [Environment]::SetEnvironmentVariable("GOROOT", $GoRoot, "User")
  $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
  $goBin = Join-Path $GoRoot "bin"
  if ($userPath -notlike "*$goBin*") {
    [Environment]::SetEnvironmentVariable("PATH", "$goBin;$userPath", "User")
  }
}

function Get-GoServices {
  $list = @()
  foreach ($line in Get-Content $GoWork) {
    if ($line -match '^\s*\./services/([a-z0-9-]+)\s*$') {
      $list += $Matches[1]
    }
  }
  return $list
}

function Build-OneService {
  param([string] $Name)
  $svcDir = Join-Path $Root "services\$Name"
  if (-not (Test-Path $svcDir)) { throw "Service dir not found: $svcDir" }
  $outFile = Join-Path $BinRoot "$Name"
  Write-Host "  go build -> $outFile (linux/amd64)" -ForegroundColor Cyan
  $env:GOWORK = $GoWork
  $env:GOOS = "linux"
  $env:GOARCH = "amd64"
  $env:CGO_ENABLED = "0"
  if (-not $env:GOMODCACHE -or $env:GOMODCACHE -match '^E:\\') {
    $env:GOMODCACHE = "C:\tools\go-mod-cache"
  }
  if (-not $env:GOCACHE -or $env:GOCACHE -match '^E:\\') {
    $env:GOCACHE = "C:\tools\go-build-cache"
  }
  Ensure-Dir $env:GOMODCACHE
  Ensure-Dir $env:GOCACHE
  Ensure-Dir $BinRoot
  Push-Location $Root
  try {
    $out = & go build -C "services/$Name" -ldflags="-s -w" -o $outFile . 2>&1
    if ($LASTEXITCODE -ne 0) {
      $msg = ($out | Out-String)
      if (-not $script:ToolchainRepaired -and $msg -match 'inpage operation|link\.exe') {
        Write-Warning "Go link.exe error — repairing toolchain and retrying once..."
        $script:ToolchainRepaired = $true
        Ensure-GoToolchain -ForceInstall
        $out = & go build -C "services/$Name" -ldflags="-s -w" -o $outFile . 2>&1
      }
      if ($LASTEXITCODE -ne 0) {
        Write-Host $msg -ForegroundColor Red
        throw "go build failed: $Name (try: pwsh -File infra/scripts/go-repair-toolchain.ps1)"
      }
    }
  } finally {
    Pop-Location
  }
  $size = (Get-Item $outFile).Length
  Write-Host "  OK $Name ($([math]::Round($size/1MB, 2)) MB)" -ForegroundColor Green
}

Ensure-Dir $BinRoot
Ensure-GoToolchain -ForceInstall:($InstallGo -or $RepairToolchain)

$targets = @()
if ($All) {
  $targets = Get-GoServices
} elseif ($Services.Count -gt 0) {
  $targets = @($Services | Where-Object { $_ -and $_ -notmatch '^-' })
} else {
  throw "Specify service name(s) or -All"
}

Write-Host "=== go-host-build ($($targets.Count) service(s)) ===" -ForegroundColor Cyan
foreach ($svc in $targets) {
  Write-Host "`n--- $svc ---" -ForegroundColor Yellow
  Build-OneService -Name $svc
}
Write-Host "`nBinaries: $BinRoot" -ForegroundColor Green
