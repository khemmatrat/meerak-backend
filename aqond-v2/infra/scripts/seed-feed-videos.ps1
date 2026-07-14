#Requires -Version 5.1
<#
  Seed real feed videos: upload → transcode → publish → feed-svc fan-out.

  Prereqs (run once):
    pwsh -File infra/scripts/dev-marketplace.ps1 -Quick
    pwsh -File infra/scripts/apply-scylla-schema.ps1
    pwsh -File infra/scripts/seed-production-shops.ps1 -ShopCount 12

  Seed feed:
    pwsh -File infra/scripts/seed-feed-videos.ps1
    pwsh -File infra/scripts/seed-feed-videos.ps1 -VideoCount 8

  Then open: http://localhost:3003/m/feed
  Viewer id: aqond-feed-demo (auto in app when not logged in)
#>
param(
  [int] $VideoCount = 5,
  [string] $ViewerId = 'aqond-feed-demo',
  [switch] $SkipScylla,
  [switch] $ApplyScylla
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ScriptDir = $PSScriptRoot
$EnvFile = Join-Path $Root 'infra\.env'
$Kong = 'http://127.0.0.1:8000'
$FixtureDir = Join-Path $Root 'infra\fixtures'
$Mp4Path = Join-Path $FixtureDir 'seed-demo.mp4'

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

function Ensure-SeedMp4 {
  if (Test-Path $Mp4Path) {
    $len = (Get-Item $Mp4Path).Length
    if ($len -gt 5000) { return $Mp4Path }
  }
  New-Item -ItemType Directory -Path $FixtureDir -Force | Out-Null
  $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($ffmpeg) {
    Write-Host "Generating seed-demo.mp4 with ffmpeg (2s vertical)..." -ForegroundColor Cyan
    & ffmpeg -y -hide_banner -loglevel error `
      -f lavfi -i "color=c=0xFE2C55:s=360x640:d=2" `
      -f lavfi -i "sine=frequency=440:duration=2" `
      -shortest -pix_fmt yuv420p -c:v libx264 -preset ultrafast -c:a aac `
      $Mp4Path
    if (Test-Path $Mp4Path) { return $Mp4Path }
  }
  Write-Host "ffmpeg not found — downloading tiny sample MP4..." -ForegroundColor Yellow
  $url = 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4'
  try {
    Invoke-WebRequest -Uri $url -OutFile $Mp4Path -UseBasicParsing -TimeoutSec 60
    if (Test-Path $Mp4Path) { return $Mp4Path }
  } catch {
    Write-Warning "Download failed: $($_.Exception.Message)"
  }
  throw "Need seed MP4 at $Mp4Path — install ffmpeg or place a small .mp4 there"
}

function Wait-MediaReady {
  param([string] $MediaId, [int] $MaxSec = 90)
  $deadline = (Get-Date).AddSeconds($MaxSec)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    try {
      $m = Invoke-RestMethod -Uri "$Kong/api/v1/video/v1/media/$MediaId" -TimeoutSec 15
      Write-Host "    status=$($m.status)" -ForegroundColor DarkGray
      if ($m.status -eq 'ready' -or $m.status -eq 'published') { return $true }
      if ($m.status -eq 'rejected') { throw "media $MediaId rejected" }
    } catch {
      if ($_.Exception.Message -match 'rejected') { throw }
    }
  }
  return $false
}

function Get-CatalogProducts {
  param([int] $Limit = 30)
  try {
    $r = Invoke-RestMethod -Uri "$Kong/api/v1/catalog/v1/products?status=published&limit=$Limit" -TimeoutSec 30
    $list = @($r.products)
    if ($list.Count -gt 0) { return $list }
  } catch { }
  try {
    $home = Invoke-RestMethod -Uri "$Kong/api/v1/bff/v1/home" -TimeoutSec 30
    return @($home.products.products)
  } catch { }
  return @()
}

Write-Host '=== Seed feed videos (feed-svc + video-svc) ===' -ForegroundColor Cyan

try {
  $fh = Invoke-RestMethod -Uri "$Kong/api/v1/feed/health" -TimeoutSec 15
  if (-not $fh.ok) { throw 'feed-svc unhealthy' }
} catch {
  throw "feed-svc not reachable at $Kong — run: pwsh -File infra/scripts/dev-marketplace.ps1 -Quick"
}

