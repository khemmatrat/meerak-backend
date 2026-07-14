# Generate strong secrets into infra/.env (backs up existing file)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Backup = "$EnvFile.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"

if (-not (Test-Path $EnvFile)) {
  Copy-Item (Join-Path $Root "infra\.env.example") $EnvFile
}

Copy-Item $EnvFile $Backup
Write-Host "Backup: $Backup"

function New-Secret([int]$Bytes = 32) {
  $b = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b).TrimEnd('=') -replace '\+','-' -replace '/','_'
}

$updates = @{
  POSTGRES_PASSWORD      = New-Secret 32
  KONG_JWT_SECRET        = New-Secret 32
  BAGISTO_WEBHOOK_SECRET = New-Secret 24
  ESCROW_API_KEY         = New-Secret 24
  AI_CORE_API_KEY        = New-Secret 24
  ANALYTICS_API_KEY      = New-Secret 24
  NOTIFY_API_KEY         = New-Secret 24
  CMS_API_KEY            = New-Secret 24
  LIVE_MERCHANT_API_KEY  = New-Secret 24
  MINIO_ROOT_PASSWORD    = New-Secret 24
  LIVEKIT_API_SECRET     = New-Secret 32
  LIVEKIT_API_KEY        = "aqondprod"
  N8N_ENCRYPTION_KEY     = New-Secret 32
  MYSQL_ROOT_PASSWORD    = New-Secret 24
  MYSQL_PASSWORD         = New-Secret 24
}

$content = Get-Content $EnvFile -Raw
foreach ($key in $updates.Keys) {
  $val = $updates[$key]
  if ($content -match "(?m)^$key=.*$") {
    $content = $content -replace "(?m)^$key=.*$", "$key=$val"
  } else {
    $content += "`n$key=$val"
  }
}

if ($content -notmatch "(?m)^AQOND_ENV=") {
  $content += "`nAQOND_ENV=production"
} else {
  $content = $content -replace "(?m)^AQOND_ENV=.*$", "AQOND_ENV=production"
}

$content = $content -replace "(?m)^ANALYTICS_PUBLIC_INGEST=.*$", "ANALYTICS_PUBLIC_INGEST=0"

if ($content -notmatch "(?m)^KONG_CORS_ORIGINS=") {
  $content += "`nKONG_CORS_ORIGINS=http://localhost:8000"
}

Set-Content -Path $EnvFile -Value $content.TrimEnd() -NoNewline

$livekitYaml = Join-Path $Root "live\livekit.yaml"
$lkKey = $updates["LIVEKIT_API_KEY"]
$lkSecret = $updates["LIVEKIT_API_SECRET"]
if (Test-Path $livekitYaml) {
  $yaml = @"
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50050
  use_external_ip: false
keys:
  ${lkKey}: ${lkSecret}
logging:
  level: info
"@
  Set-Content -Path $livekitYaml -Value $yaml -NoNewline
  Write-Host "Updated live/livekit.yaml keys ($lkKey)"
}

Write-Host "Updated secrets in infra/.env (AQOND_ENV=production, ANALYTICS_PUBLIC_INGEST=0)"
Write-Host "Next: pwsh infra/scripts/render-kong-config.ps1"
Write-Host "Then: pwsh infra/scripts/sync-postgres-password.ps1"
Write-Host "      docker compose --env-file infra/.env up -d --force-recreate"
