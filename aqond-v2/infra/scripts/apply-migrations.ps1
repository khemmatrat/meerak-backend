# Apply SQL migrations on Windows (no local psql required)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD
if (-not $Pass) { throw "Set POSTGRES_PASSWORD in infra/.env" }

& (Join-Path $PSScriptRoot "sync-postgres-password.ps1") | Out-Null

function Run-SqlFile($Db, $File) {
  Write-Host "  -> $(Split-Path $File -Leaf) on $Db"
  $composeArgs = @('--env-file', $EnvFile, '-f', (Join-Path $Root "docker-compose.yml"), '--profile', 'dev-lite')
  $out = Get-Content $File -Raw | docker compose @composeArgs `
    exec -T -e "PGPASSWORD=$Pass" aqond-db psql -U $User -d $Db -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    $text = $out | Out-String
    if ($text -match 'already exists') {
      Write-Warning "  (partial apply — objects already exist, continuing)"
      return
    }
    Write-Host $text -ForegroundColor Red
    throw "Migration failed: $(Split-Path $File -Leaf) on $Db"
  }
}

Write-Host "=== escrow database ==="
Run-SqlFile "escrow" (Join-Path $Root "infra\postgres\migrations\001_escrow_ledger.sql")

Write-Host "=== analytics database ==="
Run-SqlFile "analytics" (Join-Path $Root "infra\postgres\migrations\002_analytics_events.sql")

Write-Host "=== ai database ==="
& (Join-Path $PSScriptRoot "init-databases.ps1") | Out-Null
Run-SqlFile "ai" (Join-Path $Root "infra\postgres\migrations\003_ai_audit.sql")

Write-Host "=== bagisto database (P2a catalog) ==="
Run-SqlFile "bagisto" (Join-Path $Root "infra\postgres\migrations\004_marketplace_catalog.sql")

Write-Host "=== bagisto database (P2b orders) ==="
Run-SqlFile "bagisto" (Join-Path $Root "infra\postgres\migrations\005_marketplace_orders.sql")

Write-Host "=== bagisto database (P6 SLA) ==="
Run-SqlFile "bagisto" (Join-Path $Root "infra\postgres\migrations\006_marketplace_sla.sql")

Write-Host "=== analytics database (P7) ==="
Run-SqlFile "analytics" (Join-Path $Root "infra\postgres\migrations\007_analytics_p7.sql")

Write-Host "=== commerce database (P9-P15 Go core) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\008_commerce_core.sql")

Write-Host "=== commerce database (P33-P45 feed/media) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\009_feed_media.sql")

Write-Host "=== commerce database (P46-P60 sharding) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\010_shard_catalog.sql")

Write-Host "=== commerce database (P81-P90 payments) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\011_payments.sql")

Write-Host "=== commerce database (P91-P98 search) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\012_search.sql")

Write-Host "=== commerce database (P99-P104 recsys/ads) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\013_recsys_ads.sql")

Write-Host "=== commerce database (P105-P110 trust/reviews) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\014_trust_reviews.sql")

Write-Host "=== commerce database (P111-P116 i18n/tax) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\015_i18n_tax.sql")

Write-Host "=== commerce database (P117-P121 logistics/address) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\016_logistics_address.sql")

Write-Host "=== commerce database (P122-P138 compliance) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\017_compliance.sql")

Write-Host "=== commerce database (P129-P139 policy/legal/routing) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\018_policy.sql")

Write-Host "=== commerce database (P134-P135 notifications) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\019_notifications.sql")

Write-Host "=== commerce database (P141-P162 storefront) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\020_storefront.sql")

Write-Host "=== commerce database (P171-P200 scale/reliability) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\021_scale_reliability.sql")

Write-Host "=== commerce database (P201-P230 production EXP track) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\022_experience_production.sql")

Write-Host "=== commerce database (live commerce + AI) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\023_live_commerce_ai.sql")

Write-Host "=== commerce database (phase1 coupons) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\024_phase1_coupons.sql")

Write-Host "=== commerce database (phase3 food-svc) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\025_food_svc.sql")

Write-Host "=== commerce database (phase4 dispatch-svc) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\026_dispatch_svc.sql")

Write-Host "=== commerce database (phase4 dispatch chat) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\027_dispatch_chat.sql")

Write-Host "=== commerce database (phase5 tier1 production) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\028_phase5_tier1.sql")

Write-Host "=== commerce database (tier1b PaySo) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\029_payment_payso.sql")

Write-Host "=== commerce database (tier1b FCM/LINE templates) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\030_notify_order_paid.sql")

Write-Host "=== commerce database (tier1b rider ledger) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\031_rider_ledger.sql")

Write-Host "=== commerce database (fix order_paid templates) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\032_fix_order_paid_templates.sql")

Write-Host "=== commerce database (phase5 production base) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\033_production_base.sql")
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\034_merchant_wallet_fees.sql")

Write-Host "=== commerce database (tier2 production) ==="
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\035_tier2.sql")
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\036_dispatch_rematch.sql")
Run-SqlFile "commerce" (Join-Path $Root "infra\postgres\migrations\037_tier3_ai.sql")

Write-Host "Migrations complete."
