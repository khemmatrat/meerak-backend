#!/bin/bash
# P8 smoke test — ai-core health + CMS legacy JSON onboard (no Ollama required for legacy path)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/.env}"
if [[ -f "$ENV_FILE" ]]; then set -a; source "$ENV_FILE"; set +a; fi

AI_KEY="${AI_CORE_API_KEY:-CHANGE_ME_ai_core_key}"
KONG="${KONG_PROXY_PORT:-8000}"

echo "1. ai-core health (direct via Kong)"
curl -sf "http://127.0.0.1:${KONG}/api/v1/ai/health" \
  -H "X-AI-Core-Api-Key: ${AI_KEY}" | head -c 500
echo ""

echo "2. cms legacy JSON onboard (no vision — skips Ollama)"
curl -sf -X POST "http://127.0.0.1:${KONG}/api/v1/cms/ai/onboard" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-test-$(date +%s)" \
  -d '{"llm_output":{"title":"เสื้อยืด cotton","category":"fashion","price_thb":199,"inventory":5,"description":"ทดสอบ smoke"}}'
echo ""

echo "3. For full vision onboard: pull models first, then POST multipart to /api/v1/cms/ai/onboard"
echo "   bash infra/ai-core/scripts/pull-models.sh"
echo "   CPU PoC latency: 30-120 seconds per product"

echo "Smoke test complete."
