# Run as postgres to fix "permission denied for table account_deletion_requests"
# Usage: .\grant-legal-tables.ps1
# Or: psql -U postgres -d meera_db -f backend/db/migrations/054_grant_legal_tables.sql

$migrationPath = Join-Path $PSScriptRoot "..\db\migrations\054_grant_legal_tables.sql"
$dbName = $env:DB_DATABASE ?? "meera_db"

Write-Host "Running GRANT for legal tables (requires postgres/superuser)..."
& psql -U postgres -d $dbName -f $migrationPath
if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Restart backend and try again."
} else {
    Write-Host "Failed. Run manually: psql -U postgres -d $dbName -f $migrationPath"
}
