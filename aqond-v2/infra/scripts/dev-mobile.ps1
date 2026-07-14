#Requires -Version 5.1
<#
  Start MEERAK mobile (Vite) on port 3000 — the primary dev shell.

  DO NOT run storefront on 3000 (use dev-app.ps1 — default port 3003).

  Usage:
    pwsh -File infra/scripts/dev-mobile.ps1
    pwsh -File infra/scripts/dev-mobile.ps1 -KillExisting

  Open:
    http://localhost:3000/#/welcome
    http://localhost:3000/#/login

  ถ้ายังเห็นหน้า Discover (storefront cache):
    http://localhost:${Port}/clear-dev-cache.html
    หรือ Chrome Incognito → แล้วเปิด /#/welcome

  If you still see "Discover" (storefront) after switching:
    Chrome DevTools → Application → Service Workers → Unregister
    → Clear site data → hard refresh (Ctrl+Shift+R)
#>
param(
  [switch] $KillExisting,
  [int] $Port = 3000
)

$ErrorActionPreference = 'Stop'
$Mobile = 'G:\meerak\mobile'
if (-not (Test-Path $Mobile)) { throw "Not found: $Mobile" }

if ($KillExisting) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      if ($_ -gt 0) {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped PID $_ on port $Port"
      }
    }
  Start-Sleep -Seconds 1
}

Write-Host @"

========================================
  MEERAK Mobile (port $Port)
========================================
  Welcome:  http://localhost:${Port}/#/welcome
  Login:    http://localhost:${Port}/#/login

  Storefront v2 → port 3003:
    pwsh -File infra/scripts/dev-app.ps1

  ถ้าเจอหน้า Discover แทน Welcome:
    DevTools → Application → Service Workers → Unregister
    แล้ว Clear site data + Ctrl+Shift+R
========================================
"@ -ForegroundColor Green

Set-Location $Mobile
npm run dev