try {
  $vh = Invoke-RestMethod -Uri "$Kong/api/v1/video/health" -TimeoutSec 15
  if (-not $vh.ok) { throw 'video-svc unhealthy' }
} catch {
  throw "video-svc not reachable — ensure dev-marketplace -Product stack is up"
}

if ($ApplyScylla -or -not $SkipScylla) {
  Write-Host 'Applying Scylla feed schema (idempotent)...' -ForegroundColor DarkCyan
  & (Join-Path $ScriptDir 'apply-scylla-schema.ps1')
}

$mp4 = Ensure-SeedMp4
$products = Get-CatalogProducts -Limit ([Math]::Max($VideoCount * 2, 20))
if ($products.Count -eq 0) {
  Write-Host 'No catalog products — seeding shops first...' -ForegroundColor Yellow
  & (Join-Path $ScriptDir 'seed-production-shops.ps1') -ShopCount 12
  Start-Sleep -Seconds 2
  $products = Get-CatalogProducts -Limit 30
}
if ($products.Count -eq 0) {
  throw 'No products in catalog — seed-production-shops.ps1 failed'
}

$created = 0
$ts = Get-Date -Format 'yyyyMMdd'

for ($i = 1; $i -le $VideoCount; $i++) {
  $author = "creator-feed-$ts-$i"
  $prod = $products[($i - 1) % $products.Count]
  $productId = $prod.id
  $title = if ($prod.title) { $prod.title } elseif ($prod.name) { $prod.name } else { "Product $i" }
  $caption = "[product:$productId][creator:$author] $title — วิดีโอแนะนำจาก AQOND"

  Write-Host "`n[$i/$VideoCount] $author → product $productId" -ForegroundColor Yellow

  $upload = Invoke-RestMethod `
    -Uri "$Kong/api/v1/video/v1/media/upload?author_id=$([uri]::EscapeDataString($author))" `
    -Method POST -ContentType 'video/mp4' -InFile $mp4 -TimeoutSec 120
  Write-Host "  upload media_id=$($upload.media_id)" -ForegroundColor DarkGray

  if (-not (Wait-MediaReady $upload.media_id)) {
    Write-Warning "  transcode timeout for $($upload.media_id) — skipping post"
    continue
  }

  $pb = Invoke-RestMethod -Uri "$Kong/api/v1/video/v1/media/$($upload.media_id)/playback" -TimeoutSec 15
  Write-Host "  playback format=$($pb.format)" -ForegroundColor DarkGray

  $post = Invoke-RestMethod -Uri "$Kong/api/v1/feed/v1/posts" `
    -Method POST -ContentType 'application/json' `
    -Body (@{
      author_id = $author
      media_id  = $upload.media_id
      caption   = $caption
      post_type = 'video'
    } | ConvertTo-Json)
  Write-Host "  post_id=$($post.post_id)" -ForegroundColor Green

  Invoke-RestMethod -Uri "$Kong/api/v1/feed/v1/follow" `
    -Method POST -ContentType 'application/json' `
    -Body (@{ follower_id = $ViewerId; followee_id = $author } | ConvertTo-Json) | Out-Null

  try {
    Invoke-RestMethod -Uri "$Kong/api/v1/rec/v1/signals" `
      -Method POST -ContentType 'application/json' `
      -Body (@{
        user_id = $ViewerId
        post_id = $post.post_id
        signal  = 'watch_time'
        value   = 30
      } | ConvertTo-Json) | Out-Null
  } catch { }

  $created++
  Start-Sleep -Seconds 2
}

Write-Host "`nWaiting for fan-out..." -ForegroundColor DarkCyan
Start-Sleep -Seconds 5

$feed = Invoke-RestMethod -Uri "$Kong/api/v1/feed/v1/feed/for-you?user_id=$ViewerId&limit=20" -TimeoutSec 30
$fCount = @($feed.items).Count
Write-Host "for-you feed items for ${ViewerId}: $fCount" -ForegroundColor $(if ($fCount -gt 0) { 'Green' } else { 'Yellow' })

if ($fCount -eq 0) {
  $tl = Invoke-RestMethod -Uri "$Kong/api/v1/feed/v1/feed?user_id=$ViewerId&limit=20" -TimeoutSec 30
  Write-Host "timeline items: $(@($tl.items).Count)" -ForegroundColor Yellow
}

Write-Host @"

=== Feed seed complete ===
  videos published: $created
  viewer id:          $ViewerId

Open:
  http://localhost:3003/m/feed

If feed empty in browser, hard-refresh or clear localStorage key aqond_feed_viewer_id
"@ -ForegroundColor Green
