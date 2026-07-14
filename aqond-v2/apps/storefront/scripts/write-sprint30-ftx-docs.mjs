#!/usr/bin/env node
/**
 * One-shot writer for Sprint 30 FTX planning docs (AQOND-OS).
 * Usage: node apps/storefront/scripts/write-sprint30-ftx-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');
const osDir = path.join(root, 'docs', 'aqond-os');
const productsDir = path.join(osDir, 'products');

fs.mkdirSync(productsDir, { recursive: true });

const ARCH = `# Sprint 30 — AQOND First-Time Experience (FTX)

**Status:** PLAN — Architecture First (no production code)
**Date:** 2026-07-01
**Owner:** Storefront \`/m/*\` + extension APIs + nexus-admin FTX dashboard

---

## Mission

Build **AQOND First-Time Experience (FTX)** as the default entry experience.

- Users land on **Theme V2 Home** (\`/m/home\`) immediately — not \`app.aqond.com/#/welcome\`
- Legacy Welcome becomes an **overlay** inside Home (dismissible, guest-safe)
- **Guest browsing** enabled; auth only when an action requires it
- **Reuse** existing Jarvis, growth engine, onboarding intent, analytics — **no duplicate systems**

---

## Iron Rules

| DO NOT | DO |
|--------|-----|
| Recreate Marketplace, Food, Jobs, Wallet, AI | Extend storefront \`/m/home\` + overlays |
| New parallel auth system | Reuse \`/m/login\`, \`/m/register\`, OTP |
| Duplicate Jarvis / AI Director | Extend \`JarvisFab\`, \`/api/ai/jarvis\` |
| Replace stable module routes | Add query flags + extension tables only |
| Third-party analytics | AQOND Analytics + growth intent pipeline |
| Break \`/m/food\`, \`/m/services\`, \`/m/merchant\` | Feature-flag FTX layers |

---

## Dependency Map

\`\`\`
app.aqond.com ──handoff──► /m/home?ftx=1
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   FtxHomeShell        FtxWelcomeOverlay      FtxDiscoverCards
         │                    │                    │
         ├─ TtHomeSearchBar   └─ dismiss           └─ existing /m/* routes
         ├─ JarvisFab (reuse)
         ├─ ContextualHomeBanner (reuse)
         └─ FtxHomePersonalizer ◄── user_ftx_preferences
                    ▲
         FtxSmartEntryWizard (/m/ftx/wizard)
                    │
         /m/login · /m/register (reuse)
\`\`\`

---

## Reuse Report

| Capability | Existing asset | FTX usage |
|------------|----------------|-----------|
| Theme V2 Home | \`app/m/home/page.tsx\`, \`marketplace-axs.css\` | Phase 1 shell |
| Search | \`TtHomeSearchBar\` | Center nav |
| Guest browse | \`/m/home\`, \`/m/feed\`, \`/m/food\` | Default entry |
| Login / Register | \`/m/login\`, \`/m/register\` | Wizard trigger |
| Smart entry | \`/m/onboarding/intent\` | Phase 2 expand |
| Compass | \`compassOnboarding.js\` | Interest → route map |
| Jarvis | \`JarvisWhenNotEmbed\`, \`/api/ai/jarvis\` | Phase 4 auto-greet |
| AI prefs | \`user_ai_preferences\` | Phase 7 memory |
| Growth | \`ContextualHomeBanner\`, intent dwell | Phase 3 ordering |
| Analytics | \`growthEngine\`, \`analytics/server.js\` | Phase 8 funnel |
| Admin | \`nexus-admin-core\` | Phase 9 dashboard |
| Components | \`@aqond/components\` | Phase 10 DNA |

**NOT recreating:** catalog APIs, food-svc, wallet, jobs backend, new tab nav, new AI runtime.

---

## API Impact

### New BFF (additive)

- \`GET /api/ftx/state\` — merge guest local + server prefs
- \`POST /api/ftx/preferences\` — wizard answers (auth optional)
- \`POST /api/ftx/events\` — funnel events
- \`GET /api/ftx/discover\` — discover card ordering
- \`GET /api/admin/ftx/dashboard\` — admin metrics

### Extended (optional fields only, payload diff = 0)

- \`/api/ai/user-preferences\` — \`context_json.ftx_memory\`
- \`/api/growth/home-personalized\` — \`ftx_primary_interest\` hint
- \`/api/ai/jarvis\` — \`ftx_context\` session blob

---

## Database Impact

**Extension tables only** (migration \`038_ftx.sql\`):

- \`commerce.user_ftx_preferences\` — wizard, tour, interests, referral
- \`commerce.ftx_events\` — append-only analytics

**Existing:** \`user_ai_preferences.context_json\` gains \`ftx_memory\` key (no DDL).

**Guests:** \`localStorage\` \`aqond_ftx_guest_v1\` → merge on login.

---

## Routing Impact

| Current | Target |
|---------|--------|
| \`#/welcome\` | \`/m/home?ftx=1\` via handoff |
| \`/m/home\` | FTX shell wrapper |
| All other \`/m/*\` | **Unchanged** |

**New routes:** \`/m/ftx/wizard\`, \`/m/ftx/tour\` (optional replay)

---

## Implementation Phases

| Phase | Deliverable |
|-------|-------------|
| 0 | Entry redirect / handoff config |
| 1 | Home shell + header + guest browse + Welcome overlay |
| 2 | Smart Entry Wizard → \`user_ftx_preferences\` |
| 3 | Personalized home module ordering |
| 4 | Jarvis auto-greet + context wiring |
| 5 | Guided tour (skippable, stored) |
| 6 | Discover cards → existing routes |
| 7 | AI memory via \`context_json\` + intent dwell |
| 8 | FTX analytics events |
| 9 | nexus-admin FTX dashboard |
| 10 | @aqond/components DNA compliance |

### Sub-sprints

30a arch+DB+flag · 30b home+wizard · 30c personalize+tour · 30d jarvis+memory · 30e analytics+admin · 30f rollout

---

## Migration Plan

1. Ship behind \`NEXT_PUBLIC_FTX=1\`
2. Staging regression (all verticals + FTX)
3. Optional mobile welcome → handoff redirect
4. Prod enable + monitor funnel

**Rollback:** flag off → instant revert to Sprint 27 home.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Mobile auth break on redirect | Keep \`/welcome\` fallback |
| Jarvis annoyance | Session + tour guards |
| Guest/server prefs drift | Merge API on login |
| Scope creep to mobile rewrite | Storefront-only 30a–c |

---

## Regression Plan

Extend smoke tests:

- Baseline 28/28 services + all \`/m/*\` verticals
- \`/m/home?ftx=0\` and \`?ftx=1\` → 200
- Guest unauthenticated browse OK
- Login → wizard → valid existing route
- Zero regression on \`/m/merchant\`, \`/m/rider\`, \`/m/services\`

---

**Awaiting approval before Sprint 30a production code.**

---

## Phase Detail (from product spec)

### Phase 1 — Home Experience

Header: Logo (left) | Search center | Notifications, Language, Login, Register (right). Guest browsing enabled. Wrap existing \`app/m/home/page.tsx\` content in \`FtxHomeShell\`.

### Phase 2 — Smart Entry Wizard

Collect: birth date, email, referral, country, language, referral source (Google/TikTok/Facebook/Friend/YouTube/Instagram/Ads/Other), then multi-select interests (store, food merchant, rider, marketplace, food order, talent, hire, services, travel/party companion, courses, videos, feeds, AI ads, product images, resume, other). Store in \`user_ftx_preferences\` without blocking auth.

### Phase 3 — Personalized Home

Reorder home modules by primary_interest: food-first, merchant-first, rider-first, talent-first, customer recommendations.

### Phase 4 — Jarvis

Reuse \`JarvisFab\`. Auto-greet on first visit. Context: profile, history, page, products, orders, wallet, marketplace, food, jobs, AI Director, merchant, analytics.

### Phase 5 — Guided Tour

Spotlight tour over marketplace, food, wallet, merchant, jobs, courses, AI, video feed, settings, admin. Skippable. \`tour_completed_at\` stored.

### Phase 6 — Discovery Cards

Start Selling, Order Food, Become Rider, Watch Videos, Create AI Ads, Open Store, Create Resume, Generate Images, Become Merchant — all link to existing routes.

### Phase 7 — AI Memory

Extend \`context_json.ftx_memory\`: favorite products, merchants, restaurants, jobs, categories, payment, language, services, AI tools. Use intent dwell signals.

### Phase 8 — Analytics

Events: first_launch, tutorial_started/completed, interest_selected, referral, login_conversion, registration_conversion, feature_usage, jarvis_usage. Via \`ftx_events\` + growth pipeline.

### Phase 9 — Admin (nexus-admin-core)

New view: AQOND FTX Dashboard — daily new users, tutorial completion, referral sources, interests, AI usage, conversion funnel, guest vs registered, retention.

### Phase 10 — AQOND DNA

All FTX UI via \`@aqond/components\` + AXS tokens. Unified spacing, cards, typography, animations, colors, buttons, icons.
`;

const PRODUCT = `# Product — AQOND First-Time Experience (FTX)

**Sprint:** 30 | **Surface:** \`/m/home\` + overlays | **Status:** Plan only

FTX is the default front door — an experience layer over Market, Food, Services, Brain, Pay, Community.

## Flows

**Guest:** /m/home → Welcome overlay (skip OK) → browse → Jarvis → optional tour → login when needed

**Register/Login:** existing auth → Smart Entry Wizard → user_ftx_preferences → personalized home

## Interest routes (existing /m/* only)

Food /m/food · Merchant /m/merchant/shops · Rider /m/rider/signup · Talent /m/services · Videos /m/feed · AI Ads /m/merchant/ad-video

Full architecture: ../SPRINT_30_FTX_ARCHITECTURE.md
`;

fs.writeFileSync(path.join(productsDir, 'ftx.md'), PRODUCT);
fs.writeFileSync(path.join(osDir, 'SPRINT_30_FTX_ARCHITECTURE.md'), ARCH);
console.log('wrote SPRINT_30_FTX_ARCHITECTURE.md');

// Patch OS docs
const today = '2026-07-01';

const status = `# CURRENT STATUS

**Date:** ${today}

## Sprint focus

| Sprint | Status |
|--------|--------|
| 28 Services AXS migration | **COMPLETE** (28a–28i) |
| 29 Component Registry | **COMPLETE** (\`@aqond/components\`) |
| **30 FTX** | **PLAN** — architecture approved, no code yet |

## Platform verticals (storefront AXS)

| Vertical | Route | Theme V2 |
|----------|-------|----------|
| Marketplace + FTX target | /m/home | Done (FTX extends) |
| AQOND Food | /m/food | Done |
| AQOND Rider | /m/rider | Done |
| AQOND Merchant | /m/merchant | Done |
| AQOND Admin | /m/admin | Done |
| AQOND Services | /m/services | Done (Sprint 28) |

## FTX planning artifacts

- docs/aqond-os/SPRINT_30_FTX_ARCHITECTURE.md
- docs/aqond-os/products/ftx.md

## Admin

- Primary: nexus-admin (:3002)
- FTX dashboard: planned Phase 9 (Sprint 30e)
`;

const next = `# NEXT TASK

**Updated:** ${today}

## Active: Sprint 30 — FTX (Planning complete → await approval)

### Before any production code

1. Review SPRINT_30_FTX_ARCHITECTURE.md
2. Approve migration 038_ftx.sql schema
3. Approve mobile entry redirect strategy (handoff vs nginx)

### Sprint 30a (first code sprint)

1. Feature flag \`NEXT_PUBLIC_FTX\`
2. Migration \`038_ftx.sql\` (extension tables only)
3. BFF stubs: /api/ftx/state, /api/ftx/preferences, /api/ftx/events
4. No UI until 30b

**Rules:** Reuse only. No duplicate APIs. No route removals.
`;

const session = `# SESSION

**Updated:** ${today}
**Sprint:** 30 FTX — Architecture / Planning

## Resume point

Sprint 30 planning deliverable complete. **Do not write production code** until 30a approved.

## Completed this session

- SPRINT_30_FTX_ARCHITECTURE.md (dependency map, reuse, API/DB/routing, risks, regression)
- products/ftx.md
- AQOND-OS status docs updated

## Next

Sprint 30a: feature flag + DB migration + BFF stubs (after human approval)
`;

fs.writeFileSync(path.join(osDir, 'CURRENT_STATUS.md'), status);
fs.writeFileSync(path.join(osDir, 'NEXT_TASK.md'), next);
fs.writeFileSync(path.join(osDir, 'SESSION.md'), session);
console.log('patched CURRENT_STATUS, NEXT_TASK, SESSION');

// Append DECISION
const decisionsPath = path.join(osDir, 'DECISIONS.md');
let dec = fs.existsSync(decisionsPath) ? fs.readFileSync(decisionsPath, 'utf8') : '# DECISIONS\n\n';
if (!dec.includes('ADR-FTX-001')) {
  dec += `\n## ADR-FTX-001 — FTX as storefront experience layer (${today})\n\n**Status:** Proposed (planning)\n\n**Decision:**\n- FTX lives on storefront /m/home as overlay + wizard layer\n- No duplicate product backends\n- Extension tables only: user_ftx_preferences, ftx_events\n- Welcome becomes FtxWelcomeOverlay, not route deletion\n- mobile/ unchanged in Sprint 30a–c; entry redirect via handoff optional Phase 0\n\n**Doc:** products/ftx.md, SPRINT_30_FTX_ARCHITECTURE.md\n`;
  fs.writeFileSync(decisionsPath, dec);
  console.log('appended ADR-FTX-001');
}

// Patch ROADMAP
const roadmapPath = path.join(osDir, 'ROADMAP.md');
if (fs.existsSync(roadmapPath)) {
  let rd = fs.readFileSync(roadmapPath, 'utf8');
  if (!rd.includes('Sprint 30')) {
    rd = rd.replace('## Upcoming', '## Upcoming\n\n### Sprint 30 — FTX (First-Time Experience)\n- Plan: docs/aqond-os/SPRINT_30_FTX_ARCHITECTURE.md\n- Guest home, Smart Entry Wizard, Jarvis greet, guided tour, admin funnel\n');
    fs.writeFileSync(roadmapPath, rd);
    console.log('patched ROADMAP');
  }
}

// Patch KNOWLEDGE_INDEX
const kiPath = path.join(osDir, 'KNOWLEDGE_INDEX.md');
if (fs.existsSync(kiPath)) {
  let ki = fs.readFileSync(kiPath, 'utf8');
  if (!ki.includes('products/ftx.md')) {
    ki += '\n| FTX (First-Time Experience) | docs/aqond-os/products/ftx.md | Sprint 30 |\n';
    fs.writeFileSync(kiPath, ki);
    console.log('patched KNOWLEDGE_INDEX');
  }
}

// Patch MASTER_BLUEPRINT
const bpPath = path.join(osDir, 'MASTER_BLUEPRINT.md');
if (fs.existsSync(bpPath)) {
  let bp = fs.readFileSync(bpPath, 'utf8');
  if (!bp.includes('FTX')) {
    bp += '\n\n## FTX Layer (Sprint 30+)\n\nExperience orchestration on `/m/home`: Welcome overlay, Smart Entry Wizard, personalized modules, Jarvis greet, guided tour. Extension tables only. See products/ftx.md.\n';
    fs.writeFileSync(bpPath, bp);
    console.log('patched MASTER_BLUEPRINT');
  }
}

console.log('done');
