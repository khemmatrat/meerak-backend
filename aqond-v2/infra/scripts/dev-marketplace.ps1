#Requires -Version 5.1
<#
  AQOND v2 PRODUCT dev — marketplace + food/shop + TikTok-style feed + AI Jarvis.

  This is the recommended daily driver for aqond-v2 product work.
  Legacy meerak (backend/admin/support/mobile) runs separately — no Docker needed there.

  Terminal 1 — stack (infra + 20 Go services):
    pwsh -File infra/scripts/dev-marketplace.ps1
    pwsh -File infra/scripts/dev-marketplace.ps1 -Quick          # daily restart (~few min)
    pwsh -File infra/scripts/dev-marketplace.ps1 -InfraOnly      # Docker DB/Kong only

  Terminal 2 — AI Jarvis (Ollama native on Windows, bypass Docker OOM):
    pwsh -File infra/scripts/ai-core-local.ps1

  Terminal 3 — Marketplace UI (hot reload):
    pwsh -File infra/scripts/storefront-dev.ps1

  Remote Linux server (no Docker on Windows laptop):
    On server:  bash infra/scripts/dev-remote-up.sh
    On laptop:  pwsh -File infra/scripts/dev-remote-tunnel.ps1 -Host user@your-vps

  What -Product includes vs minimal:
    + feed-svc, video-svc, rec-svc (TikTok feed / shop video / recommendations)
    + ScyllaDB + CDN edge (infra)
    Commerce: cart, checkout, orders, shipping, search, BFF, wallet, creator...
#>
param(
  [switch] $Quick,
  [switch] $InfraOnly,
  [switch] $ForceRebuild,
  [switch] $InstallGo,
  [switch] $SkipMigrations,
  [switch] $SkipHealthCheck,
  [switch] $OpenBrowser
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot

Write-Host @"
========================================
  AQOND v2 — Product Dev
  marketplace · delivery · feed · AI Jarvis
========================================
"@ -ForegroundColor Magenta

$devUpArgs = @(
  "-Product"
  $(if ($Quick) { "-Quick" })
  $(if ($InfraOnly) { "-InfraOnly" })
  $(if ($ForceRebuild) { "-ForceRebuild" })
  $(if ($InstallGo) { "-InstallGo" })
  $(if ($SkipMigrations) { "-SkipMigrations" })
  $(if ($SkipHealthCheck) { "-SkipHealthCheck" })
  $(if ($OpenBrowser) { "-OpenBrowser" })
)

& (Join-Path $ScriptDir "dev-up-all.ps1") @devUpArgs

if ($InfraOnly) {
  Write-Host @"

=== Infra ready — start Go services separately ===
  pwsh -File infra/scripts/docker-up-go.ps1 -Step1
  pwsh -File infra/scripts/docker-up-go.ps1 feed-svc video-svc rec-svc

Or full product stack:
  pwsh -File infra/scripts/dev-marketplace.ps1
"@ -ForegroundColor Yellow
  exit 0
}

Write-Host @"

=== Product dev — open 2 more terminals ===

  [AI Jarvis]  pwsh -File infra/scripts/ai-core-local.ps1
               Ollama :11434  →  ai-core :8100  (Hermes / vision / support agent)

  [Storefront] pwsh -File infra/scripts/storefront-dev.ps1
               http://localhost:3000

  Key pages:
    /feed          TikTok-style feed
    /m/home        Mobile home
    /m/sell        AI product listing (needs ai-core)
    /shop          Marketplace catalog
    /checkout      Orders + delivery flow

  API:  http://127.0.0.1:8000/api/v1/bff/v1/home

  TikTok feed (first time):
    pwsh -File infra/scripts/apply-scylla-schema.ps1
    pwsh -File infra/scripts/seed-production-shops.ps1 -ShopCount 12
    pwsh -File infra/scripts/seed-feed-videos.ps1
    → http://localhost:3003/m/feed
"@ -ForegroundColor Cyan
