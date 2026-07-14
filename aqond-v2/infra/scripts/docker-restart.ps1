#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  Hard-restart Docker after restoring docker_data.vhdx (keeps images).

  Usage:
    pwsh -ExecutionPolicy Bypass -File infra/scripts/docker-restart.ps1
#>
$ErrorActionPreference = 'Stop'
$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$DataVhdx = 'E:\Docker\wsl\disk\docker_data.vhdx'

Write-Host '=== Docker hard restart ===' -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $DataVhdx)) {
  throw "Missing $DataVhdx — restore docker_data.OLD.vhdx first"
}

Write-Host 'Killing Docker processes...'
Get-Process | Where-Object { $_.Name -match 'docker|Docker|com\.docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host 'Shutting down WSL...'
wsl --shutdown 2>$null
Start-Sleep -Seconds 3

Write-Host 'Verifying data disk mount...'
$m = wsl --mount --vhd $DataVhdx --bare 2>&1
if ($LASTEXITCODE -ne 0) { throw "Mount failed: $m" }
wsl --unmount $DataVhdx | Out-Null
Write-Host 'Data disk OK' -ForegroundColor Green

wsl --shutdown 2>$null
Start-Sleep -Seconds 2

Write-Host 'Starting Docker Desktop...'
Start-Process -FilePath $DockerExe -Verb RunAs

Write-Host 'Wait 2-3 minutes for bootstrap, then: docker ps' -ForegroundColor Yellow
