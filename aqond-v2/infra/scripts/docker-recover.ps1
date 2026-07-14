#Requires -Version 5.1
<#
  Fix Docker engine stuck: remove manual docker-desktop import, let Docker
  install its own distro while KEEPING docker_data.vhdx (images safe).

  Usage:
    pwsh -ExecutionPolicy Bypass -File infra/scripts/docker-recover.ps1
#>
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Elevating to Administrator...' -ForegroundColor Yellow
  Start-Process pwsh -Verb RunAs -ArgumentList @(
    '-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', $PSCommandPath
  )
  exit 0
}

$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$WslRoot = 'E:\Docker\wsl'
$MainDir = Join-Path $WslRoot 'main'
$DiskDir = Join-Path $WslRoot 'disk'
$DataVhdx = Join-Path $DiskDir 'docker_data.vhdx'
$BigDisk = 'E:\Docker\DockerDesktopWSL\disk\docker_data.vhdx'
$LogFile = Join-Path $WslRoot 'recover-last.log'
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $LogFile -Value $line
  Write-Host $Message
}

Write-Log '=== Docker recover (keep images) ==='

# Kill Docker completely (zombie backend blocks fresh bootstrap)
Write-Log 'Killing Docker processes...'
taskkill /F /IM 'Docker Desktop.exe' /T 2>$null | Out-Null
taskkill /F /IM 'com.docker.backend.exe' /T 2>$null | Out-Null
taskkill /F /IM 'com.docker.build.exe' /T 2>$null | Out-Null
Get-Process | Where-Object { $_.Name -match 'docker|Docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
wsl --shutdown 2>$null
Start-Sleep -Seconds 4

icacls 'E:\Docker' /grant "${User}:(OI)(CI)F" /T | Out-Null

# Ensure data disk exists at expected path
if (-not (Test-Path -LiteralPath $DataVhdx)) {
  if (Test-Path -LiteralPath (Join-Path $DiskDir 'docker_data.OLD.vhdx')) {
    Rename-Item (Join-Path $DiskDir 'docker_data.OLD.vhdx') 'docker_data.vhdx'
  } elseif (Test-Path -LiteralPath $BigDisk) {
    Write-Log 'Copying larger disk from DockerDesktopWSL...'
    New-Item -ItemType Directory -Path $DiskDir -Force | Out-Null
    Copy-Item -LiteralPath $BigDisk -Destination $DataVhdx
  } else {
    throw "No docker_data.vhdx found to restore"
  }
}

icacls $DataVhdx /grant "${User}:(F)" | Out-Null

# REMOVE manual docker-desktop — Docker must install this itself
$distros = @(wsl -l -q 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
foreach ($name in @('docker-desktop', 'docker-desktop-data')) {
  if ($distros -contains $name) {
    Write-Log "Unregistering $name..."
    wsl --unregister $name 2>$null
  }
}

if (Test-Path -LiteralPath $MainDir) {
  $bak = Join-Path $WslRoot ("main.manual-bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Write-Log "Moving main -> $(Split-Path $bak -Leaf)"
  Rename-Item -LiteralPath $MainDir -NewName (Split-Path $bak -Leaf)
}

# Verify disk mounts from Windows
$m = wsl --mount --vhd $DataVhdx --bare 2>&1
if ($LASTEXITCODE -ne 0) { throw "Data disk mount failed: $m" }
wsl --unmount $DataVhdx | Out-Null
Write-Log 'Data disk mount OK'

wsl --shutdown
Start-Sleep -Seconds 2

Write-Log 'Starting Docker Desktop (fresh docker-desktop install)...'
Start-Process -FilePath $DockerExe

Write-Log 'Waiting up to 5 minutes for engine...'
$ok = $false
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 10
  $distros = @(wsl -l -q 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $hasDesktop = $distros -contains 'docker-desktop'
  $dockerOut = docker ps 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Log "docker ps OK after $($i * 10)s"
    Write-Log ($dockerOut | Out-String).Trim()
    $ok = $true
    break
  }
  Write-Log "[$i/30] docker-desktop=$hasDesktop distros=$($distros -join ', ')"
}

if (-not $ok) {
  Write-Log 'Engine not ready yet. Check Docker Desktop UI or log: recover-last.log'
  exit 1
}

Write-Log 'Recovery complete.'
exit 0
