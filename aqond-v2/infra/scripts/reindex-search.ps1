# Reindex search-svc after migrations (shop/food/product tabs)
param(
  [string]$Kong = "http://127.0.0.1:8000"
)
$ErrorActionPreference = "Stop"
Write-Host "POST $Kong/api/v1/search/v1/index/reindex" -ForegroundColor Cyan
$r = Invoke-RestMethod -Uri "$Kong/api/v1/search/v1/index/reindex" -Method POST -TimeoutSec 120
Write-Host "reindexed: $($r.reindexed) documents" -ForegroundColor Green
if ($r.count) { Write-Host "total in index: $($r.count)" }
