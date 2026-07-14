#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/.env}"
if [[ -f "$ENV_FILE" ]]; then set -a; source "$ENV_FILE"; set +a; fi

PGHOST="${POSTGRES_HOST:-127.0.0.1}"
PGPORT="${POSTGRES_PORT:-5433}"
PGUSER="${POSTGRES_USER:-admin_boss}"
export PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in infra/.env}"

run_sql() {
  local db="$1"
  local file="$2"
  echo "  -> $(basename "$file") on $db"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 -f "$file"
}

echo "=== escrow database ==="
run_sql escrow "$ROOT/infra/postgres/migrations/001_escrow_ledger.sql"

echo "=== analytics database ==="
run_sql analytics "$ROOT/infra/postgres/migrations/002_analytics_events.sql"

echo "=== ai database ==="
run_sql ai "$ROOT/infra/postgres/migrations/003_ai_audit.sql"

echo "=== bagisto database (P2a catalog) ==="
run_sql bagisto "$ROOT/infra/postgres/migrations/004_marketplace_catalog.sql"

echo "=== bagisto database (P2b orders) ==="
run_sql bagisto "$ROOT/infra/postgres/migrations/005_marketplace_orders.sql"

echo "=== bagisto database (P6 SLA) ==="
run_sql bagisto "$ROOT/infra/postgres/migrations/006_marketplace_sla.sql"

echo "=== analytics database (P7) ==="
run_sql analytics "$ROOT/infra/postgres/migrations/007_analytics_p7.sql"

echo "Migrations complete."
