#!/usr/bin/env bash
# HTTP smoke tests — รันบน server (host network → localhost:3001)
set -euo pipefail

BASE="${TEST_API_URL:-http://127.0.0.1:3001}"
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect="$3"
  local code
  code="$(curl -s -o /tmp/cm_smoke_body.json -w '%{http_code}' "${BASE}${url}" || echo "000")"
  if [ "${code}" = "${expect}" ]; then
    echo "✓ ${name} → HTTP ${code}"
  else
    echo "❌ ${name} → HTTP ${code} (expected ${expect})"
    head -c 200 /tmp/cm_smoke_body.json 2>/dev/null || true
    echo ""
    FAIL=1
  fi
}

echo "=== Course Marketplace smoke @ ${BASE} ==="

check "Health" "/api/course-marketplace/health" "200"
check "Marketplace catalog" "/api/courses/marketplace?limit=3" "200"
check "Demo course detail" "/api/courses/marketplace/aqond-marketplace-free-preview" "200"
check "Purchase quote (public)" "/api/courses/aqond-marketplace-free-preview/purchase-quote" "200"
check "Wallet deposit regression" "/api/wallet/deposit/preview?amount=100&payment_method=promptpay" "200"

code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/courses/analytics/events" \
  -H 'Content-Type: application/json' \
  -d '{"courseId":"aqond-marketplace-free-preview","eventType":"course_impression"}' || echo "000")"
if [ "${code}" = "200" ] || [ "${code}" = "201" ] || [ "${code}" = "204" ]; then
  echo "✓ Funnel POST → HTTP ${code}"
else
  echo "❌ Funnel POST → HTTP ${code}"
  FAIL=1
fi

# Auth-gated endpoints must NOT be 404
for path in \
  "/api/course-studio/courses" \
  "/api/instructor/sales" \
  "/api/admin/courses/marketplace/review-queue?status=in_review"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}" || echo "000")"
  if [ "${code}" = "404" ]; then
    echo "❌ ${path} → 404 (routes not loaded — restart backend)"
    FAIL=1
  elif [ "${code}" = "401" ] || [ "${code}" = "403" ]; then
    echo "✓ ${path} → ${code} (route exists)"
  else
    echo "✓ ${path} → ${code}"
  fi
done

health_ok="$(curl -s "${BASE}/api/course-marketplace/health" | grep -o '"ok":true' || true)"
if [ -n "${health_ok}" ]; then
  echo "✓ health ok:true"
else
  echo "❌ health ok:false — ดู docker logs aqond-backend"
  FAIL=1
fi

if [ "${FAIL}" -ne 0 ]; then
  exit 1
fi
echo "=== Smoke PASS ==="
