#Requires -Version 5.1
<#
  AQOND v2 — APP-ONLY dev (NO Docker on Windows).

  พัฒนา storefront / mobile UI / feed / checkout UI จนจบ — ไม่ต้องเปิด Docker Desktop.
  API จริง deploy บน VPS ตอน production (ใช้ dev-remote-tunnel.ps1 ถ้าต้องเชื่อม VPS).

  คำสั่งเดียว:
    pwsh -File infra/scripts/dev-app.ps1

  ครั้งแรก / รีเซ็ต feed:
    pwsh -File infra/scripts/dev-app.ps1 -Seed
    pwsh -File infra/scripts/dev-app.ps1 -Seed -Videos 8

  เชื่อม API บน VPS (optional — ไม่บังคับ):
    pwsh -File infra/scripts/dev-remote-tunnel.ps1 -Server user@your-vps
    # แล้วรัน dev-app.ps1 ใน terminal อื่น (จะใช้ Kong ผ่าน tunnel ถ้าถึงได้)

  หน้าหลัก:
    http://localhost:3003/m/home
    http://localhost:3003/m/feed     ← วิดีโอ local จริง (ไม่ต้อง Docker)
    http://localhost:3003/m/studio    ← อัปโหลดวิดีโอ → local feed
#>
param(
  [switch] $Seed,
  [int] $Videos = 5,
  [switch] $KillExisting,
  [switch] $KeepExisting,
  [int] $Port = 3003
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ScriptDir = $PSScriptRoot
Set-Location $Root

$env:AQOND_LOCAL_DEV = '1'
$env:NEXT_PUBLIC_AQOND_LOCAL_DEV = '1'
$env:AI_CORE_DIRECT_URL = if ($env:AI_CORE_DIRECT_URL) { $env:AI_CORE_DIRECT_URL } else { 'http://127.0.0.1:8100' }

$envFile = Join-Path $Root 'infra\.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([^=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim().Trim('"').Trim("'")
      if ($k -eq 'AI_CORE_API_KEY' -and $v) { $env:AI_CORE_API_KEY = $v }
      if ($k -eq 'KONG_JWT_SECRET' -and $v) { $env:KONG_JWT_SECRET = $v }
      if ($k -eq 'MEERAK_JWT_SECRET' -and $v) { $env:MEERAK_JWT_SECRET = $v }
      if ($k -match '^MINIO_' -and $v) { Set-Item -Path "env:$k" -Value $v }
    }
  }
  if ($env:MINIO_ROOT_PASSWORD) {
    $env:MINIO_ACCESS_KEY = if ($env:MINIO_ROOT_USER) { $env:MINIO_ROOT_USER } else { $env:MINIO_ACCESS_KEY }
    $env:MINIO_SECRET_KEY = $env:MINIO_ROOT_PASSWORD
    $env:MINIO_ENDPOINT = if ($env:MINIO_ENDPOINT) { $env:MINIO_ENDPOINT } else { 'http://127.0.0.1:9000' }
  }
}

$postsFile = Join-Path $Root 'apps\storefront\.data\studio\posts.json'
if ($Seed -or -not (Test-Path $postsFile)) {
  & (Join-Path $ScriptDir 'seed-feed-local.ps1') -Videos $Videos
}

Write-Host @"

========================================
  AQOND v2 — App Dev (no Docker)
========================================
  Local mode:  catalog + feed จาก .data/
  Kong/API:    optional (VPS tunnel หรือปล่อยว่าง)

  Pages:
    /m/home   /m/feed   /m/food   /m/studio   /m/sell
    /m/merchant   /m/merchant/orders   /m/merchant/menu   /m/merchant/staff
    Jarvis 🤖 — ปุ่มลอยมุมขวาล่าง (ทุกหน้า /m/*)
    Voice 🎤 — กดไมค์พูดได้ (Chrome/Edge · อนุญาต mic)

  เปิดทุกหน้าในเบราว์เซอร์ (terminal อื่น):
    pwsh -File infra/scripts/open-product-ui.ps1
    pwsh -File infra/scripts/open-product-ui.ps1 -OpenAll

  AI ฉลาดขึ้น (optional — ไม่ต้อง Docker):
    pwsh -File infra/scripts/ai-core-local.ps1
    # แล้ว Jarvis จะใช้ Hermes ผ่าน Ollama แทน rules local
========================================
"@ -ForegroundColor Magenta

$splat = @{}
if ($KillExisting -or -not $KeepExisting) { $splat['KillExisting'] = $true }
if ($Port -ne 3000) { $splat['Port'] = $Port }

& (Join-Path $ScriptDir 'storefront-dev.ps1') @splat
