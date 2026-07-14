# หยุด process ที่ listen พอร์ต 3001 แล้ว start server.js (แก้ EADDRINUSE)
$ErrorActionPreference = "SilentlyContinue"
& "$PSScriptRoot\stop-server.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location (Join-Path $PSScriptRoot "..")
Write-Host "Starting MEERAK backend on :3001 ..."
node --max-old-space-size=4096 server.js
