#!/bin/bash
# P47: Bootstrap Citus cluster — register workers on coordinator
set -euo pipefail

COORD="${CITUS_COORDINATOR_HOST:-citus-coordinator}"
USER="${POSTGRES_USER:-admin_boss}"
DB="${POSTGRES_DB:-commerce}"
export PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}"

wait_pg() {
  local host="$1"
  for i in $(seq 1 60); do
    if pg_isready -h "$host" -U "$USER" -d "$DB" >/dev/null 2>&1; then
      return 0
    fi
    echo "waiting for $host..."
    sleep 3
  done
  return 1
}

wait_pg "$COORD"
wait_pg citus-worker-1
wait_pg citus-worker-2

psql -v ON_ERROR_STOP=1 -h "$COORD" -U "$USER" -d "$DB" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS citus;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_dist_node WHERE nodename = 'citus-worker-1') THEN
    PERFORM citus_add_node('citus-worker-1', 5432);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_dist_node WHERE nodename = 'citus-worker-2') THEN
    PERFORM citus_add_node('citus-worker-2', 5432);
  END IF;
END $$;

SELECT nodeid, nodename, isactive FROM pg_dist_node ORDER BY nodeid;
EOSQL

echo "Citus cluster bootstrap complete."
