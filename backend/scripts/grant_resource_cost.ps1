# Grant SELECT/INSERT/UPDATE on resource-cost tables
# ใช้ DB_NAME จาก .env (หรือ DB_USER ถ้ามี) เป็น role
# รัน: cd backend && powershell -ExecutionPolicy Bypass -File scripts/grant_resource_cost.ps1

$envPath = Join-Path $PSScriptRoot "..\..\.env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
      $key = $matches[1].Trim()
      $val = $matches[2].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
  }
}

$role = $env:DB_USER
if (-not $role) { $role = $env:DB_NAME }
if (-not $role) { $role = "meera" }

$dbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$dbName = if ($env:DB_DATABASE) { $env:DB_DATABASE } else { "meera_db" }

Write-Host "Granting to role: $role (DB: $dbName)"
$sqlPath = Join-Path $PSScriptRoot "..\db\migrations\041_grant_resource_cost_tables.sql"

# รัน psql (ต้องมี postgres ใน PATH)
# ใช้ -U postgres หรือ user ที่มีสิทธิ์ GRANT
$psqlUser = if ($env:PGUSER) { $env:PGUSER } else { "postgres" }
& psql -h $dbHost -p $dbPort -U $psqlUser -d $dbName -v "role=$role" -f $sqlPath
if ($LASTEXITCODE -eq 0) { Write-Host "Done." } else { Write-Host "Failed. Try: psql -U postgres -d $dbName -v role=$role -f $sqlPath" }
