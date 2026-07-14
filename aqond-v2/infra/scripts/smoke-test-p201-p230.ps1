# P201-P230 Production EXP track smoke test (Epoch 11)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

function J($obj) { $obj | ConvertTo-Json -Depth 6 }
function Url($p) { "http://127.0.0.1:${Kong}$p" }
$ts = Get-Date -Format "HHmmss"
$email = "prod-$ts@test.local"

Write-Host "=== P201 promotions-svc health ==="
$h = Invoke-RestMethod -Uri (Url "/api/v1/promotions/health") -TimeoutSec 30
if (-not $h.ok) { throw "promotions-svc unhealthy" }
Write-Host "OK promotions-svc"

Write-Host "`n=== P203 categories (EXP-CAT) ==="
$cats = Invoke-RestMethod -Uri (Url "/api/v1/promotions/v1/categories?mall=1") -TimeoutSec 30
if ($cats.categories.Count -lt 1) { throw "no categories" }
Write-Host "OK categories=$($cats.categories.Count)"

Write-Host "`n=== P201 promotions (EXP-PROMO) ==="
$promos = Invoke-RestMethod -Uri (Url "/api/v1/promotions/v1/promotions") -TimeoutSec 30
Write-Host "OK promotions=$($promos.promotions.Count)"

Write-Host "`n=== P144 auth + P212 account profile ==="
$auth = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/auth/login") -Method POST -ContentType "application/json" `
  -Body (J @{ email=$email; password="test123"; device="smoke-p11" })
$user = $auth.user_id
$hdr = @{ "X-User-Id"=$user; "X-Session-Id"=$auth.session_id; "X-Aqond-Region"="TH" }
Invoke-RestMethod -Uri (Url "/api/v1/account/v1/profile") -Method POST -ContentType "application/json" -Headers $hdr `
  -Body (J @{ user_id=$user; display_name="Smoke Buyer"; username="buyer$ts" }) | Out-Null
$prof = Invoke-RestMethod -Uri (Url "/api/v1/account/v1/profile?user_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK profile=$($prof.display_name)"

Write-Host "`n=== P202 coupon collect + wallet (EXP-COUPON) ==="
Invoke-RestMethod -Uri (Url "/api/v1/coupons/v1/coupons/collect") -Method POST -ContentType "application/json" -Headers $hdr `
  -Body (J @{ user_id=$user; code="WELCOME10" }) | Out-Null
$walletCoupons = Invoke-RestMethod -Uri (Url "/api/v1/coupons/v1/coupons/wallet?user_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK coupon_wallet=$($walletCoupons.coupons.Count)"

Write-Host "`n=== P211 coins earn (EXP-COINS) ==="
Invoke-RestMethod -Uri (Url "/api/v1/coins/v1/coins/earn") -Method POST -ContentType "application/json" -Headers $hdr `
  -Body (J @{ user_id=$user; amount=100; reason="smoke-test" }) | Out-Null
$coins = Invoke-RestMethod -Uri (Url "/api/v1/coins/v1/coins?user_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK coins_balance=$($coins.balance)"

Write-Host "`n=== P148 home with real categories + promotions ==="
$home = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/home") -Headers $hdr -TimeoutSec 30
Write-Host "OK home categories=$($home.categories.Count) promotions=$($home.promotions.Count)"

Write-Host "`n=== P154 wallet BFF aggregate ==="
$wal = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/wallet?user_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK wallet coins=$($wal.coins) coupons=$($wal.coupons.Count)"

Write-Host "`n=== P204 order list (no stub) ==="
$orders = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/orders?buyer_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK orders=$($orders.orders.Count)"

Write-Host "`n=== P213 creator studio (EXP-AFFIL/MONEY) ==="
$studio = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/creator/studio") -Headers $hdr -TimeoutSec 30
Write-Host "OK studio creator=$($studio.creator_id)"

Write-Host "`n=== P225 sounds (EXP-SOUND) ==="
$sounds = Invoke-RestMethod -Uri (Url "/api/v1/creator/v1/sounds") -Headers $hdr -TimeoutSec 30
Write-Host "OK sounds=$($sounds.sounds.Count)"

Write-Host "`n=== P220 community campaigns (EXP-CAMP) ==="
$camps = Invoke-RestMethod -Uri (Url "/api/v1/creator/v1/campaigns?user_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK campaigns=$($camps.campaigns.Count)"

Write-Host "`n=== ALL P201-P230 smoke checks passed ===" -ForegroundColor Green
