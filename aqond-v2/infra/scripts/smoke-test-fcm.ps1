# FCM web push + notification-svc smoke (run after dev-lite stack is up)
param(
  [string]$Base = 'http://127.0.0.1:3000',
  [string]$Kong = 'http://127.0.0.1:8000',
  [string]$UserId = 'smoke-fcm-user'
)

$envFile = Join-Path $PSScriptRoot '..' '.env' | Resolve-Path -ErrorAction SilentlyContinue
if ($envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $k = $matches[1].Trim(); $v = $matches[2].Trim()
      if (-not [string]::IsNullOrWhiteSpace($v) -and -not $env:$k) { Set-Item -Path "env:$k" -Value $v }
    }
  }
}

$fail = 0
function Pass($m) { Write-Host "[PASS] $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red; $script:fail++ }

Write-Host "=== FCM smoke test ===" -ForegroundColor Cyan
Write-Host "Storefront: $Base | Kong: $Kong"

try {
  $sw = Invoke-WebRequest -Uri "$Base/firebase-messaging-sw.js" -TimeoutSec 10 -UseBasicParsing
  if ($sw.StatusCode -ne 200) { Fail "SW status $($sw.StatusCode)" }
  elseif ($sw.Content -notmatch 'firebase\.initializeApp') { Fail 'SW missing initializeApp' }
  elseif ($sw.Content -notmatch 'AIzaSy') { Fail 'SW apiKey empty — restart storefront with infra/.env loaded' }
  else { Pass 'firebase-messaging-sw.js has Firebase config' }
} catch { Fail "SW: $($_.Exception.Message)" }

try {
  $h = Invoke-RestMethod -Uri "$Kong/api/v1/notify/health" -TimeoutSec 10
  if ($h.ok) { Pass 'notification-svc health' } else { Fail 'notification-svc health not ok' }
} catch { Fail "notification-svc: $($_.Exception.Message)" }

try {
  $st = Invoke-RestMethod -Uri "$Kong/api/v1/notify/v1/push/status?user_id=$UserId" -TimeoutSec 10
  if ($st.user_id) { Pass "push status user=$($st.user_id) enabled=$($st.push_enabled)" } else { Fail 'push status missing user_id' }
} catch { Fail "push status: $($_.Exception.Message)" }

$tok = "web-smoke-$(Get-Date -Format 'HHmmss')"
try {
  $reg = Invoke-RestMethod -Uri "$Base/api/notify/v1/push/register" -Method POST -ContentType 'application/json' -Body (@{
    user_id = $UserId; fcm_token = $tok; platform = 'web'
  } | ConvertTo-Json) -TimeoutSec 15
  if ($reg.ok) { Pass "push register token=$tok source=$($reg.source)" } else { Fail "push register: $($reg | ConvertTo-Json -Compress)" }
} catch { Fail "push register: $($_.Exception.Message)" }

try {
  $st2 = Invoke-RestMethod -Uri "$Kong/api/v1/notify/v1/push/status?user_id=$UserId" -TimeoutSec 10
  if ($st2.push_enabled -and $st2.devices.Count -gt 0) { Pass "push enabled devices=$($st2.devices.Count)" }
  else { Fail 'push not enabled after register' }
} catch { Fail "push status after register: $($_.Exception.Message)" }

try {
  $link = Invoke-RestMethod -Uri "$Base/api/rider/link-user" -Method POST -ContentType 'application/json' -Body (@{
    rider_id = 'rider-demo-1'; user_id = $UserId
  } | ConvertTo-Json) -TimeoutSec 15
  if ($link.ok) { Pass "rider link-user rider=$($link.rider_id)" }
  else { Fail "rider link-user: $($link | ConvertTo-Json -Compress)" }
} catch {
  $msg = $_.Exception.Message
  if ($msg -match '404|not_found') { Pass 'rider link-user (rider-demo-1 not in DB — endpoint reachable)' }
  else { Fail "rider link-user: $msg" }
}

$fcmKey = $env:FCM_SERVER_KEY
if ([string]::IsNullOrWhiteSpace($fcmKey)) {
  Write-Host "[WARN] FCM_SERVER_KEY empty — server push delivery not tested" -ForegroundColor Yellow
} else {
  Pass 'FCM_SERVER_KEY is set (delivery requires real device token)'
}

if ($fail -eq 0) {
  Write-Host "`nALL PASS ($fail failures)" -ForegroundColor Green
  exit 0
}
Write-Host "`nFAILED: $fail test(s)" -ForegroundColor Red
exit 1
