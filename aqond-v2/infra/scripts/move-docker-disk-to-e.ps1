#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Move Docker Desktop WSL disk to E:\Docker (frees ~22GB on C:).

  BEFORE running:
  1. Quit Docker Desktop completely
  2. Run: wsl --shutdown

  AFTER running:
  1. Docker Desktop -> Settings -> Resources -> Disk image location = E:\Docker
  2. Start Docker Desktop
#>
$ErrorActionPreference = "Stop"

$DockerRoot = "E:\Docker"
$ExportTar = Join-Path $DockerRoot "docker-desktop-data.tar"
$ImportDir = Join-Path $DockerRoot "data"

Write-Host "=== Move Docker WSL data to E: ===" -ForegroundColor Cyan
Write-Host "Ensure Docker Desktop is QUIT and run: wsl --shutdown`n"

wsl --shutdown
Start-Sleep -Seconds 3

New-Item -ItemType Directory -Path $DockerRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ImportDir -Force | Out-Null

$distros = @("docker-desktop-data", "docker-desktop")
foreach ($name in $distros) {
  $listed = wsl -l -v 2>$null | Select-String $name
  if (-not $listed) {
    Write-Host "Skip $name (not installed)"
    continue
  }
  $tar = Join-Path $DockerRoot "$name.tar"
  Write-Host "Exporting $name ..."
  wsl --export $name $tar
  Write-Host "Unregistering $name ..."
  wsl --unregister $name
  $dest = Join-Path $DockerRoot $name
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Write-Host "Importing $name to $dest ..."
  wsl --import $name $dest $tar --version 2
  Write-Host "Done $name"
}

Write-Host @"

=== WSL import complete ===
1. Open Docker Desktop
2. Settings -> Resources -> Advanced -> Disk image location -> E:\Docker
3. Apply & Restart

If Docker fails to start, use Docker Desktop Troubleshoot -> Reset (last resort).
"@ -ForegroundColor Green
