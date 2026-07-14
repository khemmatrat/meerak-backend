#Requires -Version 5.1
<#
  Reinstall Go toolchain on E: (fixes link.exe "inpage operation" / corrupt install).

  Usage:
    pwsh -File infra/scripts/go-repair-toolchain.ps1
#>
param([string] $GoRoot = "C:\tools\go")

$ErrorActionPreference = "Stop"
$DataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT -replace '/', '\' } else { "E:\aqond-data" }
$GoZipVer = "1.22.10"
$GoParent = Split-Path $GoRoot -Parent
$zipUrl = "https://go.dev/dl/go$GoZipVer.windows-amd64.zip"
$zipPath = Join-Path $DataRoot "tmp\go$GoZipVer.windows-amd64.zip"

Write-Host "=== Repair Go toolchain -> $GoRoot ===" -ForegroundColor Cyan

if (-not (Test-Path $DataRoot)) {
  New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
}
New-Item -ItemType Directory -Path (Join-Path $DataRoot "tmp") -Force | Out-Null
New-Item -ItemType Directory -Path $GoParent -Force | Out-Null

if (Test-Path $GoRoot) {
  $backup = "$GoRoot.broken.$(Get-Date -Format yyyyMMddHHmm)"
  Write-Host "  backup: $backup" -ForegroundColor DarkGray
  Rename-Item $GoRoot $backup -Force
}

Write-Host "  download Go $GoZipVer..." -ForegroundColor DarkGray
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

Write-Host "  extract..." -ForegroundColor DarkGray
Expand-Archive -Path $zipPath -DestinationPath $GoParent -Force

$link = Join-Path $GoRoot "pkg\tool\windows_amd64\link.exe"
$goExe = Join-Path $GoRoot "bin\go.exe"
if (-not (Test-Path $goExe)) { throw "Repair failed: go.exe missing at $goExe" }
if (-not (Test-Path $link)) { throw "Repair failed: link.exe missing at $link" }

$env:GOROOT = $GoRoot
$env:PATH = "$(Join-Path $GoRoot 'bin');$env:PATH"
[Environment]::SetEnvironmentVariable("GOROOT", $GoRoot, "User")
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$goBin = Join-Path $GoRoot "bin"
if ($userPath -notlike "*$goBin*") {
  [Environment]::SetEnvironmentVariable("PATH", "$goBin;$userPath", "User")
}

Write-Host "OK: link.exe ($((Get-Item $link).Length) bytes)" -ForegroundColor Green
& $goExe version
Write-Host "`nNext:" -ForegroundColor Cyan
Write-Host "  cd G:\meerak\aqond-v2"
Write-Host "  pwsh -File infra/scripts/dev-up-all.ps1"
