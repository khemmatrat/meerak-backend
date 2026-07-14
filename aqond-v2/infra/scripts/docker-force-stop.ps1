#Requires -RunAsAdministrator
# Force-stop Docker when UI stuck on "Engine stopping" / "Turning off the Docker Engine..."
# Run OUTSIDE Docker Desktop window:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File "G:\meerak\aqond-v2\infra\scripts\docker-force-stop.ps1"
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== Force stop Docker (Admin) ===" -ForegroundColor Cyan

# 1) Stop Docker Windows service
Write-Host "Stopping com.docker.service ..."
sc.exe stop com.docker.service | Out-Null
Stop-Service -Name "com.docker.service" -Force -ErrorAction SilentlyContinue

# 2) Kill all Docker-related processes
$patterns = @(
  "Docker Desktop", "com.docker.backend", "com.docker.service", "com.docker.build",
  "docker", "dockerd", "docker-compose", "vpnkit", "vpnkit-bridge",
  "wslrelay", "wslhost"
)
foreach ($p in $patterns) {
  Get-Process -Name $p -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  Kill $($_.ProcessName) PID $($_.Id)"
    Stop-Process -Id $_.Id -Force
  }
}

# 3) Shutdown ALL WSL (releases vmmem / docker-desktop distros)
Write-Host "wsl --shutdown (all distros) ..."
wsl --shutdown 2>$null
Start-Sleep -Seconds 10

# 4) Kill stray vmmem if still present (WSL2 VM)
Get-Process -Name "vmmem", "vmmemWSL" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "  Kill $($_.ProcessName) PID $($_.Id)"
  Stop-Process -Id $_.Id -Force
}

Start-Sleep -Seconds 3

# 5) Verify nothing Docker left
$left = Get-Process -Name "Docker Desktop","com.docker.backend","com.docker.service" -ErrorAction SilentlyContinue
if ($left) {
  Write-Host "Some processes remain — reboot Windows is the safest next step." -ForegroundColor Yellow
} else {
  Write-Host "All Docker processes stopped." -ForegroundColor Green
}

Write-Host @"

NEXT:
  1. Do NOT open Docker yet — wait 15 seconds
  2. Start Docker Desktop from Start Menu
  3. Wait 2-5 min for first boot on E:\Docker\wsl (new disk)
  4. If STILL stuck on 'Engine stopping' after 5 min:
       Docker Desktop -> Troubleshoot (bug icon) -> 'Reset to factory defaults'
       (Safe: Postgres/Ollama data is on E:\aqond-data bind mounts, not inside Docker VM)
  5. If Reset also fails: RESTART Windows, then open Docker again

After Docker shows Running:
  pwsh -File G:\meerak\aqond-v2\infra\scripts\docker-up-staged.ps1

"@ -ForegroundColor Green
