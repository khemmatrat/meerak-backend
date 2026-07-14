# P9-P16 commerce core smoke (Go + Kafka + Hermes)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$walletKey = $env:ESCROW_API_KEY
$hermesKey = $env:AI_CORE_API_KEY

Write-Host "=== P9 foundation kafka smoke ==="
$smoke = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/foundation/kafka/smoke" -Method POST -TimeoutSec 60
if (-not $smoke.ok) { throw "P9 kafka smoke failed: $($smoke | ConvertTo-Json)" }
Write-Host "OK topic=$($smoke.topic)"

Write-Host "`n=== P10-P11 catalog create + publish ==="
$merchant = "m-" + (Get-Date -Format "HHmmss")
$store = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/catalog/v1/stores" `
  -Method POST -ContentType "application/json" `
  -Body (@{ merchant_id = $merchant; slug = "shop-$merchant"; display_name = "P9 Shop" } | ConvertTo-Json)
$prod = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/catalog/v1/products" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    store_id = $store.store.id; merchant_id = $merchant
    title = "Go Catalog Smoke"; price_micro = 55000; inventory = 20; status = "draft"
  } | ConvertTo-Json)
$productId = $prod.product.id
$vid = $prod.variant.id
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/catalog/v1/products/$productId/publish" -Method POST | Out-Null
Write-Host "OK product=$productId variant=$vid"

Write-Host "`n=== P12 inventory ==="
$inv = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/inventory/v1/inventory/$vid"
Write-Host "OK available=$($inv.available)"

Write-Host "`n=== P13 order (async Kafka) ==="
$idem = "p13-$(Get-Date -Format 'HHmmss')"
$order = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/orders/v1/orders" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "Idempotency-Key" = $idem } `
  -Body (@{ merchant_id = $merchant; store_id = $store.store.id; buyer_id = "buyer-p13"; variant_id = $vid; product_id = $productId; qty = 1 } | ConvertTo-Json)
Start-Sleep -Seconds 5
$ost = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/orders/v1/orders/$($order.order_id)"
Write-Host "Order $($order.order_id) status=$($ost.status)"
if ($ost.status -ne "confirmed") { Write-Host "WARN: expected confirmed, got $($ost.status)" -ForegroundColor Yellow }

Write-Host "`n=== P28 read model ==="
$read = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/read/v1/read/products/$productId" -ErrorAction SilentlyContinue
if ($read) { Write-Host "OK read model title=$($read.title) source=$($read.source)" }
else { Write-Host "WARN: readmodel-svc not ready (start dev-lite readmodel-svc)" -ForegroundColor Yellow }

Write-Host "`n=== P31 flash queue ==="
$flashEvent = "evt-$(Get-Date -Format 'HHmmss')"
$q = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/orders/v1/flash/queue" `
  -Method POST -ContentType "application/json" `
  -Body (@{ flash_event_id = $flashEvent; buyer_id = "buyer-queue" } | ConvertTo-Json)
Start-Sleep -Seconds 2
$qs = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/orders/v1/flash/queue/status?token=$($q.queue_token)"
Write-Host "Queue token=$($q.queue_token) position=$($q.position) admitted=$($qs.admitted)"

Write-Host "`n=== P24 flash buy (sync reserve + async confirm) ==="
$flashIdem = "flash-$(Get-Date -Format 'HHmmss')"
$flash = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/orders/v1/flash/buy" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "Idempotency-Key" = $flashIdem } `
  -Body (@{ merchant_id = $merchant; store_id = $store.store.id; buyer_id = "buyer-flash"; variant_id = $vid; product_id = $productId; qty = 1 } | ConvertTo-Json)
Start-Sleep -Seconds 5
$flashSt = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/orders/v1/orders/$($flash.order_id)"
Write-Host "Flash order $($flash.order_id) reserved=$($flash.reserved) status=$($flashSt.status)"
if ($flashSt.status -ne "confirmed") { Write-Host "WARN: expected confirmed, got $($flashSt.status)" -ForegroundColor Yellow }

Write-Host "`n=== P14 wallet ledger ==="
$ledger = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/wallet/v1/order/$($order.order_id)" `
  -Headers @{ "X-Wallet-Api-Key" = $walletKey }
Write-Host "Ledger entries: $($ledger.entries.Count)"

Write-Host "`n=== P16 Hermes listing optimize ==="
$opt = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/hermes/v1/listing/optimize" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "X-Hermes-Api-Key" = $hermesKey } `
  -Body (@{ merchant_id = $merchant; product_id = $productId; title = "Go Catalog Smoke"; category = "fashion" } | ConvertTo-Json)
Write-Host "OK source=$($opt.optimized.source) score=$($opt.optimized.score)"

Write-Host "`n=== P19 live consult ==="
$lc = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/hermes/v1/live/consult" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "X-Hermes-Api-Key" = $hermesKey } `
  -Body (@{ merchant_id = $merchant; room_name = "live-smoke"; checkout_dropoff_pct = 0.4 } | ConvertTo-Json)
Write-Host "Script: $($lc.script)"

Write-Host "`nP9-P32 commerce smoke complete."
