# W2 Load Test Report (fill after run)

**Status:** ☐ Draft ☐ PASS ☐ FAIL

---

## 1) Environment

| Field | Value |
| --- | --- |
| Base URL | |
| Date / time (UTC+7) | |
| Git SHA deployed (`/api/meta` → `gitSha`) | |
| Tester | |
| k6 version (`k6 version`) | |

**Preflight:** ☐ `npm run war-room:w2-preflight -- <base>` exit 0

---

## 2) Results — load (`war-room-w2-load.js`)

Evidence file: `w2-summary-load.json`

| Endpoint / check | RPS (approx) | p50 ms | p95 ms | p99 ms | Error rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| health | | | | | |
| meta | | | | | |
| bootstrap | | | | | |
| login_miss (401) | | | | | |
| protected_401 | | | | | |
| **Overall** | | | | | |

---

## 3) Ladder (100 / 500 / 1000 VUs)

| Step | Pass? | p95 bootstrap | Error rate | Summary file |
| --- | --- | ---: | ---: | --- |
| 100 | ☐ | | | `w2-summary-ladder-100.json` |
| 500 | ☐ | | | `w2-summary-ladder-500.json` |
| 1000 | ☐ | | | `w2-summary-ladder-1000.json` |

---

## 4) Stress — breaking point

Evidence: `w2-summary-stress.json`

| Observation | Value |
| --- | --- |
| First stage with error rate &gt; 5% | VU ≈ |
| First stage with p95 &gt; 2000 ms | VU ≈ |
| Render CPU peak | % |
| Render RAM peak | |
| DB max connections | |

---

## 5) Recommendations

- Estimated safe concurrent users (error &lt; 1%):
- Bottleneck (e.g. bootstrap DB, login rate limit, bcrypt on real users):
- Actions before production soft launch:

---

## 6) Sign-off

| Role | Name | PASS/FAIL | Date |
| --- | --- | --- | --- |
| Eng | | | |
| QA | | | |

**W2 overall:** ☐ PASS ☐ FAIL
