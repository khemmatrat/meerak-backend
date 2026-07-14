# P5 smoke: Live Closer REST + optional WebSocket path
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "=== 1. voice health ==="
$health = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/voice/health" -TimeoutSec 30
Write-Host "ok=$($health.ok) model=$($health.model) closer=$($health.p5.live_closer)"

Write-Host "`n=== 2. sync published product ==="
$ext = "p5-voice-$(Get-Date -Format 'HHmmss')"
$secret = $env:BAGISTO_WEBHOOK_SECRET
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/marketplace/internal/sync-product" `
  -Method POST `
  -Headers @{ "X-Bagisto-Sync-Secret" = $secret; "Idempotency-Key" = $ext } `
  -ContentType "application/json" `
  -Body (@{
    title = "P5 Voice Closer Product"; category = "live"; price_thb = 159; inventory = 2; status = "published"
  } | ConvertTo-Json) | Out-Null

Write-Host "`n=== 3. closer chat (price inquiry) ==="
$chat = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/voice/closer/text" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    session_id = "p5-smoke"
    external_id = $ext
    text = "ราคาเท่าไหร่ครับ"
  } | ConvertTo-Json)
Write-Host "Reply: $($chat.closer.reply_th)"

Write-Host "`n=== 4. closer order intent (เอาเลย) ==="
$buy = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/voice/closer/text" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    session_id = "p5-smoke-buy"
    external_id = $ext
    text = "เอาเลยครับ สั่งซื้อ"
  } | ConvertTo-Json)
Write-Host "Reply: $($buy.closer.reply_th)"
if (-not $buy.checkout) {
  Write-Host "WARN: checkout not triggered (set VOICE_USE_RULES_ONLY=1 if Ollama slow)" -ForegroundColor Yellow
} else {
  Write-Host "Order: $($buy.checkout.order.order_id) escrow=$($buy.checkout.escrow.status)"
}

Write-Host "`nP5 smoke complete."
Write-Host "UI: http://127.0.0.1:${Kong}/api/v1/voice/closer?product=$ext"
