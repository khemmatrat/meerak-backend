#Requires -Version 5.1
<#
  Fix Docker Desktop "unable to read target bucket" on Windows (often E: VHDX full/corrupt).

  Usage:
    pwsh -ExecutionPolicy Bypass -File infra/scripts/docker-repair.ps1
    pwsh -File infra/scripts/docker-repair.ps1 -PruneAll
#>
param(
  [switch] $PruneAll,
  [switch] $ShutdownWsl
)

$ErrorActionPreference = "Continue"
Write-Host "=== AQOND Docker repair ===" -ForegroundColor Cyan

function Test-BucketError {
  docker images 2>&1 | Out-Null
  return ($LASTEXITCODE -ne 0)
}

Write-Host "`n1. Current state" -ForegroundColor Yellow
try { docker version 2>&1 | Select-Object -First 6 | Write-Host } catch { }
try { docker ps -q 2>&1 | Measure-Object | ForEach-Object { Write-Host "Running containers: $($_.Count)" } } catch { }

if (-not (Test-BucketError)) {
  Write-Host "`nDocker image store looks OK (docker images works)." -ForegroundColor Green
  docker system df 2>&1 | Write-Host
  exit 0
}

Write-Host "`nDetected: unable to read target bucket (Docker image store damaged or full)" -ForegroundColor Red

$dataRoot = if ($env:AQOND_DATA_ROOT) { $env:AQOND_DATA_ROOT } else { "E:\aqond-data" }
Write-Host @"

Manual steps (do in order):
  A. Docker Desktop -> Settings -> Resources -> Disk image size (increase if on E:)
  B. Quit Docker Desktop completely (tray icon -> Quit)
  C. Optional WSL reset:  wsl --shutdown
  D. Restart Docker Desktop — wait until 'Engine running'
  E. Re-run this script or: pwsh -File infra/scripts/phase-0-demo.ps1

Data paths (do NOT delete unless you accept losing DB):
  Docker VHDX: usually %LOCALAPPDATA%\Docker\wsl\data\ext4.vhdx  OR custom on E:
  AQOND data:  $dataRoot
"@ -ForegroundColor DarkYellow

if ($PruneAll) {
  Write-Host "`n2. Attempting prune (needs working engine — may fail if bucket broken)..." -ForegroundColor Yellow
  docker system prune -a -f --volumes 2>&1 | Write-Host
}

if ($ShutdownWsl) {
  Write-Host "`n3. wsl --shutdown" -ForegroundColor Yellow
  wsl --shutdown 2>&1 | Write-Host
  Write-Host "Restart Docker Desktop, then run phase-0-demo.ps1" -ForegroundColor Green
}

Write-Host "`nAfter Docker is healthy, run:" -ForegroundColor Cyan
Write-Host "  pwsh -File infra/scripts/phase-0-demo.ps1" -ForegroundColor White
exit 1
