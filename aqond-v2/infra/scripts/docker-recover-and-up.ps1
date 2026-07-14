#Requires -Version 5.1
<#
  Recover Docker Desktop after moving disk to E: — then start aqond-v2 core services.
  Run: powershell -ExecutionPolicy Bypass -File infra/scripts/docker-recover-and-up.ps1
#>
$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

Write-Host "=== Step 1: Restart WSL + Docker backend ===" -ForegroundColor Cyan
Write-Host "Quit Docker Desktop from system tray first, then press Enter..."
Read-Host
wsl --shutdown
Start-Sleep -Seconds 5
Write-Host "Start Docker Desktop manually now. Wait until status is Running (green whale)."
Write-Host "Press Enter when Docker is ready..."
Read-Host

Write-Host "`n=== Step 2: Test Docker engine ===" -ForegroundColor Cyan
docker version 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host @"

Docker engine not ready. Try:
  1. Docker Desktop -> Settings -> Resources -> Disk image location = E:\Docker
  2. Apply & Restart
  3. Troubleshoot -> Restart Docker Desktop
  4. Last resort: Reset to factory defaults (aqond data on E:\aqond-data is safe)

"@ -ForegroundColor Yellow
  exit 1
}

docker run --rm hello-world 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "hello-world failed — fix Docker before compose up." -ForegroundColor Red
  exit 1
}

Write-Host "`n=== Step 3: Start aqond-v2 (no optional mongo) ===" -ForegroundColor Cyan
Set-Location $Root
docker compose --env-file infra/.env up -d 2>&1

Write-Host "`n=== Step 4: Migrations ===" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "apply-migrations.ps1")

Write-Host "`nDone. Check: docker compose --env-file infra/.env ps" -ForegroundColor Green
