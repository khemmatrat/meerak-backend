# Stop only the backend listening on port 3001 (does not start a new server).
# Run before: node server.js
$ErrorActionPreference = "SilentlyContinue"

$pids = @(
  Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 0 }
)

if (-not $pids -or $pids.Count -eq 0) {
  Write-Host "[stop-server] Port 3001 is free - no listener found."
  exit 0
}

foreach ($procId in $pids) {
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { "unknown" }
  Write-Host "[stop-server] Stopping PID $procId ($name) on :3001 ..."
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1

$still = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Host "[stop-server] WARNING: port 3001 still in use. Try again."
  exit 1
}

Write-Host "[stop-server] Done. Start backend in this terminal:"
Write-Host "  node server.js"
Write-Host "  (or: npm start)"
