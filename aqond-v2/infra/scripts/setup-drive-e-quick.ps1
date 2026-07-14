# Quick E: setup (no Admin) — dirs, env vars, .env sync. Does NOT move Docker WSL.
# For full Docker move (frees C:): run migrate-all-to-drive-e-now.ps1 as Administrator.
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
& (Join-Path $PSScriptRoot "setup-drive-e.ps1")

$DataRoot = "E:\aqond-data"
foreach ($d in @("go-mod-cache", "go-build-cache", "npm-cache", "tmp")) {
  $p = Join-Path $DataRoot $d
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

function Set-UserEnv($Name, $Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-Item -Path "env:$Name" -Value $Value
}
Set-UserEnv "GOMODCACHE" "$DataRoot\go-mod-cache"
Set-UserEnv "GOCACHE" "$DataRoot\go-build-cache"
Set-UserEnv "NPM_CONFIG_CACHE" "$DataRoot\npm-cache"

Write-Host "Go/npm caches -> E:\aqond-data (User env set)" -ForegroundColor Green
Write-Host "NEXT (Admin, Docker QUIT): pwsh -ExecutionPolicy Bypass -File `"$Root\infra\scripts\migrate-all-to-drive-e-now.ps1`"" -ForegroundColor Yellow
