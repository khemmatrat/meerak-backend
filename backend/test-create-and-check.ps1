# Test Create Job and Check Recommended
Write-Host "🧪 Testing Create Job and Recommended Jobs..." -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Seconds 8

# Step 1: Get current recommended jobs count
Write-Host "1️⃣ Getting current recommended jobs..." -ForegroundColor Yellow
try {
    $jobsBefore = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "   Found $($jobsBefore.Count) jobs before creating" -ForegroundColor Gray
    if ($jobsBefore.Count -gt 0) {
        Write-Host "   Latest job: $($jobsBefore[0].id) - $($jobsBefore[0].title)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 2: Create a new job
Write-Host "2️⃣ Creating new job..." -ForegroundColor Yellow
$testJob = @{
    title = "New Test Job $(Get-Date -Format 'HH:mm:ss')"
    description = "This is a test job to verify it appears in recommended"
    category = "Delivery"
    price = 750
    location = @{
        lat = 13.736717
        lng = 100.523186
    }
    createdBy = "test-user"
} | ConvertTo-Json

try {
    $created = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs" -Method Post -Body $testJob -ContentType "application/json" -ErrorAction Stop
    Write-Host "✅ Job created successfully!" -ForegroundColor Green
    Write-Host "   Job ID: $($created.job.id)" -ForegroundColor Gray
    Write-Host "   Title: $($created.job.title)" -ForegroundColor Gray
    Write-Host "   Status: $($created.job.status)" -ForegroundColor Gray
    Write-Host "   Created at: $($created.job.created_at)" -ForegroundColor Gray
    
    $newJobId = $created.job.id
    
    Write-Host ""
    Write-Host "3️⃣ Waiting 3 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    
    # Step 3: Check recommended jobs again
    Write-Host "4️⃣ Checking recommended jobs again..." -ForegroundColor Yellow
    $jobsAfter = Invoke-RestMethod -Uri "http://localhost:3001/api/jobs/recommended" -Method Get -ErrorAction Stop
    Write-Host "   Found $($jobsAfter.Count) jobs after creating" -ForegroundColor Gray
    
    # Check if new job is in the list
    $found = $jobsAfter | Where-Object { $_.id -eq $newJobId }
    if ($found) {
        Write-Host ""
        Write-Host "✅✅✅ SUCCESS: New job found in recommended!" -ForegroundColor Green
        Write-Host "   Position: #$($jobsAfter.IndexOf($found) + 1)" -ForegroundColor Gray
        Write-Host "   Job ID: $($found.id)" -ForegroundColor Gray
        Write-Host "   Title: $($found.title)" -ForegroundColor Gray
        Write-Host "   Status: $($found.status)" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "❌ FAILED: New job NOT found in recommended" -ForegroundColor Red
        Write-Host "   Created job ID: $newJobId" -ForegroundColor Yellow
        Write-Host "   First 5 job IDs in recommended:" -ForegroundColor Yellow
        $jobsAfter | Select-Object -First 5 | ForEach-Object { 
            Write-Host "     - $($_.id) (created: $($_.created_at))" -ForegroundColor Gray 
        }
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
