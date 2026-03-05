# Simple Test Script
Write-Host "Testing server..." -ForegroundColor Cyan

Start-Sleep -Seconds 10

# Test health
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get -ErrorAction Stop
    Write-Host "Server is ready!" -ForegroundColor Green
} catch {
    Write-Host "Server not ready: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Test job creation
$testJob = @{
    title = "Test Job"
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
    Write-Host "Creating job..." -ForegroundColor Yellow
    $created = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs" -Method Post -Body $testJob -ContentType "application/json" -ErrorAction Stop
    Write-Host "Job created: $($created.job.id)" -ForegroundColor Green
    
    Start-Sleep -Seconds 2
    
    Write-Host "Fetching recommended jobs..." -ForegroundColor Yellow
    $jobs = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "Found $($jobs.Count) jobs" -ForegroundColor Green
    
    $found = $jobs | Where-Object { $_.id -eq $created.job.id }
    if ($found) {
        Write-Host "SUCCESS: New job found in recommended!" -ForegroundColor Green
    } else {
        Write-Host "FAILED: New job NOT found" -ForegroundColor Red
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
