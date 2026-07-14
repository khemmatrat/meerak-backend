#!/usr/bin/env node
/**
 * AQOND Platform Validation — Phase PV-2 Progressive
 * DOCUMENTATION ONLY — Mission Catalog + Wave 1 scenarios + tracker template.
 *
 * Usage: node scripts/write-platform-validation-pv2.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'platform-validation', 'pv-2');
const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(OUT, { recursive: true });

function w(name, body) {
  fs.writeFileSync(path.join(OUT, name), body.trimStart() + '\n');
  console.log('  wrote', name);
}

const HDR = (title) => `# ${title}

**Status:** DRAFT — Phase PV-2 Progressive  
**Date:** ${TODAY}  
**Prerequisite:** PV-1 complete (\`docs/platform-validation/001–015\`)  
**Rules:** Documentation only · no production code · test in waves  

`;

const files = {
'000-pv2-overview.md': `${HDR('PV-2 — Progressive Validation Program')}

## Philosophy

Do **not** create 300–500 scenarios at once. Progress in **waves**:

\`\`\`
Wave 1 (P0)  Scenario 001–050  →  test  →  fix  →  pass
Wave 2 (P1)  Scenario 051–100  →  ...
Wave 3 (P2)  Scenario 101–150  →  ...
Wave 4 (P3)  Scenario 151–200+  →  ...
\`\`\`

## Three layers (complete program)

| Layer | Phase | Artifact |
|-------|-------|----------|
| 1 | PV-1 ✅ | Feature Inventory — "what exists" |
| 2 | PV-2 🔄 | Master Scenario Book — "what users do" |
| 3 | PV-3 ⬜ | Validation Tracker — ✅ ⚠️ ❌ 🔄 per step |
| 4 | PV-3+ | **Experience Score** — executive dashboard (Speed · Clarity · Recovery · Smoothness · Confidence) |
| 5 | PV-3+ | **Business Impact** — Critical / High / Medium / Low + **Time Saved** |

\`\`\`
Mission → Scenario → Step → Experience Score → Business Impact
\`\`\`

## PV-2 document set

| Doc | Title |
|-----|-------|
| 000 | This overview |
| 010 | Master Scenario Index (Mission Catalog) |
| 011 | Pre-flight issues (blockers before UAT) |
| 020 | Validation Tracker template |
| **024** | **Experience Score framework** |
| **025** | **Business Impact + Time Saved** |
| 021 | Wave 1 — full scenario index (S001–S050) |
| 022 | Wave 1 — M-001 detail (marketplace checkout) |
| 023 | Wave 1 — M-002 detail (food ordering) |
| 030 | Wave 2 index (P1) — missions only |
| 040 | Wave 3 index (P2) |
| 050 | Wave 4 index (P3) |

## Wave priorities (CTO)

| Wave | Priority | Scope |
|------|----------|-------|
| **1** | P0 | Auth, Marketplace checkout, Food, Wallet, Payment, Notification |
| **2** | P1 | Merchant, Food merchant, Rider, Talent |
| **3** | P2 | Admin, Analytics, CRM, AI |
| **4** | P3 | Cross-flow, failure, recovery, refund, offline, edge cases |

## Start here

1. Read \`011-pre-flight-issues.md\` — open GitHub issues for P0 blockers
2. Read \`010-master-scenario-index.md\` — mission map
3. Execute \`021-wave-1-scenario-index.md\` using \`020-validation-tracker-template.md\`
4. Detail steps in \`022\`, \`023\` as missions are tested
`,

'010-master-scenario-index.md': `${HDR('010 — Master Scenario Index (Mission Catalog)')}

> **This is not a test case library.** It is a **Mission Catalog** — high-level journeys to decompose into scenarios.

## Mission catalog

| Mission | Role | Priority | Wave | Modules / flow | Scenario range |
|---------|------|----------|------|----------------|----------------|
| **M-001** | User (buyer) | P0 | 1 | Auth → Search → Cart → Checkout → Payment → Track → Review | S001–S015 |
| **M-002** | Food user | P0 | 1 | Food home → Restaurant → Cart → Checkout → Track → Rider chat | S016–S025 |
| **M-003** | User | P0 | 1 | Login / Register / OTP / Mobile handoff | S026–S032 |
| **M-004** | User | P0 | 1 | Wallet balance → Top-up (if enabled) → Transaction history | S033–S037 |
| **M-005** | User | P0 | 1 | Payment QR → Verify → Result page | S038–S042 |
| **M-006** | User | P0 | 1 | Push / LINE notification → Order updates | S043–S047 |
| **M-007** | User | P0 | 1 | Orders list → Active → Track parcel → Dispute report | S048–S050 |
| **M-010** | Merchant | P1 | 2 | Login → Shop setup → Menu → Orders → Accept | S051–S062 |
| **M-011** | Food merchant | P1 | 2 | Menu bulk → Hours → Promos → Food orders | S063–S072 |
| **M-012** | Merchant | P1 | 2 | Wallet → Withdraw → Fees → Audit log | S073–S078 |
| **M-013** | Merchant | P1 | 2 | Ad studio → AIVOS brief → Publish | S079–S085 |
| **M-020** | Rider | P1 | 2 | Signup/KYC → Go online → Job → Pickup → Deliver → Wallet | S086–S098 |
| **M-021** | Rider | P1 | 2 | Active job → Map → Voice AI → Complete | S099–S105 |
| **M-030** | Talent / Provider | P1 | 2 | Job board → Bid → Booking → Milestone (v1 mobile) | S106–S115 |
| **M-040** | Admin (Nexus) | P2 | 3 | RBAC login → Users → KYC → Finance → Food ops | S116–S130 |
| **M-041** | Admin (break-glass) | P2 | 3 | Storefront \`/m/admin\` → Food dashboard | S131–S135 |
| **M-050** | User + Jarvis | P2 | 3 | Jarvis search → Compare → Concierge (AGK headers) | S136–S145 |
| **M-051** | Merchant + AI | P2 | 3 | Merchant assistant → Shop ops suggestions | S146–S150 |
| **M-060** | Analytics / CRM | P2 | 3 | Event write → Shop chat inbox | S151–S158 |
| **M-070** | Cross-platform | P3 | 4 | Marketplace → Wallet → Payment → Notify → Analytics | S159–S170 |
| **M-071** | Failure / recovery | P3 | 4 | Payment fail → Retry → Refund path | S171–S180 |
| **M-072** | Offline / edge | P3 | 4 | ai-core down → localJarvis · network loss | S181–S188 |
| **M-080** | Guardian (AGK) | P3 | 4 | Observe → Confidence → Intent → Mission replay | S189–S195 |

**Total missions defined:** 22 · **Wave 1 scenarios:** 050 · **Full program target:** ~195+ (expand per wave)

---

## Mission → scenario decomposition (pattern)

\`\`\`
Mission M-001
  ├── S001 Install / open app
  ├── S002 Register
  ├── S003 OTP verify
  ├── ...
  └── S015 Review order
\`\`\`

Each **S###** becomes rows in the Validation Tracker (one row per step).

---

## Modules × missions matrix

| Module | Missions |
|--------|----------|
| Auth | M-001, M-003, M-010, M-020, M-040 |
| Marketplace | M-001, M-007 |
| Food | M-002, M-011 |
| Wallet | M-004, M-012 |
| Payment | M-001, M-005, M-071 |
| Notification | M-006 |
| Merchant | M-010–M-013 |
| Rider | M-020–M-021 |
| Talent | M-030 |
| Admin | M-040–M-041 |
| Jarvis / AI | M-050–M-051, M-080 |
| Guardian | M-080, M-070 |

---

## Out of scope for Wave 1 UAT

Per pre-flight issues (011):

- Account **settings stubs** (help, privacy, delete-account, etc.)
- Service Mesh capability invoke (not implemented)
- Hermes multi-agent production path
- Live commerce full checkout (unless go/no-go decided)
`,

'011-pre-flight-issues.md': `${HDR('011 — Pre-Flight Issues (open before Wave 1 UAT)')}

> Open GitHub issues for these **before** executing long journeys. PV-1 evidence cited.

---

## P0 — Block testing or invalidate results

### ISSUE-P0-01: Dual stack (v1 backend ↔ v2 commerce)

| Field | Value |
|-------|-------|
| **Risk** | High — same user journey may hit different systems |
| **Evidence** | \`backend/server.js\` wallet vs \`commerce.wallets\`; mobile v1 vs storefront v2 |
| **PV-1** | 012 C1, 015 #3 |
| **Impact** | Wallet balance wrong · order history split · identity mismatch |
| **Action** | Architecture decision (ADR): which stack owns wallet/orders for Wave 1 tests |
| **Test workaround** | Document which URLs/flags force v2-only path in tracker |

---

### ISSUE-P0-02: Rider authorization weak

| Field | Value |
|-------|-------|
| **Risk** | Critical security |
| **Evidence** | \`aqond-v2/apps/storefront/app/api/rider/*.ts\` — \`rider_id\` query param; no RBAC middleware |
| **PV-1** | 005, 012 C2 |
| **Impact** | Rider impersonation · fraudulent job accept/withdraw |
| **Action** | Fix before Wave 2 M-020 testing · **do not UAT rider wallet until fixed** |
| **Wave** | Blocks M-020–M-021 (Wave 2) — note for Wave 1 if any rider touch in food track |

---

## P1 — Roadmap / hide from UAT

### ISSUE-P1-01: Guardian coverage = Jarvis only

| Field | Value |
|-------|-------|
| **Risk** | Platform AI governance gap |
| **Evidence** | Only \`guardianTap.ts\` on \`/api/ai/jarvis\`; ~960 backend routes bypass |
| **PV-1** | 010 |
| **Action** | Roadmap after AGK gates 053/055/056 · Intent pilot on one checkout flow |
| **Wave 1** | Test Jarvis scenarios (M-050) in Wave 3; note AGK headers on S001–S015 only if Jarvis invoked |

---

### ISSUE-P1-02: Settings stub pages (UI only)

| Field | Value |
|-------|-------|
| **Risk** | Wasted UAT time · false "broken" reports |
| **Evidence** | \`/m/account/settings/{help,about,terms,privacy,blocked,delete-account,rate,password}\` — \`MpSettingsStubPage\` |
| **PV-1** | 002, 013 |
| **Action** | Hide from nav OR implement API before inclusion in missions |
| **Wave 1** | **Exclude** from S001–S050 |

---

## Issue template (GitHub)

\`\`\`markdown
## Summary
[ISSUE-P0-01 title]

## PV-1 reference
docs/platform-validation/012-critical-gaps.md

## Evidence
- path: ...
- behavior: ...

## Acceptance criteria
- [ ] ...

## Blocks missions
M-xxx, Sxxx–Sxxx
\`\`\`

---

## Sign-off before Wave 1 execution

| Check | Owner | Date |
|-------|-------|------|
| ISSUE-P0-01 ADR or test scope documented | | |
| Rider issue filed (even if fix is Wave 2) | | |
| Settings stubs hidden or flagged in UI | | |
| Tracker sheet created from 020 | | |
`,

'020-validation-tracker-template.md': `${HDR('020 — Validation Tracker Template')}

> **PV-3 operationalizes this.** Use spreadsheet, Notion, or \`pv-3/tracker.csv\` when ready.

## Per-scenario tracker

**Scenario ID:** S### · **Mission:** M-### · **Wave:** 1 · **Tester:** · **Date:**

| Step | Expected | Actual | Status | Screenshot | Video | Log | Issue | Owner |
|------|----------|--------|--------|------------|-------|-----|-------|-------|
| 1 | | | ⬜ | | | | | |
| 2 | | | ⬜ | | | | | |

### Status legend (step-level)

| Symbol | Meaning |
|--------|---------|
| ✅ | Pass |
| ⚠️ | Pass with issues |
| ❌ | Fail / blocked |
| 🔄 | Fix in progress |
| ⬜ | Not tested |
| 🚫 | Out of scope (pre-flight) |

### Scenario grade (customer-facing — ใช้ตัดสินปล่อยหรือไม่)

| Grade | Meaning |
|-------|---------|
| 🟢 **Production Pass** | ใช้งานได้ · UX ดี · Performance ผ่าน · ไม่มี bug สำคัญ |
| 🟡 **Functional Pass** | ฟังก์ชันทำงาน · มี UX/Performance ติดตาม · ยังไม่พร้อม prod |
| 🟠 **Needs Fix** | ใช้ได้บางส่วน · กระทบผู้ใช้จริง |
| 🔴 **Blocker** | ใช้งานไม่ได้ · ห้ามปล่อย |

> **หลักการ:** ลูกค้าไม่สนใจว่า API ผ่าน — สนใจว่า **เปิดแอปแล้วใช้งานได้ไหม**

### Experience Score (scenario rollup — สำหรับผู้บริหาร)

ไม่อ่าน 2,000 test cases — อ่านคะแนนเดียวต่อ surface:

| ด้าน | คำถาม |
|------|--------|
| **Speed** | โหลดเร็วพอไหม |
| **Clarity** | เข้าใจทันทีไหม · ไม่สับสน |
| **Recovery** | พังแล้วกู้ได้ไหม |
| **Smoothness** | เลื่อน/กดลื่นไหม |
| **Confidence** | น่าเชื่อถือ · ไม่มี error รบกวน |

\`\`\`
Experience Score = avg(Speed, Clarity, Recovery, Smoothness, Confidence)  →  e.g. 9.3 / 10
\`\`\`

| Surface | Target |
|---------|--------|
| Home | ≥ 9.0 Production |
| Search | ≥ 8.5 |
| Checkout | ≥ 9.5 |

### Business Impact + Time Saved (scenario rollup)

| Scenario | Experience | Business | Time Saved |
|----------|------------|----------|------------|
| S001 Home | 9.1 | 🟢 สูง | 18 นาที |
| S002 Search | — | 🟢 สูง | 6 นาที |
| Checkout | — | 🔴 Critical | 24 นาที |

> ไม่ใช่ทุก bug สำคัญเท่ากัน — ดู \`025-business-impact-framework.md\` และ \`pv-3/scenario-rollup.csv\`

---

## Per-step fields (required for fail / ⚠️)

| Field | Description |
|-------|-------------|
| **Step** | Atomic action (tap, API call, page load) |
| **Expected** | Observable outcome |
| **Actual** | What happened |
| **Status** | ✅ ⚠️ ❌ 🔄 |
| **Screenshot** | File path or URL |
| **Video** | Screen recording link |
| **Log** | trace_id, network HAR, server log snippet |
| **Issue** | GitHub issue # |
| **Owner** | Engineer assigned |

---

## Mission rollup

| Mission | Scenarios | ✅ | ⚠️ | ❌ | 🔄 | % complete |
|---------|-----------|----|----|----|----|------------|
| M-001 | S001–S015 | | | | | |
| M-002 | S016–S025 | | | | | |

---

## Wave 1 exit criteria

- All P0 missions (M-001–M-007) ≥ **90%** steps ✅
- Zero open **❌** on payment (M-005) without documented workaround
- Pre-flight P0 issues have ADR or accepted risk sign-off
- Sprint 35 regression green alongside manual Wave 1

---

## CSV header (machine-readable)

\`\`\`csv
wave,mission_id,scenario_id,step,expected,actual,step_status,scenario_grade,experience_score,business_impact,time_saved_minutes,speed,clarity,recovery,smoothness,confidence,screenshot,video,log,issue,owner,tested_at,build,env
\`\`\`

Scenario rollup (one row per scenario): \`pv-3/scenario-rollup.csv\`
`,

'021-wave-1-scenario-index.md': `${HDR('021 — Wave 1 Scenario Index (S001–S050)')}

**Wave:** 1 · **Priority:** P0 · **Exit:** test → fix → pass → Wave 2

### Scenario business map (Wave 1 sample)

| ID | Experience | Business | Time Saved |
|----|------------|----------|------------|
| S001 | 9.1 | 🟢 สูง | 18m |
| S002 | — | 🟢 สูง | 6m |
| S006–S010 | — | 🔴 Critical | 24m |
| S043 | — | 🟡 กลาง | 4m |

| ID | Mission | Title | Route / API (evidence) | Pre-flight |
|----|---------|-------|--------------------------|------------|
| S001 | M-001 | Open storefront home | \`/m/home\` | |
| S002 | M-001 | **Find & decide** — ค้นหาและตัดสินใจได้ในเวลาที่เหมาะสม | \`/m/search\`, BFF, Jarvis | |
| S003 | M-001 | Product detail | \`/m/product/[id]\` | |
| S004 | M-001 | Add to cart | \`/m/cart\`, BFF cart | |
| S005 | M-001 | View cart | \`/m/cart\` | |
| S006 | M-001 | Checkout start | \`/m/checkout\` | |
| S007 | M-001 | Place order API | \`POST /api/checkout/place\` | Dual-stack: ISSUE-P0-01 |
| S008 | M-001 | Payment page | \`/m/checkout/payment\` | |
| S009 | M-001 | Payment verify | \`/api/checkout/payment/verify\` | |
| S010 | M-001 | Payment result | \`/m/checkout/payment/result\` | |
| S011 | M-001 | Order confirmation | \`/m/orders\` | |
| S012 | M-001 | Order detail track | \`/m/orders/[id]/track\` | |
| S013 | M-001 | Submit review | \`/api/reviews\` | |
| S014 | M-001 | Dispute report sheet | \`TtDisputeReportSheet\` | |
| S015 | M-001 | Promo validate | \`/api/promo/validate\` | |
| S016 | M-002 | Food home | \`/m/food\`, BFF food home | |
| S017 | M-002 | Restaurant menu | \`/m/food/[id]\` | |
| S018 | M-002 | Add item sheet | \`TtFoodAddSheet\` | |
| S019 | M-002 | Food cart | \`/m/food/cart\` | |
| S020 | M-002 | Food checkout | \`/m/food/checkout\` | |
| S021 | M-002 | Food order placed | BFF checkout | ISSUE-P0-01 |
| S022 | M-002 | Food tracking page | \`/m/food/track/[orderId]\` | |
| S023 | M-002 | Rider map on track | WS tracking | |
| S024 | M-002 | Rider chat sheet | \`TtRiderChatSheet\` | Rider auth: note P0-02 |
| S025 | M-002 | Food review | tracking review API | |
| S026 | M-003 | Login page | \`/m/login\` | |
| S027 | M-003 | Password login | \`/api/auth/login\` proxy | |
| S028 | M-003 | Register | \`/m/register\` | |
| S029 | M-003 | LINE callback | \`/m/login/line-callback\` | |
| S030 | M-003 | Mobile handoff | \`/m/auth/handoff\` | |
| S031 | M-003 | Session persists | account page | |
| S032 | M-003 | Logout / re-auth | UNKNOWN — verify | |
| S033 | M-004 | Account wallet view | \`/m/account/wallet\` | Dual-stack |
| S034 | M-004 | BFF wallet balance | BFF \`/v1/wallet\` | ISSUE-P0-01 |
| S035 | M-004 | Merchant wallet (sanity) | \`/m/merchant/wallet\` | Wave 2 primary |
| S036 | M-004 | Transaction history | BFF | |
| S037 | M-004 | Wallet v1 mobile | \`mobile/WalletDashboard\` | ISSUE-P0-01 |
| S038 | M-005 | Checkout payment QR | \`CoQrPaymentPage\` | |
| S039 | M-005 | Payment status poll | \`/api/checkout/payment/status\` | |
| S040 | M-005 | Payment failure display | result page error state | |
| S041 | M-005 | Local dev payment bypass | \`AQOND_ALLOW_LOCAL_ORDERS\` | Dev only |
| S042 | M-005 | Receipt PDF | \`/api/orders/[id]/receipt.pdf\` | |
| S043 | M-006 | Notification settings | \`/m/account/notifications\` | |
| S044 | M-006 | Push register | \`/api/notifications/register\` | |
| S045 | M-006 | LINE link callback | notifications line-callback | |
| S046 | M-006 | Notify proxy | \`/api/notify/*\` | |
| S047 | M-006 | Order push (manual) | UNKNOWN — device test | |
| S048 | M-007 | Orders list | \`/m/orders\` | |
| S049 | M-007 | Active orders filter | \`/m/orders/active\` | |
| S050 | M-007 | Shipping track | \`/api/shipping/track\` | |

**Excluded from Wave 1:** settings stubs (ISSUE-P1-02), \`/m/onboarding/intent\` (UI only)
`,

'022-wave-1-m001-marketplace-checkout.md': `${HDR('022 — Wave 1 Mission Detail: M-001 Marketplace Checkout')}

**Mission:** M-001 · **Role:** User · **Priority:** P0 · **Scenarios:** S001–S015

## Journey map

\`\`\`
S001 Open → S002 Search → S003 Product → S004 Add cart → S005 Cart
  → S006 Checkout → S007 Place → S008 Payment UI → S009 Verify
  → S010 Result → S011 Orders → S012 Track → S013 Review → S014 Dispute → S015 Promo
\`\`\`

---

## Scenario steps (tracker-ready)

### S001 — Open storefront home (customer experience)

**Scenario grade target:** เปิดแอปแล้วใช้งานได้ — ไม่ใช่แค่ API 200

| Step | Expected | Route / evidence |
|------|----------|------------------|
| 1 | Page loads < 3s | \`/m/home\` |
| 2 | Products visible | \`loadHomeProductsWithStatus()\` |
| 3 | No console errors | Playwright console |
| 4 | **Skeleton** ภายใน **< 200ms** — ไม่ใช่จอดำ | \`loading.tsx\` → \`AxsMarketplaceHomeLoading\` \`data-testid=home-skeleton\` |
| 5 | **Empty state** เมื่อ API ล่ม — แสดง **กำลังเชื่อมต่อข้อมูล** + **ลองใหม่** ไม่ใช่ 500 | \`AxsHomeProductsClient\` · dev: \`?pv_test=empty\` |
| 6 | **Offline** — แสดง cache หรือ offline page | \`sessionStorage\` + \`sw.js\` shell |
| 7 | **Recover** — กลับ online แล้ว refresh เอง ไม่ต้อง F5 | \`online\` event → \`router.refresh()\` |
| 8 | **Accessibility** — font ไม่แตก · ปุ่มกดได้ · screen reader · contrast | axe / Playwright a11y · WCAG baseline |
| 9 | **Slow network** — 3G / Edge / 400ms latency · UX ยังใช้ได้ | CDP network throttle |
| 10 | **Massive data** — 10 / 100 / 5,000 สินค้า · scroll ลื่น | \`?pv_test=massive=N\` (dev) |
| 11 | **Telemetry** — load/render/retry/error/cache_hit → Analytics | \`POST /api/experience/telemetry\` |
| 12 | **AI Observation** — Jarvis สังเกต anomaly ให้ทีม dev | \`POST /api/experience/observation\` |

**Experience Score (S001 current):**

| Speed | Clarity | Recovery | Smoothness | Confidence | **Total** |
|-------|---------|----------|------------|------------|-----------|
| 8.5 | 10 | 10 | 8 | 9 | **9.1 / 10** |

| Business | Time Saved |
|----------|------------|
| 🟢 สูง | **18 นาที** / session |

**Grading:** 🟡 Functional Pass → 🟢 Production เมื่อ steps 8–12 ผ่านบน prod + Experience ≥ 9.0

### S002 — Find & decide (ไม่ใช่แค่ "ค้นหาเจอ")

**Mission statement:** ผู้ใช้สามารถค้นหาสิ่งที่ต้องการและตัดสินใจได้ภายในเวลาที่เหมาะสม

| Step | Expected | Route / evidence |
|------|----------|------------------|
| 1 | ค้นหาจากชื่อสินค้า — ได้ผลที่เกี่ยวข้อง | \`/m/search?q=...\` |
| 2 | คำสะกดผิดเล็กน้อย — ยังเจอ (ถ้าระบบรองรับ) | fuzzy / fallback catalog |
| 3 | ไม่มีผลลัพธ์ — แนะนำคำค้นหรือหมวดหมู่ (ไม่ใช่ blank) | empty state UX |
| 4 | กรองหมวด / ราคา / จัดส่ง / COD ได้ | filter chips |
| 5 | เรียงลำดับได้ (relevant, price, rating) | sort tabs |
| 6 | กดเข้าหน้าสินค้าได้ | \`/m/product/[id]\` |
| 7 | กลับจาก PDP — ผลค้นหา + scroll position ยังอยู่ | history / state |
| 8 | Jarvis / AI แนะนำสินค้าที่เกี่ยวข้อง (ถ้าเปิด AGK) | optional · M-050 overlap |
| 9 | Slow network — ค้นหายังตอบสนอง | throttle |
| 10 | Telemetry + Experience Score สำหรับ Search | \`surface=search\` |

**Experience Score target:** Search ≥ 8.5 / 10

### S003 — Product detail

| Step | Expected | Route |
|------|----------|-------|
| 1 | Product info loads | \`/m/product/[id]\` |
| 2 | Add to cart enabled | — |

### S004 — Add to cart

| Step | Expected | Route |
|------|----------|-------|
| 1 | Item in cart | BFF POST cart |
| 2 | Cart count updates | — |

### S005 — View cart

| Step | Expected | Route |
|------|----------|-------|
| 1 | Line items match | \`/m/cart\` |
| 2 | Totals correct | — |

### S006 — Checkout start

| Step | Expected | Route |
|------|----------|-------|
| 1 | Address/shipping shown | \`/m/checkout\` |
| 2 | Can proceed | — |

### S007 — Place order

| Step | Expected | Route |
|------|----------|-------|
| 1 | 200 + order id | \`POST /api/checkout/place\` |
| 2 | **Note stack** | v2 BFF vs v1 — ISSUE-P0-01 |

### S008–S010 — Payment flow

| Step | Expected | Route |
|------|----------|-------|
| Payment UI | QR / method shown | \`/m/checkout/payment\` |
| Verify | Status paid | \`/api/checkout/payment/verify\` |
| Result | Success screen | \`/m/checkout/payment/result\` |

### S011–S015 — Post-purchase

| Step | Expected | Route |
|------|----------|-------|
| Orders list | New order visible | \`/m/orders\` |
| Track | Timeline events | \`/m/orders/[id]/track\` |
| Review | Submitted | \`/api/reviews\` |
| Dispute | Sheet opens | UI sheet |
| Promo | Valid code applies | \`/api/promo/validate\` |

---

## AGK note (Wave 3)

M-001 does **not** require Jarvis. AGK headers only if user invokes Jarvis during search (optional M-050 overlap).
`,

'023-wave-1-m002-food-ordering.md': `${HDR('023 — Wave 1 Mission Detail: M-002 Food Ordering')}

**Mission:** M-002 · **Role:** Food user · **Priority:** P0 · **Scenarios:** S016–S025

## Journey map

\`\`\`
S016 Food home → S017 Menu → S018 Add item → S019 Cart → S020 Checkout
  → S021 Place → S022 Track → S023 Map → S024 Rider chat → S025 Review
\`\`\`

---

## Key evidence paths

| Step | Path |
|------|------|
| Food home | \`aqond-v2/apps/storefront/app/m/food/page.tsx\` |
| Menu | \`app/m/food/[id]/page.tsx\` |
| Checkout | \`app/m/food/checkout/page.tsx\` |
| Tracking | \`app/m/food/track/[orderId]/page.tsx\` |
| Backend | \`aqond-v2/services/food-svc/\`, \`dispatch-svc\` |

---

## Cross-mission dependencies

| Depends on | Mission |
|------------|---------|
| Auth | M-003 (S026–S032) if login required |
| Payment | M-005 (S038–S042) |
| Notification | M-006 (order updates) |
| Rider | M-020 (Wave 2) — tracking only in Wave 1 |

---

## Pre-flight warnings

- **ISSUE-P0-01:** Food checkout may use BFF → confirm v2 path in tracker \`log\` column
- **ISSUE-P0-02:** Rider chat (S024) — test UI only; do not security-sign-off rider APIs in Wave 1
`,

'030-wave-2-index.md': `${HDR('030 — Wave 2 Index (P1) — Missions only')}

**Scenario range:** S051–S115 (expand when Wave 1 exit criteria met)

| Mission | Role | Scenarios | Focus |
|---------|------|-----------|-------|
| M-010 | Merchant | S051–S062 | Shop, menu, orders, accept |
| M-011 | Food merchant | S063–S072 | Menu bulk, hours, food orders |
| M-012 | Merchant | S073–S078 | Wallet, withdraw, fees |
| M-013 | Merchant | S079–S085 | Ad studio, AIVOS |
| M-020 | Rider | S086–S098 | **Requires ISSUE-P0-02 fix** |
| M-021 | Rider | S099–S105 | Active delivery, voice |
| M-030 | Talent | S106–S115 | v1 mobile job board |

**Gate:** Wave 1 ≥ 90% ✅ · Rider auth merged · Merchant staff RBAC verified
`,

'040-wave-3-index.md': `${HDR('040 — Wave 3 Index (P2)')}

**Scenario range:** S116–S158

| Mission | Role | Focus |
|---------|------|-------|
| M-040 | Admin Nexus | RBAC, KYC, finance, food admin |
| M-041 | Admin break-glass | \`/m/admin\` |
| M-050 | Jarvis | AGK headers, Sprint 35 regression + manual |
| M-051 | Merchant AI | Assistant API |
| M-060 | Analytics/CRM | Shop chat, events |

**Gate:** AGK confidence ≥ 99 (055) · Wave 2 complete
`,

'050-wave-4-index.md': `${HDR('050 — Wave 4 Index (P3)')}

**Scenario range:** S159–S195+

| Mission | Focus |
|---------|-------|
| M-070 | Cross-flow: marketplace → wallet → payment → notify |
| M-071 | Failure, refund, recovery |
| M-072 | Offline, ai-core down, edge cases |
| M-080 | Guardian: intent, mission replay, chaos drill |

**Gate:** Service Mesh 4B or documented interim · AGK gates signed
`,

'024-experience-score-framework.md': `${HDR('024 — Experience Score Framework')}

## ทำไมต้องมีชั้นนี้

ผู้บริหารไม่อ่าน 2,000 test cases — แต่อ่าน Dashboard ได้ในไม่กี่วินาที:

\`\`\`
Home Experience     9.4
Search              8.9
Checkout            9.7
Merchant Dashboard  9.1
\`\`\`

## โครงสร้าง

\`\`\`
Mission (M-001 Marketplace)
  └── Scenario (S001 Open Home)
        └── Step (1–12 atomic checks)
              └── Experience Score (rollup per scenario)
                    └── Business Impact + Time Saved
\`\`\`

## 5 มิติ (0–10)

| มิติ | วัดจาก | ตัวอย่าง S001 |
|------|--------|----------------|
| **Speed** | load_ms, TTFB, skeleton paint | <3s = 10 · dev cold = 8.5 |
| **Clarity** | empty state, labels, ไม่ 500 | กำลังเชื่อมต่อข้อมูล = 10 |
| **Recovery** | retry, offline, auto-refresh | router.refresh = 10 |
| **Smoothness** | scroll FPS, massive data | 100 items = 10 · 5000 = 7.5 |
| **Confidence** | console errors, a11y, contrast | no fatal errors = 9 |

**สูตร:** \`Experience Score = round(avg(5 dims), 1)\`

## เกณฑ์ Production

| Score | Grade |
|-------|-------|
| ≥ 9.0 | 🟢 Production Pass |
| 8.0–8.9 | 🟡 Functional Pass |
| 6.0–7.9 | 🟠 Needs Fix |
| < 6.0 | 🔴 Blocker |

## Telemetry → Score (อัตโนมัติ)

ทุก scenario ส่งผ่าน \`POST /api/experience/telemetry\`:

| Field | ใช้คำนวณ |
|-------|----------|
| load_ms | Speed |
| render_ms | Speed |
| retry | Recovery (ลดถ้า retry สูง) |
| error | Confidence, Clarity |
| cache_hit | Recovery |
| product_count | Smoothness |

## Jarvis AI Observation (Step 12)

Jarvis ไม่ต้องตอบลูกค้าตลอด — แต่ **สังเกต** และรายงานทีม dev:

- "วันนี้ Home โหลดเฉลี่ย 4.2s สูงกว่าเมื่อวาน 18%"
- "ผู้ใช้ 12% กด Retry ในหน้า Home"
- "Android รุ่นนี้ crash มากผิดปกติ"

\`POST /api/experience/observation\` · \`GET ?surface=home\` (dev digest)

## Dashboard (PV-3 target)

| Column | Description |
|--------|-------------|
| scenario_id | S001 |
| experience_score | 9.1 |
| speed … confidence | 5 dims |
| scenario_grade | 🟢🟡🟠🔴 |
| business_impact | critical / high / medium / low |
| time_saved_minutes | baseline per session |
| trend_7d | ↑ ↓ → |

See also: \`pv-3/010-executive-dashboards.md\` (Mission Health · Time Saved · Automation · AGK)
`,
};

Object.entries(files).forEach(([name, body]) => w(name, body));

// Link from PV-1
const link = `${HDR('PV-2 Entry Point').replace('# PV-2 Entry Point', '# Platform Validation — PV-2')}

Phase PV-2 Progressive documentation lives in \`docs/platform-validation/pv-2/\`.

Start: [000-pv2-overview.md](./pv-2/000-pv2-overview.md)
`;
fs.appendFileSync(path.join(ROOT, 'docs', 'platform-validation', '000-program-overview.md'), `\n---\n\n## PV-2\n\nSee \`pv-2/000-pv2-overview.md\`.\n`);

console.log(`\nAQOND PV-2 Progressive docs generated in docs/platform-validation/pv-2/`);
