# P4 smoke: live-token health → create room → F-Code overlay (no WebRTC)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "=== 1. live-token health ==="
$health = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/live/health" -TimeoutSec 30
Write-Host "ok=$($health.ok) p4=$($health.p4.f_code) ws=$($health.livekit_ws)"

Write-Host "`n=== 2. sync product for F-Code ==="
$ext = "p4-live-$(Get-Date -Format 'HHmmss')"
$secret = $env:BAGISTO_WEBHOOK_SECRET
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/internal/sync-product" `
  -Method POST `
  -Headers @{ "X-Bagisto-Sync-Secret" = $secret; "Idempotency-Key" = $ext } `
  -ContentType "application/json" `
  -Body (@{
    title = "P4 Live Product"; category = "live"; price_thb = 199; inventory = 3; status = "published"
  } | ConvertTo-Json) | Out-Null

Write-Host "`n=== 3. create live room ==="
$room = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/live/room" `
  -Method POST -ContentType "application/json" `
  -Body (@{ merchant_id = "p4-smoke"; tier = "tier-1"; title = "Smoke Live" } | ConvertTo-Json)
$roomName = $room.room
Write-Host "Room: $roomName watch=$($room.session.watch_url)"

Write-Host "`n=== 4. push F-Code ==="
$fc = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/live/f-code" `
  -Method POST -ContentType "application/json" `
  -Body (@{ room_name = $roomName; external_id = $ext } | ConvertTo-Json)
Write-Host "F-Code: $($fc.overlay.f_code) title=$($fc.overlay.title) price=$($fc.overlay.price_thb)"

Write-Host "`n=== 5. overlay poll ==="
$ov = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/live/overlay/$roomName"
if (-not $ov.overlay -or $ov.overlay.external_id -ne $ext) {
  throw "Overlay mismatch"
}
Write-Host "Overlay OK external_id=$($ov.overlay.external_id)"

Write-Host "`n=== 6. viewer token mint ==="
$tok = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/live/token" `
  -Method POST -ContentType "application/json" `
  -Body (@{ room_name = $roomName; identity = "viewer-smoke"; can_publish = $false } | ConvertTo-Json)
if (-not $tok.token) { throw "No JWT token" }
Write-Host "JWT length=$($tok.token.Length) url=$($tok.url)"

Write-Host "`nP4 smoke complete."
Write-Host "Studio: http://127.0.0.1:${Kong}/api/v1/live/studio?merchant=p4-smoke"
Write-Host "Watch:  http://127.0.0.1:${Kong}/api/v1/live/watch?room=$roomName"
