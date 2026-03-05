# Restart and Test Backend Server
Write-Host "🔄 Restarting Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Stop existing processes
Write-Host "1️⃣ Stopping existing Node processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "✅ Stopped" -ForegroundColor Green
Write-Host ""

# Start server in background
Write-Host "2️⃣ Starting server..." -ForegroundColor Yellow
$job = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    node server.js
}
Write-Host "✅ Server starting in background (Job ID: $($job.Id))" -ForegroundColor Green
Write-Host ""

# Wait for server to be ready
Write-Host "3️⃣ Waiting for server to be ready..." -ForegroundColor Yellow
$maxWait = 15
$waited = 0
$ready = $false

while ($waited -lt $maxWait -and -not $ready) {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get -ErrorAction Stop -TimeoutSec 2
        $ready = $true
        Write-Host "✅ Server is ready! (waited $waited seconds)" -ForegroundColor Green
        Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    } catch {
        $msg = "   Still waiting... ($waited" + " of $maxWait seconds)"
        Write-Host $msg -ForegroundColor Gray
    }
}

if (-not $ready) {
    Write-Host "❌ Server did not start in time" -ForegroundColor Red
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue
    exit 1
}

Write-Host ""

# Test job creation
Write-Host "4️⃣ Testing job creation..." -ForegroundColor Yellow
$testJob = @{
    title = "Test Job $(Get-Date -Format 'HH:mm:ss')"
    description = "Test Description"
    category = "Delivery"
    price = 500
    location = @{
        lat = 13.736717
        lng = 100.523186
    }
    createdBy = "test-user"
} | ConvertTo-Json

try {
    $created = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs" -Method Post -Body $testJob -ContentType "application/json" -ErrorAction Stop
    Write-Host "✅ Job created: $($created.job.id)" -ForegroundColor Green
    Write-Host "   Title: $($created.job.title)" -ForegroundColor Gray
    Write-Host "   Status: $($created.job.status)" -ForegroundColor Gray
    
    Write-Host ""
    Write-Host "5️⃣ Waiting 2 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    
    Write-Host "6️⃣ Fetching recommended jobs..." -ForegroundColor Yellow
    $jobs = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "✅ Found $($jobs.Count) jobs in recommended" -ForegroundColor Green
    
    $found = $jobs | Where-Object { $_.id -eq $created.job.id }
    if ($found) {
        Write-Host ""
        Write-Host "✅✅✅ SUCCESS: New job found in recommended!" -ForegroundColor Green
        Write-Host "   Job ID: $($found.id)" -ForegroundColor Gray
        Write-Host "   Title: $($found.title)" -ForegroundColor Gray
        Write-Host "   Category: $($found.category)" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "❌ FAILED: New job NOT found in recommended" -ForegroundColor Red
        Write-Host "   Created job ID: $($created.job.id)" -ForegroundColor Yellow
        Write-Host "   First 3 job IDs in recommended:" -ForegroundColor Yellow
        $jobs | Select-Object -First 3 | ForEach-Object { Write-Host "     - $($_.id)" -ForegroundColor Gray }
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 Test Complete!" -ForegroundColor Cyan
Write-Host ""
$jobId = $job.Id
Write-Host "Note: Server is running in background job. To stop it:" -ForegroundColor Yellow
$stopCmd = "  Stop-Job " + $jobId + "; Remove-Job " + $jobId
Write-Host $stopCmd -ForegroundColor Gray
