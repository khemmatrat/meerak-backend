# Test Backend Server Script
Write-Host "🧪 Testing MEERAK Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Wait for server to start
Write-Host "⏳ Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test Health Check
Write-Host "1️⃣ Testing Health Check..." -ForegroundColor Green
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Health Check: PASSED" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    Write-Host "   Database: $($health.database)" -ForegroundColor Gray
    Write-Host "   Redis: $($health.redis)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health Check: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test API Info
Write-Host "2️⃣ Testing API Info..." -ForegroundColor Green
try {
    $api = Invoke-RestMethod -Uri "http://localhost:3001/api" -Method Get -ErrorAction Stop
    Write-Host "✅ API Info: PASSED" -ForegroundColor Green
    Write-Host "   Message: $($api.message)" -ForegroundColor Gray
    Write-Host "   Endpoints:" -ForegroundColor Gray
    foreach ($endpoint in $api.endpoints.PSObject.Properties) {
        Write-Host "     - $($endpoint.Name): $($endpoint.Value)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ API Info: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test Recommended Jobs (without auth)
Write-Host "3️⃣ Testing Recommended Jobs (no auth)..." -ForegroundColor Green
try {
    $jobs = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "✅ Recommended Jobs: PASSED" -ForegroundColor Green
    Write-Host "   Jobs returned: $($jobs.Count)" -ForegroundColor Gray
    if ($jobs.Count -gt 0) {
        Write-Host "   First job: $($jobs[0].title)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Recommended Jobs: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test All Jobs
Write-Host "4️⃣ Testing All Jobs..." -ForegroundColor Green
try {
    $allJobs = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/all" -Method Get -ErrorAction Stop
    Write-Host "✅ All Jobs: PASSED" -ForegroundColor Green
    Write-Host "   Jobs returned: $($allJobs.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ All Jobs: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test User Profile (without auth - should work with optional auth)
Write-Host "5️⃣ Testing User Profile (optional auth)..." -ForegroundColor Green
try {
    $profile = Invoke-RestMethod -Uri "http://localhost:3001/api/users/profile/RwCdeFaFMmtjP16BFuZy" -Method Get -ErrorAction Stop
    Write-Host "✅ User Profile: PASSED" -ForegroundColor Green
    Write-Host "   User ID: $($profile.id)" -ForegroundColor Gray
    Write-Host "   Email: $($profile.email)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️ User Profile: May need authentication" -ForegroundColor Yellow
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 Testing Complete!" -ForegroundColor Cyan
