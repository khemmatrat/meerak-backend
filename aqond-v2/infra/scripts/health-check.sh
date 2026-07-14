#!/bin/bash
# Health check for P0 stack
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/.env}"
if [[ -f "$ENV_FILE" ]]; then set -a; source "$ENV_FILE"; set +a; fi

echo "Checking Postgres..."
docker compose --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" exec -T aqond-db pg_isready -U "${POSTGRES_USER:-admin_boss}" || exit 1

echo "Checking Kong proxy..."
curl -sf "http://127.0.0.1:${KONG_PROXY_PORT:-8000}/" -o /dev/null || echo "WARN: Kong not up yet"

echo "Checking escrow service..."
curl -sf "http://127.0.0.1:8091/health" || echo "WARN: escrow-service not up"

echo "P0 health check complete."
