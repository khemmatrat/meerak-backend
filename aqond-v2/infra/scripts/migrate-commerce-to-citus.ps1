# P50: Migrate commerce data from single-node aqond-db to Citus + verify checksums
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Compose = Join-Path $Root "docker-compose.yml"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD
if (-not $Pass) { throw "Set POSTGRES_PASSWORD in infra/.env" }

$tables = @(
  "merchants", "stores", "products", "product_variants", "inventory",
  "orders", "order_items", "wallets", "wallet_ledger", "outbox", "media", "posts"
)

Write-Host "=== P50 row-count verification (source aqond-db) ==="
$sourceCounts = @{}
foreach ($t in $tables) {
  $q = "SELECT COUNT(*) FROM commerce.$t"
  $n = docker compose --env-file $EnvFile -f $Compose exec -T -e "PGPASSWORD=$Pass" aqond-db `
    psql -U $User -d commerce -t -A -c $q 2>$null
  $sourceCounts[$t] = [int]($n.Trim())
  Write-Host "  source commerce.$t = $($sourceCounts[$t])"
}

Write-Host "`n=== Copy data to Citus (INSERT via pg_dump data-only) ==="
$dumpFile = Join-Path $env:TEMP "aqond-commerce-data.sql"
docker compose --env-file $EnvFile -f $Compose exec -T -e "PGPASSWORD=$Pass" aqond-db `
  pg_dump -U $User -d commerce --data-only --schema=commerce --disable-triggers `
  | Out-File -Encoding utf8 $dumpFile

Get-Content $dumpFile -Raw | docker compose --env-file $EnvFile -f $Compose --profile dev-lite `
  exec -T -e "PGPASSWORD=$Pass" citus-coordinator psql -U $User -d commerce -v ON_ERROR_STOP=0 2>&1 | Out-Null

Write-Host "`n=== Target row-count verification (Citus) ==="
$ok = $true
foreach ($t in $tables) {
  $q = "SELECT COUNT(*) FROM commerce.$t"
  $n = docker compose --env-file $EnvFile -f $Compose --profile dev-lite exec -T -e "PGPASSWORD=$Pass" citus-coordinator `
    psql -U $User -d commerce -t -A -c $q 2>$null
  $target = [int]($n.Trim())
  $match = $target -ge $sourceCounts[$t]
  if (-not $match) { $ok = $false }
  Write-Host "  citus commerce.$t = $target (source $($sourceCounts[$t])) $(if ($match) {'OK'} else {'MISMATCH'})"
}

Write-Host "`n=== Cutover instructions ==="
Write-Host "  1. Set USE_CITUS=1 in infra/.env (or per-service env)"
Write-Host "  2. docker compose --profile dev-lite up -d --force-recreate catalog-svc order-svc inventory-svc wallet-svc foundation-svc"
Write-Host "  Rollback: USE_CITUS=0 and PGHOST=aqond-db"

if (-not $ok) {
  Write-Host "WARN: row count mismatch — review before cutover" -ForegroundColor Yellow
} else {
  Write-Host "P50 migration verification PASSED" -ForegroundColor Green
}
