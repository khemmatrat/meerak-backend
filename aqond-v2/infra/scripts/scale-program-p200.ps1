# P200: schedule continuous scale program events (load/chaos/DR/SLO/capacity).
param([string]$Kong = 'http://127.0.0.1:8000')
$ErrorActionPreference = 'Stop'
$events = @(
  @{ event_type = 'load_test'; scheduled_for = (Get-Date).AddDays(7).ToString('yyyy-MM-dd') },
  @{ event_type = 'chaos'; scheduled_for = (Get-Date).AddDays(30).ToString('yyyy-MM-dd') },
  @{ event_type = 'dr_drill'; scheduled_for = (Get-Date).AddDays(90).ToString('yyyy-MM-dd') },
  @{ event_type = 'slo_review'; scheduled_for = (Get-Date).AddDays(7).ToString('yyyy-MM-dd') },
  @{ event_type = 'capacity_forecast'; scheduled_for = (Get-Date).AddDays(30).ToString('yyyy-MM-dd') }
)
foreach ($e in $events) {
  $body = $e | ConvertTo-Json
  Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/program/cadence" -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 10 | Out-Null
  Write-Host "Scheduled $($e.event_type) on $($e.scheduled_for)"
}
$cadence = Invoke-RestMethod -Uri "$Kong/api/v1/sre/v1/program/cadence" -TimeoutSec 10
Write-Host "Cadence: $($cadence.cadence | ConvertTo-Json -Compress)"
