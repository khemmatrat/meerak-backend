# Kill hung Cursor agent shell processes (run OUTSIDE Cursor — Windows Terminal or Explorer)
# Usage: right-click -> Run with PowerShell, OR:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File "G:\meerak\aqond-v2\infra\scripts\kill-hung-agent-shells.ps1"

$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== AQOND: cleanup hung agent shells ===" -ForegroundColor Cyan

# Known stuck PIDs from agent sessions (safe to kill — they are agent subshells)
$stuckPids = @(
  40136, 24984, 28132, 33252, 31932, 34080, 36984, 26148, 33496,
  23136, 33896, 25024, 32896, 38512, 36120, 23528
)

foreach ($pid in $stuckPids) {
  $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
  if ($p) {
    Stop-Process -Id $pid -Force
    Write-Host "Killed PID $pid ($($p.ProcessName))" -ForegroundColor Yellow
  }
}

# Optional: stop runaway go builds started by agent (not your manual builds)
Get-Process go -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -lt (Get-Date).AddHours(-1) } | ForEach-Object {
  Stop-Process -Id $_.Id -Force
  Write-Host "Killed stale go.exe PID $($_.Id)" -ForegroundColor Yellow
}

Write-Host "`nDone. Next steps:" -ForegroundColor Green
Write-Host "  1. In Cursor: click trash icon on each '∞ Cursor' terminal tab (right sidebar)"
Write-Host "  2. Or: Developer: Reload Window (Ctrl+Shift+P -> Reload Window)"
Write-Host "  3. Open ONE new terminal and run your commands"
Write-Host "`nAgent will NOT auto-run docker/go build unless you ask."
