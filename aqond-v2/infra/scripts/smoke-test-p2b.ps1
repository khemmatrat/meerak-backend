# P2b smoke: draft sync → publish → checkout → escrow HOLD
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$ext = "p2b-smoke-$(Get-Date -Format 'HHmmss')"
Write-Host "=== 1. sync draft product ==="
$syncBody = @{
  llm_output = @{
    title = "P2b Checkout Test"
    category = "test"
    price_thb = 99
    inventory = 5
    description = "draft then publish"
  }
  status = "draft"
} | ConvertTo-Json -Depth 5

$sync = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/cms/ai/onboard" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "Idempotency-Key" = $ext } `
  -Body $syncBody
Write-Host "Status: $($sync.bagisto.product.status) external_id=$ext"

Write-Host "`n=== 2. shop empty before publish ==="
$before = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/products"
Write-Host "Published count (should not include draft): $($before.count)"

Write-Host "`n=== 3. publish ==="
$pub = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/products/$ext/publish" -Method POST
Write-Host "Published: $($pub.product.title) bagisto_mirror=$($pub.bagisto_mirror.skipped -eq $null)"

Write-Host "`n=== 4. checkout + escrow HOLD ==="
$co = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/checkout" `
  -Method POST -ContentType "application/json" `
  -Body (@{ external_id = $ext; buyer_id = "buyer-smoke"; qty = 1 } | ConvertTo-Json)
Write-Host "Order: $($co.order.order_id) amount_thb=$($co.amount_thb) escrow=$($co.escrow.status)"

Write-Host "`nP2b smoke complete."
