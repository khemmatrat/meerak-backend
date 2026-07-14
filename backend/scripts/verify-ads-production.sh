#!/usr/bin/env bash
# Run on server: bash ~/apps/backend-1.2/scripts/verify-ads-production.sh
# If "set: pipefail" error: sed -i 's/\r$//' this-file
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
ok() { printf '%bOK%b %s\n' "$GREEN" "$NC" "$*"; }
fail() { printf '%bFAIL%b %s\n' "$RED" "$NC" "$*"; exit 1; }

APPS_ENV="${APPS_ENV:-$HOME/apps/.env}"
SC_ENV="${SC_ENV:-$HOME/apps/social-core/apps/api/.env}"
GW="${GW:-172.18.0.1}"

echo "=== 1) Social Core (host) ==="
curl -sf --max-time 3 "http://127.0.0.1:3010/health" | grep -q '"ok":true' && ok "SC health 127.0.0.1:3010" || fail "SC health"
curl -sf --max-time 3 "http://${GW}:3010/health" | grep -q '"ok":true' && ok "SC health ${GW}:3010" || fail "SC bridge IP"

ADS_KEY="$(grep '^ADS_SERVICE_API_KEY=' "$SC_ENV" | cut -d= -f2- | tr -d '\r')"
test -n "$ADS_KEY" || fail "ADS_SERVICE_API_KEY missing in $SC_ENV"

RESERVE="$(curl -sf --max-time 5 -X POST "http://127.0.0.1:3010/api/v1/v1/ads/placements/reserve" \
  -H "Content-Type: application/json" \
  -H "X-Ads-Service-Key: $ADS_KEY" \
  -d '{"surface":"VIDEO_FEED","count":1}')"
echo "$RESERVE" | grep -q '"slots"' && ok "SC reserve API" || fail "SC reserve"

if echo "$RESERVE" | grep -q '"publicImpressionId"'; then
  ok "SC has fill (slots non-empty)"
else
  echo "WARN: slots empty — run seed-house if needed"
fi

echo ""
echo "=== 2) Docker backend -> Social Core ==="
docker exec aqond-backend sh -c "wget -qO- --timeout=5 http://${GW}:3010/health" | grep -q '"ok":true' \
  && ok "container -> ${GW}:3010" || fail "container cannot reach SC (check ufw)"

echo ""
echo "=== 3) meerak .env bridge ==="
grep -q '^SOCIAL_CORE_API_URL=' "$APPS_ENV" && ok "SOCIAL_CORE_API_URL set" || fail "missing SOCIAL_CORE_API_URL"
grep -q '^ADS_SERVICE_API_KEY=' "$APPS_ENV" && ok "ADS_SERVICE_API_KEY in apps .env" || fail "missing ADS key in apps .env"
KEY_APPS="$(grep '^ADS_SERVICE_API_KEY=' "$APPS_ENV" | cut -d= -f2- | tr -d '\r')"
test "$KEY_APPS" = "$ADS_KEY" && ok "ADS key matches social-core" || fail "ADS key mismatch between .env files"

docker exec aqond-backend node -e "
const u=process.env.SOCIAL_CORE_API_URL;
const k=process.env.ADS_SERVICE_API_KEY;
if(!u||!k){console.error('env missing in container');process.exit(1);}
fetch(u+'/v1/ads/placements/reserve',{
  method:'POST',
  headers:{'Content-Type':'application/json','X-Ads-Service-Key':k},
  body:JSON.stringify({surface:'VIDEO_FEED',count:1})
}).then(async r=>{const t=await r.text();if(!r.ok){console.error(r.status,t);process.exit(1);}
 if(!t.includes('slots')){console.error('bad body',t);process.exit(1);}
 console.log('bridge',t.slice(0,120));}).catch(e=>{console.error(e);process.exit(1);});
" && ok "container node fetch reserve" || fail "bridge from container"

echo ""
echo "=== 4) Public feed (host curl api) ==="
FEED="$(curl -sf --max-time 15 "http://127.0.0.1:3001/api/videos/feed?limit=20")"
if echo "$FEED" | grep -q 'mixKind'; then
  if echo "$FEED" | grep -q '"mixKind":"sponsored"'; then
    ok "feed contains sponsored item"
  else
    echo "WARN: mixKind present but no sponsored"
  fi
else
  echo "WARN: no mixKind in feed — rebuild backend image with ads lib"
fi

echo ""
echo "=== 5) Ads routes in container ==="
docker exec aqond-backend sh -c 'test -f /app/backend/lib/adsBridgeClient.js' \
  && ok "adsBridgeClient.js in image" || fail "ads lib missing — sync backend-1.2 and docker compose build backend"
CLICK="$(curl -s --max-time 5 -X POST http://127.0.0.1:3001/api/ads/click -H "Content-Type: application/json" -d '{}')"
echo "$CLICK" | grep -q 'ads_not_configured\|publicImpressionId' && ok "POST /api/ads/click route exists" \
  || echo "WARN: /api/ads/click not deployed ($(echo "$CLICK" | head -c 80))"

echo ""
echo "=== 6) Ads schedulers (meerak .env) ==="
for flag in ADS_DAILY_RECON_ENABLED ADS_OPTIMIZATION_ENABLED ADS_WAREHOUSE_ENABLED ADS_ESCROW_EXPIRY_ENABLED; do
  grep -q "^${flag}=1" "$APPS_ENV" && ok "$flag=1" || echo "WARN: $flag not set — background jobs off"
done

echo ""
echo "=== 7) ClickHouse warehouse (optional) ==="
if grep -qE '^CLICKHOUSE_URL=|^ADS_CLICKHOUSE_URL=' "$APPS_ENV" 2>/dev/null; then
  docker exec aqond-backend node scripts/verify-ads-clickhouse.js --ping-only \
    && ok "ClickHouse reachable from container" || fail "ClickHouse ping failed"
else
  echo "SKIP: CLICKHOUSE_URL not set — using postgres ads_warehouse_events fallback"
fi

echo ""
echo "=== 8) Outcome billing E2E ==="
docker exec aqond-backend node scripts/verify-ads-outcome-e2e.js --dry-run \
  && ok "outcome E2E dry-run" || fail "outcome E2E dry-run failed"

if [ "${ADS_VERIFY_OUTCOME_E2E:-0}" = "1" ]; then
  docker exec aqond-backend node scripts/verify-ads-outcome-e2e.js \
    && ok "outcome E2E live (0.05 THB billed)" || fail "outcome E2E live failed"
else
  echo "SKIP live outcome bill — set ADS_VERIFY_OUTCOME_E2E=1 to run on prod"
fi

echo ""
echo "=== 9) A/B compare API ==="
COMPARE="$(curl -sf --max-time 8 -H "X-Ads-Service-Key: $ADS_KEY" \
  "http://127.0.0.1:3010/api/v1/v1/ads/campaigns/compare?ids=00000000-0000-0000-0000-000000000001" 2>/dev/null || true)"
if echo "$COMPARE" | grep -qE '"campaigns"|"compare"'; then
  ok "SC campaigns/compare route"
else
  echo "WARN: compare endpoint — rebuild Social Core if 404/502"
fi

echo ""
echo "=== Done ==="
