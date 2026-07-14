#Requires -Version 5.1
<#
  Seed production-like catalog: N shops, each with unique category + products (published).

  Usage:
    pwsh -File infra/scripts/seed-production-shops.ps1
    pwsh -File infra/scripts/seed-production-shops.ps1 -ShopCount 40
    pwsh -File infra/scripts/seed-production-shops.ps1 -Reset
#>
param(
  [int] $ShopCount = 30,
  [switch] $Reset
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Kong = "http://127.0.0.1:8000"
$Catalog = "$Kong/api/v1/catalog"

function J($o) { $o | ConvertTo-Json -Depth 6 -Compress }

# 6 mall categories × shops — each shop unique theme
$shopTemplates = @(
  @{ cat = "fashion";     prefix = "fashion";     names = @("StyleHub Bangkok","Urban Threads","Silk & Co","Minimal Wear TH","Vintage Closet") }
  @{ cat = "beauty";      prefix = "beauty";      names = @("Glow Beauty TH","Pure Skin Lab","Luxe Cosmetics","Herbal Glow","Nail Art Studio") }
  @{ cat = "electronics"; prefix = "electronics"; names = @("TechZone TH","Smart Gadget Pro","Audio House","PC Builder Hub","Mobile Accessory Plus") }
  @{ cat = "food";        prefix = "food";        names = @("Snack Paradise","Organic Farm TH","Coffee Bean Co","Spice Market","Healthy Bites") }
  @{ cat = "home";        prefix = "home";        names = @("HomeNest TH","Kitchen Pro Shop","Decor Studio","Clean Living","Pet Home Store") }
  @{ cat = "sports";      prefix = "sports";      names = @("FitGear TH","Running Pro","Yoga Life Shop","Outdoor Adventure","Cycling World") }
)

$productNames = @{
  fashion     = @("เสื้อยืด oversize","กางเกงยีนส์สกินนี่","เดรสลำลอง","แjacket หนาว","รองเท้าผ้าใบ","กระเป๋าสะพาย","หมวก bucket","ชุดชั้นในแพ็ค")
  beauty      = @("เซรั่มวิตามินซี","ครีมกันแดด SPF50","ลิปส틴ก matte","มาสก์หน้า","น้ำหอม mini","แปรงแต่งหน้า","ยาสีฟัน","ครีมบำรุงมือ")
  electronics = @("หูฟัง Bluetooth","สายชาร์จ USB-C","พาวเวอร์แบงค์","เมาส์ไร้สาย","คีย์บอร์ด mechanical","กล้อง action","ลำโพง mini","adapter HDMI")
  food        = @("ขนมกรอบรสเผ็ด","กาแฟคั่วเข้ม","น้ำผึ้งแท้","ข้าวกล่อง organic","ชา matcha","นมอัลมонд","ซอสพริก","ผลไม้อบแห้ง")
  home        = @("หมอน memory foam","ชุดเครื่องนอน","กระทะ non-stick","โคมไฟ LED","ที่วางของ","ผ้าเช็ดตัว","กล่องเก็บของ","เบาะรองนั่ง")
  sports      = @("รองเท้าวิ่ง","เสื้อกีฬา dry-fit","ลูกบasketball","เสื่อโยคะ","ถุงมือ fitness","ขวดน้ำ sport","สายรัดยืด","หมวกกันแดดวิ่ง")
}

Write-Host "=== Seed production catalog ($ShopCount shops) ===" -ForegroundColor Cyan

$h = Invoke-RestMethod -Uri "$Catalog/v1/products?status=published&limit=1" -TimeoutSec 30 -ErrorAction SilentlyContinue
if ($Reset) {
  Write-Host "Reset: truncating catalog tables..." -ForegroundColor Yellow
  Get-Content (Join-Path $Root "infra\.env") | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
  }
  $pass = $env:POSTGRES_PASSWORD
  $user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
  @"
TRUNCATE commerce.inventory, commerce.product_variants, commerce.products, commerce.stores, commerce.merchants CASCADE;
"@ | docker compose --env-file (Join-Path $Root "infra\.env") -f (Join-Path $Root "docker-compose.yml") `
    exec -T -e "PGPASSWORD=$pass" aqond-db psql -U $user -d commerce -v ON_ERROR_STOP=1 2>&1 | Out-Null
}

$created = 0
$products = 0
$ts = Get-Date -Format "yyyyMMdd"
$shopIdx = 0

foreach ($tpl in $shopTemplates) {
  foreach ($shopName in $tpl.names) {
    if ($shopIdx -ge $ShopCount) { break }
    $shopIdx++
    $merchant = "m-$ts-$shopIdx"
    $slug = "$($tpl.prefix)-shop-$shopIdx"

    $store = Invoke-RestMethod -Uri "$Catalog/v1/stores" -Method POST -ContentType "application/json" -TimeoutSec 60 `
      -Body (J @{ merchant_id = $merchant; slug = $slug; display_name = $shopName; region = "TH" })
    $storeId = $store.store.id
    $created++

    $names = $productNames[$tpl.cat]
    $prodCount = 3 + ($shopIdx % 3)  # 3-5 products per shop
    for ($p = 0; $p -lt $prodCount; $p++) {
      $title = $names[$p % $names.Count]
      if ($prodCount -gt $names.Count) { $title = "$title #$($p + 1)" }
      $priceMicro = (199 + ($shopIdx * 17) + ($p * 43)) * 100  # 1 THB = 100 micro-units (see catalog price_thb)
      $prod = Invoke-RestMethod -Uri "$Catalog/v1/products" -Method POST -ContentType "application/json" -TimeoutSec 60 `
        -Body (J @{
          store_id = $storeId; merchant_id = $merchant
          title = "$title — $shopName"
          description = "สินค้าคุณภาพจาก $shopName หมวด $($tpl.cat)"
          category = $tpl.cat
          price_micro = $priceMicro
          inventory = 20 + ($p * 5)
          status = "draft"
        })
      Invoke-RestMethod -Uri "$Catalog/v1/products/$($prod.product.id)/publish" -Method POST -TimeoutSec 30 | Out-Null
      $products++
    }
    Write-Host "  OK [$shopIdx/$ShopCount] $shopName ($($tpl.cat)) x$prodCount products" -ForegroundColor DarkGreen
  }
  if ($shopIdx -ge $ShopCount) { break }
}

Write-Host "`nSeeded: shops=$created products=$products" -ForegroundColor Green
$list = Invoke-RestMethod -Uri "$Catalog/v1/products?status=published" -TimeoutSec 30
Write-Host "Published products in catalog: $($list.count)" -ForegroundColor Cyan
