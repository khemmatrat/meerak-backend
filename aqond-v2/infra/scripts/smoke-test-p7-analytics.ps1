# P7 smoke: ingest events → SQL rank → CrewAI re-rank
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$key = $env:ANALYTICS_API_KEY
$hdr = @{ "Content-Type" = "application/json" }
if ($key) { $hdr["X-Analytics-Api-Key"] = $key }

Write-Host "=== 1. analytics health ==="
$health = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/analytics/health"
Write-Host "ok=$($health.ok) crew=$($health.p7.crew_rerank)"

$stream = "live-p7-smoke-$(Get-Date -Format 'HHmmss')"
$product = "p7-prod-$(Get-Date -Format 'HHmmss')"

Write-Host "`n=== 2. ingest sample events ==="
@(
  @{ stream_id = $stream; merchant_id = "p7-merchant"; product_id = $product; event_type = "live_join"; session_id = "s1" }
  @{ stream_id = $stream; merchant_id = "p7-merchant"; product_id = $product; event_type = "f_code_view"; session_id = "s1" }
  @{ stream_id = $stream; merchant_id = "p7-merchant"; product_id = $product; event_type = "purchase"; session_id = "s1" }
  @{ stream_id = "shop"; product_id = $product; event_type = "impression"; session_id = "s2" }
) | ForEach-Object {
  Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/analytics/events" -Method POST -Headers $hdr -Body ($_ | ConvertTo-Json) | Out-Null
}

Write-Host "`n=== 3. live directory (SQL) ==="
$dir = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/analytics/live/directory"
Write-Host "live_streams=$($dir.live_streams.Count)"

Write-Host "`n=== 4. Crew re-rank ==="
$rank = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/analytics/rerank" `
  -Method POST -Headers $hdr `
  -Body (@{ entity_type = "live"; limit = 5 } | ConvertTo-Json)
if (-not $rank.ranked.Count) { throw "No ranked results" }
Write-Host "Top: $($rank.ranked[0].id) score=$($rank.ranked[0].score) source=$($rank.source)"

Write-Host "`nP7 smoke complete."
Write-Host "Dashboard: http://127.0.0.1:${Kong}/api/v1/analytics/dashboard"
