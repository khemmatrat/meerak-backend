# Publish rider.approved to shared Redis (Cloud 2 → Cloud 3 dispatch bridge)
param(
  [string]$UserId = "rider-demo-1",
  [string]$Name = "Rider Demo",
  [string]$Phone = "0812345678"
)

$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $Root "infra\.env"
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
}

$json = @{
  user_id = $UserId
  approved = $true
  display_name = $Name
  phone = $Phone
  vehicle = "motorcycle"
  plate = "1กก1234"
} | ConvertTo-Json -Compress

$key = "rider.approved:$UserId"
docker compose --env-file $envFile --profile dev-lite exec -T aqond-redis redis-cli SET $key $json | Out-Null
Write-Host "Published $key" -ForegroundColor Green
Write-Host $json
