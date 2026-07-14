# Verify Publish → bagisto-bridge → MySQL aqond_products mirror
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "=== 0. bridge health ==="
$health = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/health" -TimeoutSec 30
Write-Host "marketplace ok=$($health.ok) bagisto=$($health.bagisto.configured)"

Write-Host "`n=== 1. sync draft (direct, no AI) ==="
$ext = "mirror-smoke-$(Get-Date -Format 'HHmmss')"
$syncBody = @{
  title = "Mirror Smoke $(Get-Date -Format 'HH:mm')"
  category = "test"
  price_thb = 77
  inventory = 3
  description = "publish mirror test"
  status = "draft"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/internal/sync-product" `
  -Method POST -ContentType "application/json" `
  -Headers @{
    "X-Bagisto-Sync-Secret" = $env:BAGISTO_WEBHOOK_SECRET
    "Idempotency-Key" = $ext
  } `
  -Body $syncBody | Out-Null

Write-Host "`n=== 2. publish (mirror) ==="
$pub = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/products/$ext/publish" -Method POST
$m = $pub.bagisto_mirror
if ($m.ok -ne $true) {
  Write-Host "FAIL bagisto_mirror: $($m | ConvertTo-Json -Compress)" -ForegroundColor Red
  exit 1
}
Write-Host "OK bagisto_product_id=$($m.bagisto_product_id) external_id=$ext"

Write-Host "`n=== 3. MySQL row (via bridge list) ==="
$bridge = docker exec aqond-v2-bagisto-bridge wget -qO- --header="X-Aqond-Sync-Key: $env:BAGISTO_WEBHOOK_SECRET" http://127.0.0.1:8089/aqond-api/v1/products 2>$null
if (-not $bridge) {
  $bridge = docker exec aqond-v2-marketplace node -e "
    fetch('http://bagisto-bridge:8089/aqond-api/v1/products',{headers:{'X-Aqond-Sync-Key':process.env.BAGISTO_WEBHOOK_SECRET}}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>{console.error(e);process.exit(1)})
  "
}
$rows = $bridge | ConvertFrom-Json
$hit = $rows.products | Where-Object { $_.external_id -eq $ext }
if (-not $hit) { throw "MySQL mirror row not found for $ext" }
Write-Host "OK MySQL mirror title=$($hit.title) status=$($hit.status)"

Write-Host "`nMirror smoke complete."
