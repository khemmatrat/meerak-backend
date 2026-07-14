# Tier 3 AI smoke — direct service ports (no Kong/Docker)
param(
  [string]$AiCore = "http://127.0.0.1:8100",
  [string]$Voice = "http://127.0.0.1:8090",
  [string]$Hermes = "http://127.0.0.1:8120",
  [string]$Storefront = "http://127.0.0.1:3000",
  [string]$AiKey = $env:AI_CORE_API_KEY
)

$ErrorActionPreference = "Continue"
$fail = 0

function Test-200($name, $method, $url, $body = $null, $headers = @{}) {
  try {
    $params = @{ Uri = $url; Method = $method; TimeoutSec = 30; UseBasicParsing = $true }
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
$hh = @{ "X-Hermes-Api-Key" = $AiKey }

Write-Host "=== Tier 3 AI direct smoke ===" -ForegroundColor Cyan

Test-200 "ai-core health" GET "$AiCore/health" $null $h
Test-200 "voice health" GET "$Voice/health"
Test-200 "hermes health" GET "$Hermes/health" $null $hh

Test-200 "jarvis concierge" POST "$AiCore/v1/jarvis/concierge" @{
  user_message = "หา matcha"
  session = @{ active_orders = @() }
} $h

Test-200 "onboard product rules" POST "$AiCore/v1/onboard/product" @{
  merchant_hint = "เสื้อยืด"
  llm_output = @{ title = "เสื้อยืดคอตตอน"; description = "นุ่มสบาย"; category = "fashion" }
} $h

Test-200 "hermes tool sla" POST "$Hermes/v1/tools/call" @{
  merchant_id = "demo-merchant"
  tool = "merchant_sla_hint"
  arguments = @{ urgent = $true }
} $hh

Test-200 "voice jarvis text" POST "$Voice/jarvis/text" @{
  session_id = "smoke"
  text = "หา matcha"
}

& "$PSScriptRoot/smoke-test-tier3-storefront.ps1" -Storefront $Storefront
if ($LASTEXITCODE -ne 0) { $fail += $LASTEXITCODE }

if ($fail -eq 0) {
  Write-Host "`nAll Tier 3 AI direct checks passed (200)." -ForegroundColor Green
  exit 0
}
Write-Host "`n$fail check(s) failed." -ForegroundColor Red
exit 1
