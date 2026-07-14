# P141-P170 Headless storefront + BFF smoke test (Epoch 9)
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
$email = "buyer-$ts@test.local"

# ---------------- Pillar A: BFF foundation ----------------
Write-Host "=== P142 bff-svc health ==="
$h = Invoke-RestMethod -Uri (Url "/api/v1/bff/health") -TimeoutSec 30
if (-not $h.ok) { throw "bff-svc unhealthy" }
Write-Host "OK bff-svc"

Write-Host "`n=== P142/P168 context resolve ==="
$ctx = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/context?locale=th-TH") -TimeoutSec 30
Write-Host "OK region=$($ctx.region)"

Write-Host "`n=== P144 auth login ==="
$auth = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/auth/login") -Method POST -ContentType "application/json" `
  -Body (J @{ email=$email; password="test123"; device="smoke" })
$user = $auth.user_id
$hdr = @{ "X-User-Id"=$user; "X-Session-Id"=$auth.session_id; "X-Aqond-Region"="TH" }
Write-Host "OK user=$user token_len=$($auth.token.Length)"

Write-Host "`n=== P148 home view model ==="
$home = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/home") -Headers $hdr -TimeoutSec 30
Write-Host "OK categories=$($home.categories.Count)"

Write-Host "`n=== P150 search + suggest ==="
$sug = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/suggest?q=shirt") -TimeoutSec 30
Write-Host "OK suggest items=$(if($sug.suggestions){$sug.suggestions.Count}else{0})"

# ---------------- Pillar B: cart + checkout ----------------
Write-Host "`n=== P151 cart add + coupon ==="
Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/cart/items") -Method POST -ContentType "application/json" -Headers $hdr `
  -Body (J @{ owner_id=$user; product_id="prod-$ts"; merchant_id="m-$ts"; title="Smoke Tee"; qty=2; unit_price_micro=99000000; currency="THB" }) | Out-Null
$cart = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/cart?owner_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK cart count=$($cart.count) total=$($cart.total_micro)"
Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/cart/coupon") -Method POST -ContentType "application/json" -Headers $hdr `
  -Body (J @{ owner_id=$user; code="WELCOME10" }) | Out-Null
Write-Host "OK coupon applied"

Write-Host "`n=== P152 checkout view ==="
$co = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/checkout?owner_id=$user") -Headers $hdr -TimeoutSec 30
Write-Host "OK payment_methods=$(if($co.payment_methods.methods){$co.payment_methods.methods.Count}else{0})"

# ---------------- Pillar C: feed + settings + activity ----------------
Write-Host "`n=== P156 feed ==="
$feed = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/feed?kind=for-you") -Headers $hdr -TimeoutSec 30
Write-Host "OK feed posts=$(if($feed.posts){$feed.posts.Count}else{0})"

Write-Host "`n=== P161 settings update ==="
Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/settings") -Method POST -ContentType "application/json" -Headers $hdr `
  -Body (J @{ user_id=$user; theme="dark"; personalization=$true }) | Out-Null
$set = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/settings") -Headers $hdr -TimeoutSec 30
Write-Host "OK theme=$($set.settings.theme)"

Write-Host "`n=== P159 creator studio ==="
$st = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/creator/studio") -Headers $hdr -TimeoutSec 30
Write-Host "OK studio creator=$($st.creator_id)"

# ---------------- Pillar D: mobile + share + RUM ----------------
Write-Host "`n=== P163 mobile shell ==="
$mob = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/mobile/shell") -TimeoutSec 30
Write-Host "OK tabs=$($mob.tabs.Count) engine=$($mob.engine)"

Write-Host "`n=== P165 offline packs ==="
$off = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/offline/packs") -TimeoutSec 30
Write-Host "OK packs=$($off.packs.Count)"

Write-Host "`n=== P167 share QR ==="
$qr = Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/share/qr?kind=profile&ref=$user") -TimeoutSec 30
Write-Host "OK deep_link=$($qr.deep_link)"

Write-Host "`n=== P147 RUM ingest ==="
Invoke-RestMethod -Uri (Url "/api/v1/bff/v1/rum") -Method POST -ContentType "application/json" `
  -Body (J @{ route="/"; metric="LCP"; value=1200; rating="good"; region="TH" }) | Out-Null
Write-Host "OK rum recorded"

Write-Host "`n=== P151 cart-svc direct health ==="
$ch = Invoke-RestMethod -Uri (Url "/api/v1/cart/health") -TimeoutSec 30
Write-Host "OK cart-svc ok=$($ch.ok)"

Write-Host "`n=== P170 storefront HTTP (if running on :3000) ==="
try {
  $sf = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -TimeoutSec 5 -UseBasicParsing
  Write-Host "OK storefront status=$($sf.StatusCode)"
} catch {
  Write-Host "SKIP storefront not running on :3000 (start with docker compose --profile dev-lite up storefront)"
}

Write-Host "`n=== Epoch 9 (P141-P170) smoke test complete ==="
