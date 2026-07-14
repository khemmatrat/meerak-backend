# P2a smoke: catalog sync + shop listing (no AI — fast)
$ErrorActionPreference = "Stop"
$Kong = "8000"
$body = '{"llm_output":{"title":"P2a Smoke Product","category":"fashion","price_thb":249,"inventory":6,"description":"catalog smoke test"}}'
$r = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/cms/ai/onboard" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "Idempotency-Key" = "p2a-smoke-$(Get-Date -Format 'HHmmss')" } `
  -Body $body
Write-Host "Sync OK: $($r.product.title) -> catalog id $($r.bagisto.product.id)"
$catalog = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/products"
Write-Host "Shop has $($catalog.count) product(s)"
Write-Host "Shop UI: http://127.0.0.1:${Kong}/api/v1/marketplace/shop"
Write-Host "Onboard UI: http://127.0.0.1:${Kong}/api/v1/cms/onboard"
