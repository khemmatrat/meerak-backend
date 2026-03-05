# Test with error details
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
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/jobs" -Method Post -Body $testJob -ContentType "application/json" -ErrorAction Stop
    Write-Host "Success: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Red
    }
}
