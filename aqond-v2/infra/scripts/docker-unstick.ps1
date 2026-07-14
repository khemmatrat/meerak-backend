# Unstick Docker Desktop when stuck on "Turning off the Docker Engine..."
# Run in Admin PowerShell if wsl --shutdown fails.
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== Unstick Docker Desktop ===" -ForegroundColor Cyan
Write-Host "1. Closing Docker processes..."

$names = @(
  "Docker Desktop", "com.docker.backend", "com.docker.service",
  "com.docker.build", "docker", "dockerd"
)
foreach ($n in $names) {
  Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force
}

Write-Host "2. wsl --shutdown ..."
wsl --shutdown 2>$null
Start-Sleep -Seconds 8

Write-Host @"

3. Start Docker Desktop from Start Menu
4. Wait until whale icon shows Running (NOT 'Engine stopping')
5. Test: docker run --rm hello-world

If still stuck:
  Docker Desktop -> Troubleshoot (bug icon) -> Restart Docker Desktop
  Last resort: Reset to factory defaults (E:\aqond-data bind mounts are safe)

Then run staged startup:
  pwsh -File G:\meerak\aqond-v2\infra\scripts\docker-up-staged.ps1

"@ -ForegroundColor Green
