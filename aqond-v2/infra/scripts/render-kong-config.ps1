# Sync Kong declarative config secrets + CORS + multi-cloud upstreams from infra/.env
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$KongFile = Join-Path $Root "gateway\kong.yml"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$yaml = Get-Content $KongFile -Raw

$meerakJwt = $env:MEERAK_JWT_SECRET
if (-not $meerakJwt) { $meerakJwt = $env:KONG_JWT_SECRET }
if (-not $meerakJwt) { $meerakJwt = 'dev-meerak-jwt-change-in-prod' }

$replacements = @{
  'secret: "dev-jwt-secret-change-in-prod"' = "secret: `"$($env:KONG_JWT_SECRET)`""
  'secret: "MEERAK_JWT_SECRET_PLACEHOLDER"'  = "secret: `"$meerakJwt`""
  'key: CHANGE_ME_escrow_internal_key'       = "key: $($env:ESCROW_API_KEY)"
  'key: CHANGE_ME_ai_core_key'             = "key: $($env:AI_CORE_API_KEY)"
  'key: CHANGE_ME_cms_api_key'             = "key: $($env:CMS_API_KEY)"
  'key: CHANGE_ME_merchant_sync_key'       = "key: $($env:BAGISTO_WEBHOOK_SECRET)"
  'key: CHANGE_ME_live_merchant_key'       = "key: $($env:LIVE_MERCHANT_API_KEY)"
  'key: CHANGE_ME_analytics_key'           = "key: $($env:ANALYTICS_API_KEY)"
  'key: CHANGE_ME_notify_key'              = "key: $($env:NOTIFY_API_KEY)"
}

foreach ($pair in $replacements.GetEnumerator()) {
  if ($pair.Value -match "CHANGE_ME|\`$env:") { continue }
  $yaml = $yaml.Replace($pair.Key, $pair.Value)
}

function Normalize-DockerUpstream([string] $Url) {
  if (-not $Url) { return $null }
  $u = $Url.Trim().TrimEnd('/')
  if ($u -match '127\.0\.0\.1|localhost') {
    $u = $u -replace '127\.0\.0\.1|localhost', 'host.docker.internal'
  }
  return $u
}

$cloud2 = $env:CLOUD2_BACKEND_URL
if (-not $cloud2) { $cloud2 = $env:MEERAK_BACKEND_URL }
if (-not $cloud2) { $cloud2 = "http://host.docker.internal:3001" }
$cloud2 = Normalize-DockerUpstream $cloud2
$yaml = $yaml.Replace("CLOUD2_BACKEND_UPSTREAM_URL", $cloud2)
Write-Host "Kong Cloud2 legacy upstream: $cloud2" -ForegroundColor DarkGray

if ($env:CLOUD3_V2_URL) {
  Write-Host "CLOUD3_V2_URL=$($env:CLOUD3_V2_URL) (v2 services use Docker network names in compose)" -ForegroundColor DarkGray
}
if ($env:KONG_INTERNAL_URL) {
  Write-Host "KONG_INTERNAL_URL=$($env:KONG_INTERNAL_URL) (BFF ads loopback)" -ForegroundColor DarkGray
}

$corsOrigins = $env:KONG_CORS_ORIGINS
if ($corsOrigins) {
  $originLines = ($corsOrigins -split ',').ForEach({ "        - $($_.Trim())" }) -join "`n"
  $yaml = $yaml -replace '(?ms)(  - name: cors\r?\n    config:\r?\n      origins:\r?\n)        - "\*"', "`${1}$originLines"
}

Set-Content -Path $KongFile -Value $yaml -NoNewline
Write-Host "Updated gateway/kong.yml from infra/.env"
Write-Host "Restart Kong: docker compose --profile dev-lite --env-file infra/.env restart kong"
