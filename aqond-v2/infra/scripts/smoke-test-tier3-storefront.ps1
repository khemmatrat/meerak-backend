# Tier 3 AI smoke — storefront BFF routes (no Kong required)
param(
  [string]$Storefront = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Continue"
$fail = 0

function Test-200($name, $method, $url, $body = $null) {
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

Write-Host "=== Tier 3 AI storefront smoke ===" -ForegroundColor Cyan

Test-200 "jarvis GET" GET "$Storefront/api/ai/jarvis"
Test-200 "jarvis POST" POST "$Storefront/api/ai/jarvis" @{
  user_message = "ออเดอร์อยู่ไหน"
  buyer_id = "guest"
  session = @{ active_orders = @(@{ order_id = "ord-demo"; status = "preparing"; status_label = "กำลังเตรียม" }) }
}
Test-200 "merchant assistant GET" GET "$Storefront/api/ai/merchant-assistant"
Test-200 "merchant assistant POST" POST "$Storefront/api/ai/merchant-assistant" @{
  merchant_id = "demo-merchant"
  message = "SLA วันนี้เป็นอย่างไร"
}
Test-200 "merchant order lookup" POST "$Storefront/api/ai/merchant-assistant" @{
  merchant_id = "demo-merchant"
  message = "ออเดอร์ค้างมีอะไรบ้าง"
}
Test-200 "rider voice GET" GET "$Storefront/api/ai/rider-voice"
Test-200 "rider voice advance" POST "$Storefront/api/ai/rider-voice" @{
  transcript = "รับของแล้ว"
  rider_id = "rider-bee-1"
  job_id = "job-demo"
  phase = "rider_assigned"
}
Test-200 "rider voice incident" POST "$Storefront/api/ai/rider-voice" @{
  transcript = "รายงานอุบัติเหตุ รถเสีย"
  rider_id = "rider-bee-1"
  job_id = "job-demo"
  phase = "rider_assigned"
}
Test-200 "user preferences GET" GET "$Storefront/api/ai/user-preferences?user_id=smoke-user"
Test-200 "user preferences POST" POST "$Storefront/api/ai/user-preferences" @{
  user_id = "smoke-user"
  jarvis_voice_enabled = $true
  jarvis_locale = "th-TH"
}

if ($fail -eq 0) {
  Write-Host "`nAll storefront Tier 3 AI checks passed (200)." -ForegroundColor Green
  exit 0
}
Write-Host "`n$fail check(s) failed." -ForegroundColor Red
exit 1
