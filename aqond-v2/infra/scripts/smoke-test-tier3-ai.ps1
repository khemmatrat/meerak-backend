# Tier 3 AI smoke — expect HTTP 200 on core AI endpoints
param(
  [string]$Kong = "http://127.0.0.1:8000",
  [string]$Storefront = "http://127.0.0.1:3000",
  [string]$AiKey = $env:AI_CORE_API_KEY
)

$ErrorActionPreference = "Continue"
$fail = 0

function Test-200($name, $method, $url, $body = $null, $headers = @{}) {
  try {
  $params = @{
    Uri = $url
    Method = $method
    TimeoutSec = 30
    UseBasicParsing = $true
  }
  if ($body) {
    $params.Body = ($body | ConvertTo-Json -Depth 6)
    $params.ContentType = "application/json"
  }
  if ($headers.Count) { $params.Headers = $headers }
  $r = Invoke-WebRequest @params
  if ($r.StatusCode -eq 200) {
    Write-Host "OK  $name ($($r.StatusCode))" -ForegroundColor Green
    return $true
  }
  Write-Host "FAIL $name status=$($r.StatusCode)" -ForegroundColor Red
  $script:fail++
  return $false
  } catch {
    Write-Host "FAIL $name $($_.Exception.Message)" -ForegroundColor Red
    $script:fail++
    return $false
  }
}

$h = @{}
if ($AiKey) { $h["X-AI-Core-Api-Key"] = $AiKey }
$hh = @{}
if ($env:HERMES_API_KEY) { $hh["X-Hermes-Api-Key"] = $env:HERMES_API_KEY }
elseif ($AiKey) { $hh["X-Hermes-Api-Key"] = $AiKey }

Write-Host "=== Tier 3 AI smoke ===" -ForegroundColor Cyan

Test-200 "ai-core health" GET "$Kong/api/v1/ai/health" $null $h
Test-200 "voice-service health" GET "$Kong/api/v1/voice/health"
Test-200 "hermes health" GET "$Kong/api/v1/hermes/health" $null $hh

Test-200 "jarvis concierge" POST "$Kong/api/v1/ai/v1/jarvis/concierge" @{
  user_message = "หา matcha"
  session = @{ active_orders = @() }
} $h

Test-200 "onboard product rules" POST "$Kong/api/v1/ai/v1/onboard/product" @{
  merchant_hint = "เสื้อยืด"
  llm_output = @{ title = "เสื้อยืดคอตตอน"; description = "นุ่มสบาย"; category = "fashion" }
} $h

Test-200 "hermes tool sla" POST "$Kong/api/v1/hermes/v1/tools/call" @{
  merchant_id = "demo-merchant"
  tool = "merchant_sla_hint"
  arguments = @{ urgent = $true }
} $hh

Test-200 "voice jarvis text" POST "$Kong/api/v1/voice/jarvis/text" @{
  session_id = "smoke"
  text = "หา matcha"
}

Test-200 "storefront jarvis GET" GET "$Storefront/api/ai/jarvis"
Test-200 "storefront jarvis POST" POST "$Storefront/api/ai/jarvis" @{
  user_message = "ออเดอร์อยู่ไหน"
  buyer_id = "guest"
  session = @{ active_orders = @(@{ order_id = "ord-demo"; status = "preparing"; status_label = "กำลังเตรียม" }) }
}
Test-200 "merchant assistant GET" GET "$Storefront/api/ai/merchant-assistant"
Test-200 "merchant assistant POST" POST "$Storefront/api/ai/merchant-assistant" @{
  merchant_id = "demo-merchant"
  message = "SLA วันนี้เป็นอย่างไร"
}
Test-200 "rider voice GET" GET "$Storefront/api/ai/rider-voice"
Test-200 "rider voice POST" POST "$Storefront/api/ai/rider-voice" @{
  transcript = "รายงานอุบัติเหตุ รถเสีย"
  rider_id = "rider-bee-1"
  job_id = "job-demo"
  phase = "rider_assigned"
}
Test-200 "user preferences GET" GET "$Storefront/api/ai/user-preferences?user_id=smoke-user"
Test-200 "user preferences POST" POST "$Storefront/api/ai/user-preferences" @{
  user_id = "smoke-user"
  jarvis_voice_enabled = $true
}

if ($fail -eq 0) {
  Write-Host "`nAll Tier 3 AI checks passed (200)." -ForegroundColor Green
  exit 0
}
Write-Host "`n$fail check(s) failed." -ForegroundColor Red
exit 1
