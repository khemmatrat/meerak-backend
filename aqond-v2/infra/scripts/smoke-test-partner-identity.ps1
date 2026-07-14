# Partner identity rollout — smoke checklist
# Run after deploy: powershell -File infra/scripts/smoke-test-partner-identity.ps1

Write-Host "=== Partner Identity Smoke ===" -ForegroundColor Cyan

$v2 = $env:STOREFRONT_URL
if (-not $v2) { $v2 = "http://127.0.0.1:3000" }

$checks = @(
  @{ Name = "v2 login page"; Url = "$v2/m/login" },
  @{ Name = "v2 register page"; Url = "$v2/m/register" },
  @{ Name = "v2 account hub"; Url = "$v2/m/account" },
  @{ Name = "v2 onboarding intent"; Url = "$v2/m/onboarding/intent" },
  @{ Name = "v2 auth handoff"; Url = "$v2/m/auth/handoff" }
)

$fail = 0
foreach ($c in $checks) {
  try {
    $r = Invoke-WebRequest -Uri $c.Url -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 15
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
      Write-Host "[OK] $($c.Name) ($($r.StatusCode))" -ForegroundColor Green
    } else {
      Write-Host "[FAIL] $($c.Name) status $($r.StatusCode)" -ForegroundColor Red
      $fail++
    }
  } catch {
    Write-Host "[FAIL] $($c.Name): $($_.Exception.Message)" -ForegroundColor Red
    $fail++
  }
}

# Copy markers in HTML
try {
  $login = (Invoke-WebRequest -Uri "$v2/m/login" -UseBasicParsing).Content
  if ($login -match "บัญชีเดียว") {
    Write-Host "[OK] login unified copy present" -ForegroundColor Green
  } else {
    Write-Host "[WARN] login missing unified copy" -ForegroundColor Yellow
  }
  $acct = (Invoke-WebRequest -Uri "$v2/m/account" -UseBasicParsing).Content
  if ($acct -match "คุณอยากทำอะไร") {
    Write-Host "[OK] account hub section present" -ForegroundColor Green
  } else {
    Write-Host "[WARN] account hub section missing" -ForegroundColor Yellow
  }
} catch {
  Write-Host "[WARN] copy check skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

if ($fail -gt 0) {
  Write-Host "`n$fail check(s) failed" -ForegroundColor Red
  exit 1
}

$Kong = $env:KONG_URL
if (-not $Kong) { $Kong = "http://127.0.0.1:8000" }
try {
  $r = Invoke-WebRequest -Uri "$Kong/api/v2/merchant/v1/mobile/shell" -UseBasicParsing -TimeoutSec 10
  if ($r.StatusCode -eq 200) {
    Write-Host "[OK] Kong v2 merchant mobile/shell" -ForegroundColor Green
  }
} catch {
  Write-Host "[WARN] Kong v2 merchant (Kong may be down): $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`nAll route checks passed" -ForegroundColor Green
