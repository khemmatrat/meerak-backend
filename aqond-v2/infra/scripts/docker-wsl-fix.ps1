#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  Fix Docker Desktop WSL issues while KEEPING existing images/containers.

  Usage:
    pwsh -ExecutionPolicy Bypass -File infra/scripts/docker-wsl-fix.ps1
#>
$ErrorActionPreference = 'Stop'

$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$WslTar = 'C:\Program Files\Docker\Docker\resources\wsl\wsl-data.tar'
$MainDir = 'E:\Docker\wsl\main'
$DiskDir = 'E:\Docker\wsl\disk'
$DataVhdx = Join-Path $DiskDir 'docker_data.vhdx'
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "=== Docker WSL repair (keep data) ===" -ForegroundColor Cyan

Get-Process | Where-Object { $_.Name -match 'docker|Docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
wsl --shutdown 2>$null
Start-Sleep -Seconds 3

icacls 'E:\Docker' /grant "${User}:(OI)(CI)F" /T | Out-Null

if (-not (Test-Path -LiteralPath $DataVhdx) -and (Test-Path -LiteralPath (Join-Path $DiskDir 'docker_data.OLD.vhdx'))) {
  Write-Host 'Restoring docker_data.OLD.vhdx -> docker_data.vhdx'
  Rename-Item -LiteralPath (Join-Path $DiskDir 'docker_data.OLD.vhdx') -NewName 'docker_data.vhdx'
}

if (Test-Path -LiteralPath $DataVhdx) {
  icacls $DataVhdx /grant "${User}:(F)" | Out-Null
  $m = wsl --mount --vhd $DataVhdx --bare 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Cannot mount data disk: $m" }
  wsl --unmount $DataVhdx | Out-Null
}

if (-not ((wsl -l -q 2>$null) -contains 'docker-desktop')) {
  New-Item -ItemType Directory -Path $MainDir -Force | Out-Null
  wsl --import docker-desktop $MainDir $WslTar --version 2
}

wsl --shutdown
Start-Sleep -Seconds 2
Start-Service com.docker.service -ErrorAction SilentlyContinue
Start-Process -FilePath $DockerExe -Verb RunAs

Write-Host 'Wait 2-3 min, then: docker ps' -ForegroundColor Green
