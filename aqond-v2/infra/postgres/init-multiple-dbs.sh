#!/bin/bash
# Creates isolated databases on first Postgres boot (POSTGRES_MULTIPLE_DATABASES is NOT a real env var)
set -euo pipefail

function create_db() {
  local db="$1"
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    SELECT 'CREATE DATABASE $db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
    GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
}

# Default DB from POSTGRES_DB (if set) is created by official entrypoint
for db in kong bagisto strapi odoo n8n escrow analytics ai commerce; do
  create_db "$db"
done

echo "Multi-database init complete."
