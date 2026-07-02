# S004 Performance Report

| Metric | Target | Result |
|--------|--------|--------|
| Badge UI feedback | <150ms perceived | Optimistic bump on confirm click |
| Add-to-cart network | async non-blocking | bffPost + local fallback |
| Cart page load | <3s dev | bffGet local cart |
| Telemetry flush | immediate enqueue | flushScenarioTelemetry on enqueue |

Tested: `pv-s004-production.spec.ts` badge timing gate <5s e2e (dev cold start inclusive).
