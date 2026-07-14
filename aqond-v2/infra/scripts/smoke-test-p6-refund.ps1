# P6 smoke: checkout HOLD → ship → SLA breach (force) → ai judge → escrow REFUND
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$secret = $env:BAGISTO_WEBHOOK_SECRET
$headers = @{
  "X-Bagisto-Sync-Secret" = $secret
  "Content-Type"          = "application/json"
}

$ext = "p6-smoke-$(Get-Date -Format 'HHmmss')"
Write-Host "=== 1. sync + publish product ==="
$syncBody = @{
  title       = "P6 SLA Refund Test"
  category    = "test"
  price_thb   = 55
  inventory   = 5
  description = "sla refund smoke"
  status      = "draft"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/internal/sync-product" `
  -Method POST -Headers (@{ "X-Bagisto-Sync-Secret" = $secret; "Idempotency-Key" = $ext }) `
  -Body $syncBody | Out-Null

Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/products/$ext/publish" -Method POST | Out-Null

Write-Host "=== 2. checkout (escrow HOLD) ==="
$co = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/checkout" `
  -Method POST -Headers @{ "Content-Type" = "application/json" } `
  -Body (@{ external_id = $ext; buyer_id = "p6-buyer"; qty = 1 } | ConvertTo-Json)
$orderId = $co.order.order_id
Write-Host "Order: $orderId escrow=$($co.escrow.status) amount=$($co.amount_thb) THB"

Write-Host "`n=== 3. ship (start SLA) ==="
$ship = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/orders/$orderId/ship" `
  -Method POST -Headers $headers `
  -Body (@{ carrier_code = "kerry-test"; tracking_id = "TRK-P6"; sla_hours = 48 } | ConvertTo-Json)
Write-Host "Shipped carrier=$($ship.order.carrier_code) deadline=$($ship.sla.sla_deadline_at)"

Write-Host "`n=== 4. SLA breach + REFUND (force=1 for smoke) ==="
$refund = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/orders/$orderId/sla/process-breach?force=1" `
  -Method POST -Headers $headers `
  -Body (@{ actor = "smoke-p6" } | ConvertTo-Json)
Write-Host "Order status=$($refund.order.status) fulfillment=$($refund.order.fulfillment_status)"
Write-Host "Escrow=$($refund.escrow.status) verdict_refund=$($refund.verdict.recommend_refund)"

if ($refund.order.status -ne "refunded" -or $refund.escrow.status -ne "REFUND") {
  throw "P6 smoke failed: expected refunded order + REFUND escrow"
}

Write-Host "`n=== 5. verify escrow ledger ==="
$ledger = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/escrow/order/$orderId" `
  -Headers @{ "X-Escrow-Api-Key" = $env:ESCROW_API_KEY }
$statuses = ($ledger.entries | ForEach-Object { $_.status }) -join ","
Write-Host "Ledger entries: $statuses"

Write-Host "`nP6 smoke complete — HOLD -> ship -> REFUND OK"
