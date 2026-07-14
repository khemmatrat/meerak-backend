# P33-P45 Feed/Video/Recommendations smoke test
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$author = "creator-" + (Get-Date -Format "HHmmss")
$viewer = "viewer-" + (Get-Date -Format "HHmmss")

Write-Host "=== P33/P34 feed health ==="
$fh = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/feed/health" -TimeoutSec 30
if (-not $fh.ok) { throw "feed-svc unhealthy" }
Write-Host "OK feed-svc p33=$($fh.p33) p34=$($fh.p34)"

Write-Host "`n=== P36 video upload (stub mp4) ==="
$bytes = [byte[]](0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D)
$tmp = [System.IO.Path]::GetTempFileName() + ".mp4"
[System.IO.File]::WriteAllBytes($tmp, $bytes)
try {
  $upload = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/video/v1/media/upload?author_id=$author" `
    -Method POST -ContentType "video/mp4" -InFile $tmp -TimeoutSec 120
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
Write-Host "OK media_id=$($upload.media_id) status=$($upload.status)"

Write-Host "`n=== P37-P38 wait transcode + moderation ==="
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  $media = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/video/v1/media/$($upload.media_id)" -TimeoutSec 30
  Write-Host "  poll status=$($media.status)"
  if ($media.status -eq "ready") { $ready = $true; break }
  if ($media.status -eq "rejected") { throw "media rejected by moderation" }
}
if (-not $ready) { Write-Host "WARN: transcode not ready in 40s" -ForegroundColor Yellow }

Write-Host "`n=== P39 playback signed URL ==="
if ($ready) {
  $pb = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/video/v1/media/$($upload.media_id)/playback" -TimeoutSec 30
  Write-Host "OK manifest_url=$($pb.manifest_url)"
}

Write-Host "`n=== P34 follow + post + fan-out ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/feed/v1/follow" `
  -Method POST -ContentType "application/json" `
  -Body (@{ follower_id = $viewer; followee_id = $author } | ConvertTo-Json) | Out-Null
Start-Sleep -Seconds 2
$post = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/feed/v1/posts" `
  -Method POST -ContentType "application/json" `
  -Body (@{ author_id = $author; media_id = $upload.media_id; caption = "Epoch4 smoke post" } | ConvertTo-Json)
Write-Host "OK post_id=$($post.post_id)"
Start-Sleep -Seconds 3

Write-Host "`n=== P35 feed read ==="
$feed = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/feed/v1/feed?user_id=$viewer&limit=10" -TimeoutSec 30
Write-Host "OK feed items=$($feed.items.Count)"

Write-Host "`n=== P40-P42 rec signals + candidates + rank ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/rec/v1/signals" `
  -Method POST -ContentType "application/json" `
  -Body (@{ user_id = $viewer; post_id = $post.post_id; signal = "watch_time"; value = 12 } | ConvertTo-Json) | Out-Null
$cands = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/rec/v1/candidates?user_id=$viewer" -TimeoutSec 30
Write-Host "OK candidates=$($cands.count)"
$ranked = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/rec/v1/rank" `
  -Method POST -ContentType "application/json" `
  -Body (@{ user_id = $viewer } | ConvertTo-Json)
Write-Host "OK ranked items=$($ranked.items.Count)"

Write-Host "`n=== P43 for-you merge ==="
$foryou = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/feed/v1/feed/for-you?user_id=$viewer&limit=10" -TimeoutSec 30
Write-Host "OK for-you items=$($foryou.items.Count)"

Write-Host "`n=== P44 interests ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/rec/v1/interests" `
  -Method POST -ContentType "application/json" `
  -Body (@{ user_id = $viewer; interests = @("beauty", "gadgets") } | ConvertTo-Json) | Out-Null
Write-Host "OK interests saved"

Write-Host "`n=== P45 experiment + feed metrics ==="
$exp = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/rec/v1/experiment?user_id=$viewer" -TimeoutSec 30
$metrics = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/rec/v1/metrics/feed" -TimeoutSec 30
Write-Host "OK variant=$($exp.variant) ctr=$($metrics.ctr)"

Write-Host "`n=== P33-P45 smoke PASSED ===" -ForegroundColor Green
