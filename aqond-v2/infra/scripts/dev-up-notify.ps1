#Requires -Version 5.1
<#
  Dev stack for notifications + Kong (minimal).

  pwsh -File infra/scripts/dev-up-notify.ps1
  pwsh -File infra/scripts/dev-up-notify.ps1 -Migrate
#>
param([switch] $Migrate)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

if ($Migrate) {
  pwsh -File infra/scripts/apply-migrations.ps1
}

pwsh -File infra/scripts/render-kong-config.ps1

docker compose --profile dev-lite up -d aqond-db aqond-redis kong notification-svc bff-svc 2>&1 | Out-Host

Write-Host @"

Notify stack up:
  Kong:        http://127.0.0.1:8000
  Notify API:  http://127.0.0.1:8000/api/v1/notify/health
  LINE hook:   http://127.0.0.1:8000/api/v1/notify/v1/line/webhook

Storefront (terminal 2):
  pwsh -File infra/scripts/dev-app.ps1 -KillExisting
  → http://localhost:3003/m/account/notifications

Smoke:
  pwsh -File infra/scripts/smoke-test-3vps.ps1
"@ -ForegroundColor Cyan
