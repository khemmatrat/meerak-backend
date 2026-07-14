# Apply ScyllaDB feed schema (P33)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$CqlFile = Join-Path $Root "infra\scylla\001_feed_schema.cql"
$Compose = Join-Path $Root "docker-compose.yml"

Write-Host "=== Scylla feed schema (P33) ==="
docker compose --env-file $EnvFile -f $Compose --profile dev-lite cp $CqlFile scylla:/tmp/001_feed_schema.cql
docker compose --env-file $EnvFile -f $Compose --profile dev-lite exec -T scylla cqlsh -f /tmp/001_feed_schema.cql
Write-Host "Scylla schema applied."
