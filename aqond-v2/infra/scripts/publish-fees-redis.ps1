#Requires -Version 5.1
<#
  Publish platform fees to Redis (simulates nexus-admin → backend → Cloud 3).

  pwsh -File infra/scripts/publish-fees-redis.ps1
  pwsh -File infra/scripts/publish-fees-redis.ps1 -PlatformFeeBps 300
#>
param(
  [int] $PlatformFeeBps = 250,
  [int] $FoodFeeBps = 150,
  [int] $MarketplaceFeeBps = 250
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $Root 'infra\.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
}

$json = @{
  platform_fee_bps = $PlatformFeeBps
  food_fee_bps = $FoodFeeBps
  marketplace_fee_bps = $MarketplaceFeeBps
  currency = 'THB'
  updated_at = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json -Compress

docker compose --profile dev-lite --env-file $envFile exec -T aqond-redis redis-cli SET aqond:config:fees $json | Out-Null
Write-Host "Published aqond:config:fees → $json" -ForegroundColor Green
