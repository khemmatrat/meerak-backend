#!/usr/bin/env bash
# AQOND v2 — run product stack on Linux (VPS / dev box). No Docker Desktop on Windows.
#
# Usage:
#   cd /path/to/aqond-v2
#   bash infra/scripts/dev-remote-up.sh          # full product stack
#   bash infra/scripts/dev-remote-up.sh --quick    # restart existing images
#   bash infra/scripts/dev-remote-up.sh --infra    # DB/Kong/MinIO/Kafka only
#
# From Windows laptop:
#   pwsh -File infra/scripts/dev-remote-tunnel.ps1 -RemoteHost user@this-server
#   pwsh -File infra/scripts/storefront-dev.ps1
#   pwsh -File infra/scripts/ai-core-local.ps1    # optional: AI on laptop GPU

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export AQOND_DATA_ROOT="${AQOND_DATA_ROOT:-/var/lib/aqond-data}"
export GOROOT="${GOROOT:-/usr/local/go}"
export PATH="$GOROOT/bin:$PATH"
export GOMODCACHE="${GOMODCACHE:-$HOME/.cache/go-mod}"
export GOCACHE="${GOCACHE:-$HOME/.cache/go-build}"

QUICK=0
INFRA=0
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --infra) INFRA=1 ;;
  esac
done

echo "=== AQOND v2 remote product stack ==="
echo "  data: $AQOND_DATA_ROOT"
echo ""

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker engine not running. Install docker.io / docker-ce and start the service."
  exit 1
fi

if command -v pwsh >/dev/null 2>&1; then
  ARGS=(-Product)
  [[ $QUICK -eq 1 ]] && ARGS+=(-Quick)
  [[ $INFRA -eq 1 ]] && ARGS+=(-InfraOnly)
  pwsh -File infra/scripts/dev-up-all.ps1 "${ARGS[@]}"
  exit $?
fi

# Fallback: pure docker compose (no host Go compile — images must exist)
ENV_FILE=(--env-file infra/.env --profile dev-lite)
INFRA_SVC=(aqond-db aqond-redis redpanda minio scylla kong redpanda-console cdn-edge)
PRODUCT_SVC=(
  foundation-svc catalog-svc promotions-svc coupon-svc account-svc coins-svc
  creator-svc wallet-svc inventory-svc payment-svc order-svc cart-svc checkout-svc
  settings-svc search-svc shipping-svc bff-svc feed-svc video-svc rec-svc
)

echo "pwsh not found — using docker compose only (run go-host-build on Windows first or build on server)"
for svc in "${INFRA_SVC[@]}"; do
  echo "  up $svc"
  docker compose "${ENV_FILE[@]}" up -d "$svc"
done

if [[ $INFRA -eq 1 ]]; then
  echo "Infra only — done."
  docker compose "${ENV_FILE[@]}" ps
  exit 0
fi

for svc in "${PRODUCT_SVC[@]}"; do
  docker compose "${ENV_FILE[@]}" up -d --no-build "$svc" || echo "WARN: $svc failed (missing image?)"
done

docker compose "${ENV_FILE[@]}" ps
echo ""
echo "Tunnel from laptop: pwsh -File infra/scripts/dev-remote-tunnel.ps1 -RemoteHost user@$(hostname -I | awk '{print $1}')"
