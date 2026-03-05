# Test Job Creation and Retrieval
Write-Host "🧪 Testing Job Creation and Retrieval..." -ForegroundColor Cyan
Write-Host ""

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
    Write-Host "1️⃣ Creating job..." -ForegroundColor Yellow
    $created = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs" -Method Post -Body $testJob -ContentType "application/json" -ErrorAction Stop
    Write-Host "✅ Job created: $($created.job.id)" -ForegroundColor Green
    Write-Host "   Title: $($created.job.title)" -ForegroundColor Gray
    Write-Host "   Status: $($created.job.status)" -ForegroundColor Gray
    
    Write-Host ""
    Write-Host "2️⃣ Waiting 2 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    
    Write-Host "3️⃣ Fetching recommended jobs..." -ForegroundColor Yellow
    $jobs = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "✅ Found $($jobs.Count) jobs in recommended" -ForegroundColor Green
    
    $found = $jobs | Where-Object { $_.id -eq $created.job.id }
    if ($found) {
        Write-Host "✅ SUCCESS: New job found in recommended!" -ForegroundColor Green
        Write-Host "   Job ID: $($found.id)" -ForegroundColor Gray
        Write-Host "   Title: $($found.title)" -ForegroundColor Gray
    } else {
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
