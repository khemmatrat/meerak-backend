#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  Restore Docker data disk + restart engine WITHOUT deleting images/containers.

  Usage:
    pwsh -ExecutionPolicy Bypass -File infra/scripts/docker-restore.ps1
#>
$ErrorActionPreference = 'Stop'

$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$DiskDir = 'E:\Docker\wsl\disk'
$DataVhdx = Join-Path $DiskDir 'docker_data.vhdx'
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "=== Docker restore (keep images) ===" -ForegroundColor Cyan

Write-Host 'Stopping Docker...'
Get-Process | Where-Object { $_.Name -match 'docker|Docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
wsl --shutdown 2>$null
Start-Sleep -Seconds 3

icacls 'E:\Docker' /grant "${User}:(OI)(CI)F" /T | Out-Null

if (-not (Test-Path -LiteralPath $DataVhdx)) {
  $candidates = @(
    (Join-Path $DiskDir 'docker_data.OLD.vhdx'),
    'E:\Docker\DockerDesktopWSL\disk\docker_data.vhdx',
    'E:\Docker\wsl_backup_20260622\disk\docker_data.vhdx'
  )
  $src = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $src) { throw 'No docker_data.vhdx found to restore' }
  if ($src -like '*OLD*') {
    Write-Host "Restoring $src -> docker_data.vhdx"
    Rename-Item -LiteralPath $src -NewName 'docker_data.vhdx'
  } else {
    Write-Host "Copying $src -> docker_data.vhdx (keep original)"
    New-Item -ItemType Directory -Path $DiskDir -Force | Out-Null
    Copy-Item -LiteralPath $src -Destination $DataVhdx
  }
}

icacls $DataVhdx /grant "${User}:(F)" | Out-Null

Write-Host 'Testing VHDX mount...'
$mount = wsl --mount --vhd $DataVhdx --bare 2>&1
if ($LASTEXITCODE -ne 0) { throw "Mount failed: $mount" }
wsl --unmount $DataVhdx | Out-Null
Write-Host 'Mount OK' -ForegroundColor Green

wsl --shutdown
Start-Sleep -Seconds 2
Start-Service com.docker.service -ErrorAction SilentlyContinue
Start-Process -FilePath $DockerExe -Verb RunAs

Write-Host 'Wait 2-3 min then: docker ps' -ForegroundColor Green
