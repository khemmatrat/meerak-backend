# Align Postgres SCRAM password with infra/.env (required after rotate-secrets or volume reuse).
# Local psql uses trust auth and does NOT validate the password — only Docker-network TCP does.
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

$container = docker ps --filter "name=aqond-v2-db" --format "{{.Names}}" 2>$null | Select-Object -First 1
if (-not $container) {
  Write-Host "aqond-v2-db not running — skip password sync (fresh init will use POSTGRES_PASSWORD)."
  exit 0
}

$escaped = $Pass -replace "'", "''"
$sql = "ALTER USER $User WITH PASSWORD '$escaped';"
Write-Host "Syncing Postgres SCRAM password for $User ..."
docker exec $container psql -U $User -d postgres -v ON_ERROR_STOP=1 -c $sql | Out-Null

docker exec -e "PGPASSWORD=$Pass" $container psql -h aqond-db -U $User -d postgres -c "SELECT 1" | Out-Null
Write-Host "OK — TCP auth matches infra/.env"
