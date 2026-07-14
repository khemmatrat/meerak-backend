#Requires -Version 5.1
<#
  เปิดหน้า Merchant / Studio / Marketplace ในเบราว์เซอร์ (ไม่ต้อง Docker)

  เริ่ม UI ก่อน (terminal แยก):
    pwsh -File infra/scripts/dev-app.ps1 -KillExisting

  แล้วรัน:
    pwsh -File infra/scripts/open-product-ui.ps1
    pwsh -File infra/scripts/open-product-ui.ps1 -OpenAll
#>
param(
  [int] $Port = 3003,
  [switch] $OpenAll,
  [switch] $OpenMerchant,
  [switch] $OpenStudio,
  [switch] $OpenMarketplace
)

$Base = "http://localhost:$Port"

$groups = [ordered]@{
  Marketplace = @(
    @{ path = '/m/home'; label = 'Mobile home' }
    @{ path = '/shop'; label = 'Shop catalog' }
    @{ path = '/m/feed'; label = 'TikTok feed' }
    @{ path = '/m/search'; label = 'Search' }
    @{ path = '/m/cart'; label = 'Cart' }
    @{ path = '/m/checkout'; label = 'Checkout' }
    @{ path = '/m/orders'; label = 'Orders' }
    @{ path = '/m/login'; label = 'Login (shared AQOND account)' }
  )
  Merchant = @(
    @{ path = '/m/merchant'; label = 'Merchant hub' }
    @{ path = '/m/merchant/orders'; label = 'Orders (kitchen)' }
    @{ path = '/m/merchant/menu'; label = 'Menu editor' }
    @{ path = '/m/merchant/shops'; label = 'My shops' }
    @{ path = '/m/merchant/staff'; label = 'Staff roles' }
    @{ path = '/m/merchant/wallet'; label = 'Wallet' }
    @{ path = '/m/merchant/promos'; label = 'Promotions' }
    @{ path = '/m/merchant/sales'; label = 'Sales analytics' }
    @{ path = '/m/merchant/status'; label = 'Shop status' }
    @{ path = '/m/merchant/qr'; label = 'QR menu' }
  )
  Studio = @(
    @{ path = '/m/studio'; label = 'Creator studio (mobile)' }
    @{ path = '/m/sell'; label = 'AI product listing' }
    @{ path = '/creator/studio'; label = 'Creator studio (desktop)' }
    @{ path = '/m/creator/earnings'; label = 'Creator earnings' }
    @{ path = '/feed'; label = 'Feed (desktop)' }
  )
  Food = @(
    @{ path = '/m/food'; label = 'Food nearby' }
    @{ path = '/m/food/cart'; label = 'Food cart' }
    @{ path = '/m/food/checkout'; label = 'Food checkout' }
  )
  Rider = @(
    @{ path = '/m/rider/jobs'; label = 'Rider jobs' }
    @{ path = '/m/rider/mine'; label = 'Rider earnings' }
  )
}

Write-Host "`n=== AQOND Product UI — $Base ===" -ForegroundColor Cyan
Write-Host "Start UI: pwsh -File infra/scripts/dev-app.ps1 -KillExisting`n" -ForegroundColor DarkGray

$allUrls = @()
foreach ($g in $groups.GetEnumerator()) {
  Write-Host "[$($g.Key)]" -ForegroundColor Yellow
  foreach ($item in $g.Value) {
    $url = "$Base$($item.path)"
    $allUrls += $url
    Write-Host "  $($item.label)" -ForegroundColor White
    Write-Host "    $url" -ForegroundColor DarkGray
  }
  Write-Host ""
}

try {
  $probe = Invoke-WebRequest -Uri "$Base/m/home" -UseBasicParsing -TimeoutSec 4
  Write-Host "Storefront OK (HTTP $($probe.StatusCode))" -ForegroundColor Green
} catch {
  Write-Host "Storefront not running on $Base" -ForegroundColor Red
  Write-Host "  pwsh -File infra/scripts/dev-app.ps1 -KillExisting" -ForegroundColor Yellow
  exit 1
}

$toOpen = @()
if ($OpenAll) {
  $toOpen = $allUrls
} else {
  if ($OpenMerchant -or (-not $OpenStudio -and -not $OpenMarketplace)) {
    $toOpen += $groups.Marketplace | ForEach-Object { "$Base$($_.path)" }
    $toOpen += $groups.Merchant | ForEach-Object { "$Base$($_.path)" }
  }
  if ($OpenStudio) {
    $toOpen += $groups.Studio | ForEach-Object { "$Base$($_.path)" }
  }
  if ($OpenMarketplace) {
    $toOpen += $groups.Marketplace | ForEach-Object { "$Base$($_.path)" }
  }
}

if ($toOpen.Count -gt 0 -and ($OpenAll -or $OpenMerchant -or $OpenStudio -or $OpenMarketplace -or $PSBoundParameters.Count -eq 0)) {
  Write-Host "Opening $($toOpen.Count) tab(s)..." -ForegroundColor Cyan
  foreach ($u in $toOpen) {
    Start-Process $u
    Start-Sleep -Milliseconds 400
  }
}
