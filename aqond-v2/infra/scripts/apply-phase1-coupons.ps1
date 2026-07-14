# One-off: apply 023_phase1_coupons.sql
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD
if (-not $Pass) { throw "Set POSTGRES_PASSWORD in infra/.env" }

$File = Join-Path $Root "infra\postgres\migrations\024_phase1_coupons.sql"
Write-Host "=== commerce database (phase1 coupons) ==="
Write-Host "  -> $(Split-Path $File -Leaf) on commerce"
$out = Get-Content $File -Raw | docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") `
  exec -T -e "PGPASSWORD=$Pass" aqond-db psql -U $User -d commerce -v ON_ERROR_STOP=1 2>&1
if ($LASTEXITCODE -ne 0) {
  $out | Write-Host
  throw "Migration failed"
}
$out | Write-Host
Write-Host "OK: 024_phase1_coupons.sql applied" -ForegroundColor Green

docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") `
  exec -T -e "PGPASSWORD=$Pass" aqond-db psql -U $User -d commerce -c `
  "SELECT code, kind, value_bps, value_micro, min_subtotal_micro, active FROM commerce.coupons WHERE code IN ('AQOND50','FOOD10','WELCOME','TRUEMONEY','FREESHIP') ORDER BY code;"
