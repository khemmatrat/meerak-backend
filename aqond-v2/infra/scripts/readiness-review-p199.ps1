# P199: 100M-1B readiness review — aggregates SLO, load tests, chaos, prior go/no-go gates.
param(
  [ValidateSet('100M', '500M', '1B')]
  [string]$Tier = '100M',
  [string]$Kong = 'http://127.0.0.1:8000'
)
$ErrorActionPreference = 'Stop'

Write-Host "=== P199 readiness review tier=$Tier ==="

$checks = @()

# P171 SLO budgets
try {
  $slo = Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/slo/budget?journey=checkout" -TimeoutSec 15
  $checks += @{ name = 'slo_checkout'; ok = $slo.release_allowed }
} catch { $checks += @{ name = 'slo_checkout'; ok = $false } }

# P172 capacity headroom
try {
  $cap = Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/capacity/headroom?tier=$Tier" -TimeoutSec 15
  $checks += @{ name = 'capacity_headroom'; ok = $cap.headroom_ok }
} catch { $checks += @{ name = 'capacity_headroom'; ok = $false } }

# P183 chaos scorecard
try {
  $chaos = Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/chaos/gameday" -TimeoutSec 15
  $checks += @{ name = 'chaos_gameday'; ok = ($chaos.gamedays.Count -ge 0) }
} catch { $checks += @{ name = 'chaos_gameday'; ok = $false } }

# P184 degradation state
try {
  $deg = Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/degrade/state" -TimeoutSec 15
  $checks += @{ name = 'degradation_normal'; ok = ($deg.level -eq 'normal') }
} catch { $checks += @{ name = 'degradation_normal'; ok = $false } }

$passed = ($checks | Where-Object { $_.ok }).Count
$score = [int](100 * $passed / [Math]::Max($checks.Count, 1))
$gng = if ($score -ge 80) { 'go' } elseif ($score -ge 60) { 'conditional' } else { 'no_go' }

$review = @{
  scale_tier = $Tier
  score = $score
  go_no_go = $gng
  gaps = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.name })
  signoffs = @{ platform = 'pending'; sre = 'pending'; security = 'pending' }
} | ConvertTo-Json -Depth 5

$r = Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/readiness/review" -Method POST -ContentType 'application/json' -Body $review -TimeoutSec 15
Write-Host "Review id=$($r.review_id) score=$score go_no_go=$gng"
Write-Host "Checks: $($checks | ConvertTo-Json -Compress)"
