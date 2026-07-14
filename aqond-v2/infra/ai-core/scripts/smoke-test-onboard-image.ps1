# P3/P8 end-to-end: multipart image -> Hermes vision -> Bagisto sync + audit log
param(
  [string]$ImagePath = "",
  [int]$TimeoutSec = 600
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Fixtures = Join-Path $Root "fixtures"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$Kong = if ($env:KONG_PROXY_PORT) { $env:KONG_PROXY_PORT } else { "8000" }
$AiKey = if ($env:AI_CORE_API_KEY) { $env:AI_CORE_API_KEY } else { "CHANGE_ME_ai_core_key" }

function Ensure-TestImage {
  param([string]$Path)
  if (Test-Path $Path) { return $Path }
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap 480, 480
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 245, 245, 250))
  $g.FillRectangle([System.Drawing.Brushes]::DodgerBlue, 140, 80, 200, 220)
  $font = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
  $g.DrawString("Cotton T-Shirt", $font, [System.Drawing.Brushes]::Black, 90, 330)
  $g.DrawString("199 THB", (New-Object System.Drawing.Font("Arial", 28)), [System.Drawing.Brushes]::DarkGreen, 150, 380)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Host "Created fixture: $Path"
  return $Path
}

$image = if ($ImagePath) { $ImagePath } else { Ensure-TestImage (Join-Path $Fixtures "test-product.jpg") }
if (-not (Test-Path $image)) { throw "Image not found: $image" }

Write-Host "=== 1. ai-core health ==="
$health = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/ai/health" `
  -Headers @{ "X-AI-Core-Api-Key" = $AiKey }
$health | ConvertTo-Json -Depth 5
if (-not $health.ollama.ok) {
  Write-Warning "Ollama not ready - run: .\infra\ai-core\scripts\pull-models.ps1"
}

Write-Host "`n=== 2. multipart image onboard (may take 1-5 min on CPU) ==="
$idempotency = "smoke-image-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$uri = "http://127.0.0.1:${Kong}/api/v1/cms/ai/onboard"
$started = Get-Date

$curlOut = curl.exe -s -w 'HTTP_CODE:%{http_code}' -X POST $uri `
  -H "Idempotency-Key: $idempotency" `
  -F "merchant_hint=cotton vintage shop, price around 199 THB" `
  -F "images=@$image;type=image/jpeg" `
  --max-time $TimeoutSec

$elapsed = ((Get-Date) - $started).TotalSeconds
if ($curlOut -match 'HTTP_CODE:(\d+)$') {
  $code = [int]$Matches[1]
  $json = ($curlOut -replace 'HTTP_CODE:\d+$', '').Trim()
} else {
  Write-Host "Raw curl output: $curlOut"
  throw "Could not parse HTTP status from curl"
}

Write-Host "HTTP $code in $([math]::Round($elapsed, 1))s"
if ($code -lt 200 -or $code -ge 300) {
  Write-Error "Onboard failed: $json"
  exit 1
}

$result = $json | ConvertFrom-Json
Write-Host "Product: $($result.product.title) | $($result.product.price) THB | $($result.product.category)"
if ($result.ai.latency_ms) { Write-Host "AI latency_ms: $($result.ai.latency_ms)" }

Write-Host "`n=== 3. audit log (ai.inference_log) ==="
& (Join-Path $Root "infra\scripts\query-inference-log.ps1") -Limit 3 -Task onboard_product

Write-Host "`n=== 4. audit via API ==="
$audit = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/ai/v1/audit/recent?limit=3&task=onboard_product" `
  -Headers @{ "X-AI-Core-Api-Key" = $AiKey }
$audit.entries | ForEach-Object {
  Write-Host "[$($_.created_at)] success=$($_.success) latency=$($_.latency_ms)ms title=$($_.metadata.title)"
}

Write-Host "`nSmoke test (image onboard) complete."
Write-Host "Upload UI: http://127.0.0.1:${Kong}/api/v1/cms/onboard"
