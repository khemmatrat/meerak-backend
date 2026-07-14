# Create multi-DB if init script failed (Windows CRLF recovery)
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
$dbs = @("kong", "bagisto", "strapi", "odoo", "n8n", "escrow", "analytics", "ai", "commerce")

foreach ($db in $dbs) {
  Write-Host "Ensuring database: $db"
  $sql = @"
SELECT 'CREATE DATABASE $db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
"@
  $sql | docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") `
    exec -T -e "PGPASSWORD=$Pass" aqond-db psql -U $User -d postgres -v ON_ERROR_STOP=1
}

Write-Host "Databases ready."
