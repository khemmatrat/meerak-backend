# Comprehensive Test Script
Write-Host "🧪 Testing MEERAK Backend..." -ForegroundColor Cyan
Write-Host ""

# Wait for server
Write-Host "⏳ Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Test 1: Health Check
Write-Host "1️⃣ Testing Health Check..." -ForegroundColor Green
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Health Check: PASSED" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health Check: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host ""

# Test 2: Profile Endpoint
Write-Host "2️⃣ Testing Profile Endpoint (demo-anna-id)..." -ForegroundColor Green
try {
    $profile = Invoke-RestMethod -Uri "http://localhost:3001/api/users/profile/demo-anna-id" -Method Get -ErrorAction Stop
    Write-Host "✅ Profile: PASSED" -ForegroundColor Green
    Write-Host "   Name: $($profile.name)" -ForegroundColor Gray
    Write-Host "   Email: $($profile.email)" -ForegroundColor Gray
    Write-Host "   Source: $($profile.source)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Profile: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""

# Test 3: Recommended Jobs
Write-Host "3️⃣ Testing Recommended Jobs..." -ForegroundColor Green
try {
    $jobs = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "✅ Recommended Jobs: PASSED" -ForegroundColor Green
    Write-Host "   Jobs found: $($jobs.Count)" -ForegroundColor Gray
    if ($jobs.Count -gt 0) {
        Write-Host "   First job: $($jobs[0].title)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Recommended Jobs: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Create Job
Write-Host "4️⃣ Testing Create Job..." -ForegroundColor Green
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
    Write-Host "✅ Create Job: PASSED" -ForegroundColor Green
    Write-Host "   Job ID: $($created.job.id)" -ForegroundColor Gray
    Write-Host "   Title: $($created.job.title)" -ForegroundColor Gray
    Write-Host "   Status: $($created.job.status)" -ForegroundColor Gray
    
    # Test 5: Check if new job appears in recommended
    Write-Host ""
    Write-Host "5️⃣ Checking if new job appears in recommended..." -ForegroundColor Green
    Start-Sleep -Seconds 2
    $jobsAfter = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    $found = $jobsAfter | Where-Object { $_.id -eq $created.job.id }
    if ($found) {
        Write-Host "✅✅✅ SUCCESS: New job found in recommended!" -ForegroundColor Green
        Write-Host "   Job ID: $($found.id)" -ForegroundColor Gray
        Write-Host "   Title: $($found.title)" -ForegroundColor Gray
    } else {
        Write-Host "❌ FAILED: New job NOT found in recommended" -ForegroundColor Red
        Write-Host "   Created job ID: $($created.job.id)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Create Job: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 All Tests Complete!" -ForegroundColor Cyan
