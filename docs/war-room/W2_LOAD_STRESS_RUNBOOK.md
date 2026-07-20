# W2 — Load / Stress Test Runbook

**Prerequisite:** Deploy + smoke ผ่านแล้ว — `GET /api/meta` และ `GET /api/app/bootstrap` ต้อง **200** บน environment ที่จะเทส (อย่ายิง load ใส่ stack ที่ยัง 404)

**แนะนำ:** รันบน **staging** ก่อน ไม่ใช่ production traffic จริง

**Related:** [DEPLOY_AND_AUTH_QA_RUNBOOK.md](./DEPLOY_AND_AUTH_QA_RUNBOOK.md)

---

## 0) Preflight (บังคับ)

```bash
cd backend
npm run war-room:w2-preflight -- https://YOUR-STAGING-API.example.com
# หรือ
node scripts/war-room-w2-preflight.mjs https://YOUR-STAGING-API.example.com
```

ถ้า exit **1** → แก้ deploy/smoke ก่อน ห้ามรัน k6

---

## 1) ติดตั้ง k6

- macOS: `brew install k6`
- Linux: `sudo apt-get install k6`
- Windows: [k6 releases](https://github.com/grafana/k6/releases) หรือ `choco install k6`

---

## 2) Endpoint ที่สคริปต์ใน repo ยิง

| Endpoint | Method | สคริปต์ | หมายเหตุ |
| --- | --- | --- | --- |
| `/api/health` | GET | load, ladder | baseline |
| `/api/meta` | GET | load, stress, ladder | ทุกเปิดแอป |
| `/api/app/bootstrap` | GET | load, stress, ladder | cold start — จุดเสี่ยง |
| `/api/auth/login` | POST | load, stress | **เบอร์ไม่มีในระบบ** → 401 (ไม่สร้าง user, ไม่ bcrypt หนัก) |
| `/api/videos/my` | GET | load | ไม่มี token → 401 (ทด JWT middleware) |
| `/api/auth/register` | POST | — | **ไม่รวม** (เขียน DB) |
| `/api/auth/forgot-password` | POST | — | **ไม่รวม** (กันชน rate limit / SMS) |
| `/api/auth/phone-otp/*` | POST | — | **ไม่รวม** (SMS quota) |

Auth body จริงของโปรเจกต์: `{ phone, password }` — **ไม่ใช่ email**

---

## 3) Load test (smoke + ramp)

```bash
cd backend
npm run war-room:w2-preflight -- https://staging-api.example.com

k6 run scripts/k6/war-room-w2-load.js \
  -e BASE_URL=https://staging-api.example.com \
  --summary-export=../docs/war-room/evidence/w2-summary-load.json \
  --out json=../docs/war-room/evidence/w2-results-load.json
```

**Thresholds (ในสคริpt):** error rate &lt; 1%; p95 health/meta &lt; ~800ms, bootstrap &lt; 1s (ปรับในไฟล์ k6 ตาม SLA จริง)

---

## 4) Soft-launch ladder (100 → 500 → 1000)

รันทีละขั้น — **หยุด** ถ้าขั้นก่อน fail threshold:

```bash
k6 run scripts/k6/war-room-w2-ladder.js -e BASE_URL=https://staging-api.example.com -e LADDER_STEP=100 \
  --summary-export=../docs/war-room/evidence/w2-summary-ladder-100.json

k6 run scripts/k6/war-room-w2-ladder.js -e BASE_URL=https://staging-api.example.com -e LADDER_STEP=500 \
  --summary-export=../docs/war-room/evidence/w2-summary-ladder-500.json

k6 run scripts/k6/war-room-w2-ladder.js -e BASE_URL=https://staging-api.example.com -e LADDER_STEP=1000 \
  --summary-export=../docs/war-room/evidence/w2-summary-ladder-1000.json
```

---

## 5) Stress test (หา breaking point)

```bash
k6 run scripts/k6/war-room-w2-stress.js -e BASE_URL=https://staging-api.example.com \
  --summary-export=../docs/war-room/evidence/w2-summary-stress.json
```

บันทึก VU ที่ `http_req_failed` &gt; 5% หรือ p95 &gt; 2s → **capacity ceiling**

เปิด **Render Metrics** (CPU/RAM) และ DB connection count คู่กับการรัน

---

## 6) Metrics ในรายงาน

| Metric | ที่มา |
| --- | --- |
| RPS | k6 summary |
| p50 / p95 / p99 ต่อ endpoint | k6 tags `endpoint:*` |
| Error rate ต่อ stage | k6 summary |
| CPU / Memory | Render dashboard |
| DB connections | Postgres provider |
| Breaking point VU | stress summary |

---

## 7) Deliverable

กรอก [`evidence/w2-load-test-report.md`](./evidence/w2-load-test-report.md) และแนบ `w2-summary-*.json`

**เกณฑ์ผ่าน W2:** Soft launch **100–500** concurrent (ladder) โดย error &lt; 1% และ p95 endpoint หลัก &lt; ~1s — ไม่ผ่าน → แก้ก่อน W3 (monitoring)

**หลัง W2 ผ่าน:** W3 — ตั้ง alert threshold จาก breaking point ที่วัดได้ ไม่เดา

---

## npm scripts

| Script | คำอธิบาย |
| --- | --- |
| `npm run war-room:w2-preflight -- <baseUrl>` | smoke gate |
| `npm run war-room:w2-load -- <baseUrl>` | k6 load (ต้องมี k6 ใน PATH) |
| `npm run war-room:w2-ladder -- <baseUrl> <100\|500\|1000>` | ladder step |
| `npm run war-room:w2-stress -- <baseUrl>` | stress |

---

## Rollback

ไม่มี deploy — ลบ/ไม่ commit ไฟล์ `w2-results*.json` ถ้ามีข้อมูล sensitive; revert โค้ด: `git revert <W2-commit>`
