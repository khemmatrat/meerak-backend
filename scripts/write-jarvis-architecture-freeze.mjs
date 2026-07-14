#!/usr/bin/env node
/**
 * Architecture Freeze — AQOND Jarvis + Super App
 * Docs only. No production code.
 * Usage: node scripts/write-jarvis-architecture-freeze.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OS = path.join(ROOT, 'docs', 'aqond-os');
const JARVIS = path.join(OS, 'products', 'jarvis');
const ARCH = path.join(OS, 'architecture');
const TODAY = new Date().toISOString().slice(0, 10);

function write(rel, content) {
  const full = path.join(OS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('wrote:', rel);
}

// ─── JARVIS_ARCHITECTURE.md ───────────────────────────────────────────────
write('products/jarvis/JARVIS_ARCHITECTURE.md', `# AQOND Jarvis — Architecture (Architecture Freeze)

**Status:** FROZEN — architecture only, no production code in this sprint  
**Date:** ${TODAY}  
**Owner:** AQOND-OS / Brain / Experience Engine  
**Principle:** Language Intelligence Layer between User and LLM — never train AI per language in isolation.

---

## Mission

Jarvis is the **unified AI gateway** for AQOND Super App: concierge, orchestrator, and proactive assistant across Food, Marketplace, Services, Wallet, Merchant, Rider, and AI Director workflows.

**Iron rules (freeze):**
- Reuse existing \`ai-core\`, \`backend/lib/aivos\`, Experience Engine, Event streams — **no parallel Jarvis runtime**
- **Zero breaking changes** to \`POST /api/ai/jarvis\`, \`POST /v1/jarvis/concierge\`, AIVOS Director routes
- New capability ships as **additive layers** behind feature flags
- **No translate-then-think** — native-language reasoning per locale (Layer 5)
- Provider-agnostic LLM routing (existing Ollama/Hermes/Grok paths)

---

## Target stack (10 layers)

\`\`\`
User
  │
  ▼
Jarvis Gateway          ← storefront JarvisFab + POST /api/ai/jarvis (existing)
  │
  ▼
Language Intelligence   ← NEW Sprint 31 (detect lang/country/tone/formality/intent)
  │
  ├── Detect Language (20–50ms, no user picker)
  ├── Detect Country / timezone / currency
  ├── Detect Tone + Formality + Emotion (Layer 4/6)
  ├── User Preference Memory (Layer 3)
  │
  ▼
Conversation Brain      ← session + product context assembly (extend localJarvis + ai-core)
  │
  ▼
LLM (native locale prompt)   ← ai-core / Hermes / rules fallback
  │
  ▼
Natural Response Engine ← persona + style guardrails (Layer 9)
  │
  ▼
Localized Response      ← regional persona (Layer 2)
\`\`\`

---

## Current state (repository audit)

| Component | Location | Status |
|-----------|----------|--------|
| Jarvis Gateway (BFF) | \`aqond-v2/apps/storefront/app/api/ai/jarvis/route.ts\` | **Production** |
| Jarvis brain (LLM) | \`aqond-v2/infra/ai-core/lib/prompts/jarvis-concierge.js\` | **Production** (Thai-centric JSON) |
| Rules fallback | \`aqond-v2/apps/storefront/lib/server/localJarvis.ts\` | **Production** |
| UI | \`components/jarvis/JarvisFab.tsx\`, \`JarvisWhenNotEmbed.tsx\` | **Production** |
| Session (client) | \`lib/jarvis/session.ts\` → localStorage | **Short memory only** |
| User AI prefs | \`commerce.user_ai_preferences\` (037) | **jarvis_locale, context_json** |
| Experience profile | \`commerce.user_experience_profiles\` (038) | **language, intent, context_json** |
| Proactive greet | \`GET /api/experience/jarvis-brief\` | **Stub + FTX integration** |
| AI Director | \`backend/lib/aivos/merchant-ad/director/\` | **Separate orchestrator** (merchant ads) |
| AI Memory stub | \`backend/lib/experience/aiMemoryEngine.js\` | **Stub** |
| i18n | \`lib/i18n.tsx\` | **Partial** (th-TH default, no catalog) |

---

## New modules (planned — additive only)

| Module | Sprint | Package |
|--------|--------|---------|
| Language Intelligence Engine | 31 | \`backend/lib/jarvis/languageIntelligence.js\` + ai-core pre-processor |
| Conversation Memory Engine | 32 | Extend \`user_ai_preferences.context_json\` + optional \`jarvis_conversation_memory\` |
| Regional Persona Engine | 33 | \`backend/lib/jarvis/personas/\` + prompt library per region |
| Recommendation & Proactive | 34 | Wire Experience + growth + product context |
| Voice & Multilingual | 35 | \`aqond-v2/voice/\` + STT/TTS locale matrix |

**Gateway insertion point:** Between \`jarvis/route.ts\` and \`aiCoreApi('/v1/jarvis/concierge')\` — enrich \`context\` object; do not change response schema for existing clients.

---

## Compatibility matrix (products)

See [JARVIS_CONTEXT_ENGINE.md](./JARVIS_CONTEXT_ENGINE.md) for per-product context.  
See [../../architecture/SUPER_APP_DOMAIN_BOUNDARIES.md](../../architecture/SUPER_APP_DOMAIN_BOUNDARIES.md) for domain ownership.

| Product | Current Jarvis touch | Breaking risk | Reuse |
|---------|---------------------|---------------|-------|
| Marketplace | search, compare, place_order | Low | ai-core tools, catalog BFF |
| Food | feed_food_*, track_order | Low | foodFeedBridge, jarvisContext |
| Merchant | merchant-assistant (separate) | Low | Hermes tools, merchant_ai_sessions |
| Rider | rider-voice (separate) | Low | rider_ai_sessions |
| Wallet | none direct | Medium | userCommerceEvents, wallet BFF |
| Services/MatchJob | none | Medium | /api/jobs proxy |
| Job Board | none | Medium | advanceJobProxy |
| Booking | none | Medium | bookingProxy |
| Course | none | Low | course funnel events |
| Video/Feed | feed_context | Low | feedContext.tsx |
| AI Director | separate API | **None** | orchestrator.js — Jarvis **triggers**, does not replace |
| Pay | none | High (financial) | read-only context only |
| Admin | FTX dashboard | Low | /api/admin/ftx/dashboard |
| CRM | admin notes | Low | read-only |

---

## Dependency map

\`\`\`
JarvisFab
  → POST /api/ai/jarvis
      → loadJarvisActiveOrders (jarvisContext)
      → enrichFeedContextForFood
      → [NEW] languageIntelligence.enrich()
      → ai-core POST /v1/jarvis/concierge
          → [NEW] persona prompt selector
          → LLM / ruleBasedJarvis
      → patch session → client

Proactive path (parallel):
  Experience Engine → jarvis-brief → FtxJarvisGreet → JarvisFab event

Orchestrator path (future):
  Jarvis intent "promote restaurant"
    → AI Director POST /api/aivos/merchant-ad/director/plan
    → director/run → merchant dashboard
\`\`\`

---

## Feature flags (proposed)

| Flag | Layer |
|------|-------|
| \`AIVOS_JARVIS_LANG_INTEL=1\` | Layer 1 |
| \`AIVOS_JARVIS_PERSONA=1\` | Layer 2 |
| \`AIVOS_JARVIS_MEMORY=1\` | Layer 3 |
| \`AIVOS_JARVIS_TONE=1\` | Layer 4 |
| \`AIVOS_JARVIS_EMOTION=1\` | Layer 6 |
| \`AIVOS_JARVIS_PROACTIVE=1\` | Layer 8 (exists) |
| \`NEXT_PUBLIC_JARVIS_PROACTIVE=1\` | Client proactive |

Kill switch: \`AIVOS_JARVIS_KILL=1\` → rules-only \`VOICE_USE_RULES_ONLY=1\` behavior.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Fragmented event buses | Unified **envelope** in SUPER_APP_EVENT_MAP; Jarvis subscribes read-only |
| Thai-only prompts | Persona library per locale; never translate responses |
| Latency budget 20–50ms for LID | FastText/CLD3 sidecar or edge function; cache per session |
| Financial actions via chat | Tool approval gates; existing payment flows unchanged |
| Parallel memory stores | Single write path: \`context_json.jarvis_memory\` schema versioned |

---

## Sprint roadmap

| Sprint | Deliverable |
|--------|-------------|
| 31 | Language Intelligence Engine (detect + persist prefs) |
| 32 | Conversation Memory Engine (short/medium/long tiers) |
| 33 | Regional Persona Engine (10 regions Phase 1) |
| 34 | Recommendation & Proactive Assistant |
| 35 | Voice & Multilingual AI |

**This document freezes architecture. Implementation requires sprint approval.**

See also: [JARVIS_ROADMAP.md](./JARVIS_ROADMAP.md), [../../reports/JARVIS_READINESS_REPORT.md](../../reports/JARVIS_READINESS_REPORT.md)
`);

// ─── JARVIS_MEMORY.md ─────────────────────────────────────────────────────
write('products/jarvis/JARVIS_MEMORY.md', `# Jarvis Memory Engine (Layer 3)

**Status:** FROZEN — architecture only  
**Date:** ${TODAY}  
**Sprint:** 32  
**Storage:** \`commerce.user_ai_preferences.context_json\` + \`commerce.user_experience_profiles\` — **no new migration in freeze**

---

## Mission

Tiered conversation memory so Jarvis remembers preferences, recent context, and long-term habits without fragmenting stores or breaking existing clients.

---

## Memory tiers

| Tier | TTL | Storage | Contents |
|------|-----|---------|----------|
| **Short** | 15 min | Client \`lib/jarvis/session.ts\` (localStorage) + server session patch | Last search, selected product, track_order_id, feed_context |
| **Medium** | 7 days | \`context_json.jarvis_memory.medium\` | Recent intents, dismissed briefs, product affinities |
| **Long** | Years | \`context_json.jarvis_memory.long\` + \`user_experience_profiles.context_json\` | Locale prefs, dietary tags, merchant relationships |
| **Permanent** | Account lifetime | \`user_ai_preferences.jarvis_locale\`, \`user_experience_profiles.language\` | Explicit opt-in prefs only (never infer financial/legal) |

---

## Memory matrix (product × tier)

| Product | Short | Medium | Long | Permanent |
|---------|-------|--------|------|-----------|
| Food | Active cart, feed_context | Recent restaurants | Dietary prefs | None |
| Marketplace | last_search, selected_variant | Browse categories | Favorite brands | None |
| Merchant | — | Dashboard tab | Shop hours pattern | Business name |
| Rider | — | Last route context | Preferred zones | None |
| Wallet | — | — | — | **Read-only balance snapshot** (no write) |
| Services/MatchJob | — | Last job type | Skill prefs | None |
| AI Director | Campaign draft id | Recent goals | Industry tag | None |
| Super Jarvis | session.turns[] | Cross-product brief history | Lifecycle stage | jarvis_locale |

---

## Write path (single source)

\`\`\`
POST /api/ai/jarvis
  → [Sprint 32] memoryEngine.mergeTurn(session, userId)
      → read user_ai_preferences (037)
      → read user_experience_profiles (038)
      → write context_json.jarvis_memory (version: 1)
  → ai-core (prompt gets memory summary, not raw dump)
\`\`\`

**Existing stubs:** \`backend/lib/experience/aiMemoryEngine.js\` — extend, do not fork.

**Schema (frozen):**

\`\`\`json
{
  "jarvis_memory": {
    "v": 1,
    "medium": { "updated_at": "ISO", "intents": [], "dismissed_briefs": [] },
    "long": { "updated_at": "ISO", "tags": {}, "affinities": [] }
  }
}
\`\`\`

---

## Rules (freeze)

1. **No new DDL** in Architecture Freeze — use JSON columns only
2. Short memory stays client-first; server never stores full chat log in Phase 1
3. PII minimization: no payment card, no national ID in memory JSON
4. \`AIVOS_JARVIS_MEMORY=1\` gates server-side persistence
5. Kill switch clears medium only; permanent requires user settings UI (future)

---

## Dependencies

| Module | Path |
|--------|------|
| Client session | \`aqond-v2/apps/storefront/lib/jarvis/session.ts\` |
| AI prefs API | \`aqond-v2/apps/storefront/app/api/ai/user-preferences/route.ts\` |
| Experience prefs | \`POST /api/experience/preferences\` |
| Memory stub | \`backend/lib/experience/aiMemoryEngine.js\` |
| Migration 037 | \`aqond-v2/infra/postgres/migrations/037_tier3_ai.sql\` |
| Migration 038 | \`aqond-v2/infra/postgres/migrations/038_experience_engine.sql\` |

See [JARVIS_CONTRACTS.md](./JARVIS_CONTRACTS.md) § Memory Matrix.
`);

// ─── JARVIS_LANGUAGE_ENGINE.md ────────────────────────────────────────────
write('products/jarvis/JARVIS_LANGUAGE_ENGINE.md', `# Jarvis Language Intelligence Engine (Layers 1 + 5)

**Status:** FROZEN  
**Date:** ${TODAY}  
**Sprint:** 31  
**Budget:** 20–50ms detection — **no user language picker**

---

## Mission

Detect language, country, tone, and formality **before** LLM invocation. Reason and respond in the user's native language — **never translate-then-think**.

---

## Phase-1 countries (11)

| Code | Country | Primary locale | Script | Currency | TZ |
|------|---------|----------------|--------|----------|-----|
| TH | Thailand | th-TH | Thai | THB | Asia/Bangkok |
| US | United States | en-US | Latin | USD | America/New_York |
| CN | China | zh-CN | Simplified | CNY | Asia/Shanghai |
| TW | Taiwan | zh-TW | Traditional | TWD | Asia/Taipei |
| MY | Malaysia | ms-MY / en-MY | Latin | MYR | Asia/Kuala_Lumpur |
| ID | Indonesia | id-ID | Latin | IDR | Asia/Jakarta |
| SG | Singapore | en-SG | Latin | SGD | Asia/Singapore |
| LA | Laos | lo-LA | Lao | LAK | Asia/Vientiane |
| MM | Myanmar | my-MM | Myanmar | MMK | Asia/Yangon |
| BN | Brunei | ms-BN | Latin | BND | Asia/Brunei |
| LK | Sri Lanka | si-LK / ta-LK | Sinhala/Tamil | LKR | Asia/Colombo |

---

## Detection pipeline

\`\`\`
user_message + headers (Accept-Language, x-user-id)
  → languageIntelligence.detect()  [20–50ms]
      ├── CLD3 / FastText sidecar (proposed)
      ├── Fallback: last jarvis_locale from user_ai_preferences
      ├── Geo hint: IP → country (optional, never override explicit text)
      └── Output: { lang, country, script, formality, confidence }
  → persist to context_json.language_profile (additive)
  → select native prompt pack (Layer 5)
\`\`\`

**Insertion point:** \`aqond-v2/apps/storefront/app/api/ai/jarvis/route.ts\` — enrich \`session\` before \`aiCoreApi('/v1/jarvis/concierge')\`.

---

## Native-language prompting rule (iron)

1. System prompt assembled in **detected locale** — not English with "respond in Thai"
2. Tool names stay English; tool **descriptions** localized where ai-core supports
3. Numbers, currency, dates formatted per regional matrix
4. If confidence < 0.7 → ask once in bilingual snippet, still **no settings picker**
5. Existing Thai-centric \`jarvis-concierge.js\` remains default when \`AIVOS_JARVIS_LANG_INTEL=0\`

---

## Storage (no new migration)

\`\`\`json
// user_ai_preferences.context_json.language_profile
{
  "detected_lang": "th-TH",
  "country": "TH",
  "formality": "polite",
  "last_detected_at": "ISO",
  "confidence": 0.94
}
\`\`\`

---

## Proposed module

| File | Role |
|------|------|
| \`backend/lib/jarvis/languageIntelligence.js\` | Detect + enrich |
| \`aqond-v2/infra/ai-core/lib/preprocess/languageDetect.js\` | Optional ai-core hook |

**Flag:** \`AIVOS_JARVIS_LANG_INTEL=1\`

See [JARVIS_PROMPT_LIBRARY.md](./JARVIS_PROMPT_LIBRARY.md), [JARVIS_CONTRACTS.md](./JARVIS_CONTRACTS.md) § Regional Matrix.
`);

// ─── JARVIS_PERSONAS.md ─────────────────────────────────────────────────────
write('products/jarvis/JARVIS_PERSONAS.md', `# Jarvis Regional Personas (Layers 2 + 4 + 9)

**Status:** FROZEN  
**Date:** ${TODAY}  
**Sprint:** 33

---

## Mission

Jarvis speaks like a **trusted local concierge** — human, warm, concise — never "As an AI language model…".

---

## Tone engine (Layer 4)

| Signal | Source | Effect |
|--------|--------|--------|
| Formality | Language engine | ครับ/ค่ะ vs casual |
| Lifecycle | \`lifecycleEngine.js\` | New user = guide; power user = peer |
| Product | feed_context / intent | Merchant = ops tone; Food = hungry friend |
| Emotion (Layer 6) | Keyword heuristics → future model | Empathy bump on complaints |
| Regional | Persona pack | Greeting, honorifics, festival awareness |

**Flag:** \`AIVOS_JARVIS_PERSONA=1\`, \`AIVOS_JARVIS_TONE=1\`

---

## Conversation style rules

1. **Human not AI** — no bullet lectures unless user asks for list
2. Short turns on mobile; max 3 sentences default
3. Proactive but not spammy (respect dismissed briefs in memory)
4. Use local idioms from persona pack — not machine-translated English
5. Merchant/Rider personas are **role-aware** (separate entry: \`/m/merchant/assistant\`, rider-voice)

---

## Persona matrix per product

| Product | Persona name | Tone | Example opener (TH) |
|---------|--------------|------|---------------------|
| **Merchant** | Shop Partner | Professional, actionable | "วันนี้มียอดขายรอตอบ 3 ออเดอร์ครับ" |
| **Food** | Food Buddy | Casual, craving-aware | "หิวอยู่ใช่ไหมครับ มีร้านใกล้คุณเปิดอยู่" |
| **Marketplace** | Smart Shopper | Helpful comparator | "เทียบราคาให้แล้ว ตัวนี้คุ้มสุด" |
| **Wallet** | Finance Guide | Clear, cautious | "ยอดคงเหลือพร้อมใช้ครับ ไม่แตะการโอนเอง" |
| **Super Jarvis** | AQOND Concierge | Unified, context-switching | "มีทั้งอาหารกับพัสดุรออยู่ จัดให้เลยไหม" |
| Rider | Route Mate | Brief, safety-first | (rider-voice path) |
| Services | Job Helper | Formal | — |
| AI Director | Creative Partner | Strategic | Delegates to director persona |

---

## Regional persona packs (Phase 1)

One pack per country in [JARVIS_LANGUAGE_ENGINE.md](./JARVIS_LANGUAGE_ENGINE.md): greeting, honorific, payment phrasing, festival calendar hooks.

**Storage:** \`backend/lib/jarvis/personas/{country}.json\` (planned)

**Reuse:** AIVOS Director \`prompt-library/v3/languages/*.json\` pattern — structure only, not ad copy.

See [JARVIS_PROMPT_LIBRARY.md](./JARVIS_PROMPT_LIBRARY.md), [JARVIS_CONTRACTS.md](./JARVIS_CONTRACTS.md) § Persona Matrix.
`);

// ─── JARVIS_PROMPT_LIBRARY.md ─────────────────────────────────────────────
write('products/jarvis/JARVIS_PROMPT_LIBRARY.md', `# Jarvis Prompt Library

**Status:** FROZEN  
**Date:** ${TODAY}  
**Sprint:** 31–33

---

## Structure

\`\`\`
backend/lib/jarvis/prompts/
├── index.js                 # selector: locale × persona × product
├── base/
│   └── system-concierge.md  # shared guardrails
├── locales/
│   ├── th-TH/
│   │   ├── merchant.md
│   │   ├── food.md
│   │   ├── marketplace.md
│   │   ├── wallet.md
│   │   └── super.md
│   ├── en-US/
│   └── ... (11 countries)
└── tools/                   # tool description overlays per locale
\`\`\`

**Matrix key:** \`{locale}:{persona}:{product}\` → prompt file or composed blocks.

---

## Reuse (do not duplicate)

| Source | Path | Reuse |
|--------|------|-------|
| Jarvis concierge (prod) | \`aqond-v2/infra/ai-core/lib/prompts/jarvis-concierge.js\` | Base JSON schema + tools |
| Rules fallback | \`aqond-v2/apps/storefront/lib/server/localJarvis.ts\` | Thai templates |
| AI Director pattern | \`backend/lib/aivos/merchant-ad/director/data/prompt-library/v3/\` | Locale folders + provider overlays |
| Director catalog | \`prompt-catalog.v1.json\`, \`promptConfigLoader.js\` | Loader pattern only |

---

## Composition flow

\`\`\`
language_profile + persona + product
  → promptLibrary.resolve(key)
  → merge base guardrails + locale system + product overlay + memory summary
  → POST ai-core /v1/jarvis/concierge (unchanged response schema)
\`\`\`

---

## Explicit non-goals (freeze)

- **No translate pipeline** — each locale is authored natively
- No runtime Google/DeepL for system prompts
- No per-user prompt editing in Admin (Sprint 35+)

**Versioning:** \`prompt_manifest_version\` in context_json; bump on breaking prompt changes.

See [JARVIS_LANGUAGE_ENGINE.md](./JARVIS_LANGUAGE_ENGINE.md), [JARVIS_PERSONAS.md](./JARVIS_PERSONAS.md).
`);

// ─── JARVIS_CONTEXT_ENGINE.md ─────────────────────────────────────────────
write('products/jarvis/JARVIS_CONTEXT_ENGINE.md', `# Jarvis Context Engine (Layer 7)

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Mission

Assemble **just enough** product context per turn — avoid over-fetching, never break BFF contracts.

---

## Context matrix per product

| Product | Required context | Optional | APIs / modules (existing) |
|---------|------------------|----------|---------------------------|
| **Food** | feed_context, active_orders | restaurant hours | \`foodFeedBridge.ts\`, \`jarvisContext.ts\`, \`enrichFeedContextForFood\` |
| **Marketplace** | last_search, catalog hints | compare basket | ai-core tools, catalog BFF |
| **Merchant** | shop_id, open orders | ad campaigns | \`/m/merchant/assistant\`, Hermes tools |
| **Rider** | assignment state | route | rider_ai_sessions (separate) |
| **Wallet** | balance summary (read) | recent tx | wallet BFF, \`userCommerceEvents\` |
| **Pay** | — | invoice status | payment ledger (read-only) |
| **Services** | job category | provider match | \`/api/jobs\` proxy |
| **MatchJob** | active job id | escrow state | \`advanceJobProxy\` |
| **Job Board** | listing context | applications | job board routes |
| **Booking** | reservation slot | calendar | \`bookingProxy\` |
| **Course** | enrollment | progress | course funnel events |
| **Video/Feed** | feed_context | watch history | \`lib/jarvis/feedContext.tsx\` |
| **AI Director** | campaign goal | assets | \`backend/lib/aivos/merchant-ad/director/\` |
| **Analytics** | KPI snapshot | trends | \`/api/admin/ftx/dashboard\` |
| **CRM** | customer notes | tags | admin CRM (read-only) |
| **Admin** | FTX rollout | flags | \`featureGateEngine.js\` |

---

## Assembly order

\`\`\`
1. Identity (buyer_id, guest, lifecycle from experience/state)
2. Language profile (Sprint 31)
3. Memory summary (Sprint 32)
4. Product slice from matrix above
5. Proactive brief (GET jarvis-brief) if turn is greet-only
\`\`\`

**Gateway:** \`POST /api/ai/jarvis\` — extend \`session\` + \`feed_context\`; response schema frozen.

**Experience Engine:** \`GET /api/experience/state\`, \`backend/lib/experience/experienceEngine.js\`

See [../../architecture/SUPER_APP_CONTEXT_MAP.md](../../architecture/SUPER_APP_CONTEXT_MAP.md), [JARVIS_CONTRACTS.md](./JARVIS_CONTRACTS.md) § Context Matrix.
`);

// ─── JARVIS_RECOMMENDATION_ENGINE.md ──────────────────────────────────────
write('products/jarvis/JARVIS_RECOMMENDATION_ENGINE.md', `# Jarvis Recommendation Engine (Layer 8)

**Status:** FROZEN  
**Date:** ${TODAY}  
**Sprint:** 34

---

## Mission

Proactive, contextual suggestions — Jarvis speaks first with **actionable** nudges tied to real product state.

---

## Integration map

\`\`\`
Experience Engine
  ├── recommendationEngine.js  → delegates recsys
  ├── growthDecisionEngine.js  → promotions
  ├── intentEngine.js          → what to prioritize
  └── jarvis-brief route       → proactive copy

Jarvis
  ├── GET /api/experience/jarvis-brief  (storefront BFF)
  ├── FtxJarvisGreet (client)
  └── POST /api/ai/jarvis (reactive + tool calls)
\`\`\`

**Flags:** \`AIVOS_JARVIS_PROACTIVE=1\`, \`NEXT_PUBLIC_JARVIS_PROACTIVE=1\`

---

## Recommendation matrix

| Trigger | Source event | Jarvis action | Product |
|---------|--------------|---------------|---------|
| Unanswered orders | merchant.* | "ตอบลูกค้า 3 รายการ" | Merchant |
| Shop closed peak hours | merchant.hours | Suggest open shop | Merchant |
| Cart abandon | order.draft | Remind checkout | Food/Market |
| Wallet credit | wallet.credit | Notify balance | Wallet |
| Rider shortage | rider.availability | Surge hint | Food |
| Course milestone | course.progress | Congratulate + upsell | Course |
| Ad opportunity | growth.signal | Offer AI Director | AI Director |
| FTX incomplete | ftx.wizard_step | Resume wizard | Super Jarvis |

---

## Rules

1. Max 1 proactive brief per session open (dismiss → memory medium tier)
2. Recommendations are **suggestions** — no auto-pay, no auto-post
3. Growth campaigns respect \`featureGateEngine.js\` and merchant consent
4. Readiness today: **~5%** — stub brief only; matrix defines target

See [JARVIS_EVENT_INTEGRATION.md](./JARVIS_EVENT_INTEGRATION.md), [JARVIS_MEMORY.md](./JARVIS_MEMORY.md).
`);

// ─── JARVIS_EVENT_INTEGRATION.md ──────────────────────────────────────────
write('products/jarvis/JARVIS_EVENT_INTEGRATION.md', `# Jarvis Event Integration (Layer 10)

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Mission

Jarvis subscribes **read-only** to domain events — unified envelope, no new bus in freeze.

---

## Event buses (existing)

| Bus | Path | Transport |
|-----|------|-----------|
| Experience events | \`POST /api/experience/events\` | HTTP → \`experienceRoutes.js\` |
| Commerce intelligence | \`backend/lib/userCommerceEvents.js\` | Ledger + job hooks |
| AIVOS kernel | \`backend/lib/aivos/kernel/eventBus.js\` | ACP envelope (spec) |
| System audit | \`system_event_log\` | SQL |

---

## Subscribe list (Jarvis consumer)

| Pattern | Source | Use |
|---------|--------|-----|
| \`order.created\` | Commerce | Track order context |
| \`order.updated\` | Commerce | Status narration |
| \`order.completed\` | Commerce | Reorder suggest |
| \`order.cancelled\` | Commerce | Recovery tone |
| \`wallet.credit\` | Commerce | Balance brief |
| \`wallet.debit\` | Commerce | Spend awareness |
| \`merchant.order_pending\` | Merchant OS | Proactive merchant |
| \`merchant.shop_closed\` | Merchant | Hours nudge |
| \`merchant.campaign_ready\` | AIVOS Director | Ad suggest |
| \`rider.assigned\` | Rider | ETA context |
| \`rider.delayed\` | Rider | Apology template |
| \`ftx.*\` | Experience | Onboarding |
| \`experience.intent_updated\` | Experience | Home/Jarvis priority |
| \`growth.promotion_eligible\` | Growth engine | Offer surface |
| \`course.enrolled\` | Course funnel | Congrats |
| \`job.posted\` | MatchJob | Services hint |

---

## Mapping (freeze)

\`\`\`
userCommerceEvents.emitCommerceEvent(type, payload)
  → [future] jarvisEventBridge.on(type)  // read-only
      → update context_json signals (not full event log)
      → invalidate jarvis-brief cache

POST /api/experience/events { event_type }
  → experienceEngine.recordEvent
      → same bridge when AIVOS_JARVIS_PROACTIVE=1
\`\`\`

**No write-back** to order/wallet state from Jarvis events.

See [../../architecture/SUPER_APP_EVENT_MAP.md](../../architecture/SUPER_APP_EVENT_MAP.md), [JARVIS_CONTRACTS.md](./JARVIS_CONTRACTS.md) § Event Integration Matrix.
`);

// ─── JARVIS_API.md ────────────────────────────────────────────────────────
write('products/jarvis/JARVIS_API.md', `# Jarvis API Stability Review

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Principle

**Existing APIs must not break.** All Jarvis sprint work ships as **additive** endpoints, headers, and \`context\` fields behind feature flags.

---

## Frozen contracts (do not change response shape)

| Endpoint | Location | Method |
|----------|----------|--------|
| \`POST /api/ai/jarvis\` | \`aqond-v2/apps/storefront/app/api/ai/jarvis/route.ts\` | BFF |
| \`POST /v1/jarvis/concierge\` | \`aqond-v2/infra/ai-core/server.js\` | LLM brain |
| \`GET /api/experience/jarvis-brief\` | BFF + \`experienceRoutes.js\` | Proactive |
| \`POST /api/ai/user-preferences\` | storefront | AI prefs |
| \`GET/POST /api/experience/*\` | Experience stack | State/prefs/events |

---

## Proposed additive endpoints (Sprint 31+)

| Endpoint | Purpose | Breaking? |
|----------|---------|-----------|
| \`POST /api/jarvis/language-profile\` | Persist detection enrich | No — new |
| \`GET /api/jarvis/memory-summary\` | Server medium/long slice | No — new |
| \`POST /api/jarvis/brief-dismiss\` | Dismiss proactive | No — new |

Optional request fields on existing \`POST /api/ai/jarvis\`:

\`\`\`json
{
  "language_hint": null,
  "client_locale": "th-TH",
  "experience_snapshot_id": "optional"
}
\`\`\`

Ignored by old servers; consumed when flags on.

---

## Version strategy

| Layer | Version |
|-------|---------|
| BFF | Path frozen; \`jarvis_api_version: 1\` in response meta (additive) |
| ai-core | \`/v1/jarvis/concierge\` frozen; \`/v2/\` only if tools break |
| context_json | \`jarvis_memory.v\`, \`language_profile\` schema integers |
| Prompts | \`prompt_manifest_version\` in library index |

**Deprecation:** 2-sprint notice; feature flag default off before removal.

---

## Auth

Reuse storefront session + \`x-user-id\`; ai-core \`X-AI-Core-Api-Key\` unchanged.

See [JARVIS_ARCHITECTURE.md](./JARVIS_ARCHITECTURE.md), [../../architecture/SUPER_APP_AI_GATEWAY.md](../../architecture/SUPER_APP_AI_GATEWAY.md).
`);

// ─── JARVIS_ROADMAP.md ────────────────────────────────────────────────────
write('products/jarvis/JARVIS_ROADMAP.md', `# Jarvis Roadmap — Sprints 31–35

**Status:** FROZEN pending approval  
**Date:** ${TODAY}

---

## Sprint 31 — Language Intelligence Engine

**Goal:** Detect lang/country/tone in 20–50ms; native prompt selection.

| Task | Deliverable |
|------|-------------|
| 31.1 | \`languageIntelligence.js\` + unit tests |
| 31.2 | Hook \`jarvis/route.ts\` enrich (flagged) |
| 31.3 | \`POST /api/jarvis/language-profile\` BFF |
| 31.4 | Persist \`context_json.language_profile\` |
| 31.5 | ai-core pre-processor stub |
| 31.6 | 11-locale prompt skeleton (TH + EN first) |

**Exit:** TH/EN detection ≥90% on test set; zero regression on \`POST /api/ai/jarvis\`.

---

## Sprint 32 — Conversation Memory Engine

**Goal:** Short/medium/long/permanent tiers without new migration.

| Task | Deliverable |
|------|-------------|
| 32.1 | Extend \`aiMemoryEngine.js\` |
| 32.2 | \`jarvis_memory\` schema v1 in context_json |
| 32.3 | Merge turn on each jarvis POST |
| 32.4 | \`GET /api/jarvis/memory-summary\` |
| 32.5 | Client session sync rules (15 min TTL) |
| 32.6 | Docs + regression script |

**Exit:** Memory survives 7d medium tier; client short tier unchanged behavior when flag off.

---

## Sprint 33 — Regional Persona Engine

**Goal:** 11 countries, human tone, product personas.

| Task | Deliverable |
|------|-------------|
| 33.1 | \`backend/lib/jarvis/personas/\` packs |
| 33.2 | Prompt library per locale × product |
| 33.3 | Tone engine hooks (lifecycle + product) |
| 33.4 | Merchant/Food/Market/Wallet/Super selectors |
| 33.5 | Festival + etiquette tables in CONTRACTS |
| 33.6 | A/B flag \`AIVOS_JARVIS_PERSONA\` |

**Exit:** Side-by-side Thai persona vs legacy prompt; director pattern reused.

---

## Sprint 34 — Recommendation & Proactive Assistant

**Goal:** Jarvis speaks first with real signals.

| Task | Deliverable |
|------|-------------|
| 34.1 | \`jarvisEventBridge\` read-only subscriber |
| 34.2 | Enrich \`jarvis-brief\` from commerce + merchant events |
| 34.3 | Recommendation matrix implementation |
| 34.4 | \`POST /api/jarvis/brief-dismiss\` |
| 34.5 | Wire \`FtxJarvisGreet\` + growthDecisionEngine |
| 34.6 | Rate limits + dismiss memory |

**Exit:** Merchant pending-order brief live for pilot shops.

---

## Sprint 35 — Voice & Multilingual AI

**Goal:** STT/TTS locale matrix; hands-free Jarvis.

| Task | Deliverable |
|------|-------------|
| 35.1 | \`aqond-v2/voice/\` package scaffold |
| 35.2 | STT locale map (11 countries) |
| 35.3 | TTS voice per persona |
| 35.4 | Rider-voice convergence plan |
| 35.5 | Latency budget + fallback to text |
| 35.6 | Mobile handoff spec (no mobile code in sprint) |

**Exit:** Voice path behind \`AIVOS_JARVIS_VOICE=1\`; text path remains default.

---

**Implementation requires explicit sprint approval after Architecture Freeze.**
`);

// ─── JARVIS_CONTRACTS.md ──────────────────────────────────────────────────
write('products/jarvis/JARVIS_CONTRACTS.md', `# Jarvis Contracts — All Matrices

**Status:** FROZEN  
**Date:** ${TODAY}  
**Single source** for cross-product Jarvis agreements.

---

## 1. Capability Matrix

| Product | Jarvis chat | Tools | Proactive | Voice | Director trigger | Readiness |
|---------|-------------|-------|-----------|-------|------------------|-----------|
| Food | ✅ | feed_food_*, track_order | Stub | — | — | 95% |
| Marketplace | ✅ | search, compare, place_order | — | — | — | 90% |
| Merchant | ✅ (assistant) | Hermes merchant | Stub | — | ✅ plan ads | 85% |
| Rider | ✅ (separate) | route | — | partial | — | 70% |
| Wallet | Context only | read balance | Planned | — | — | 80% |
| Pay | ❌ direct | read-only | — | — | — | 40% |
| Services | — | jobs proxy | — | — | — | 30% |
| MatchJob | — | advance job | — | — | — | 35% |
| Job Board | — | listings | — | — | — | 25% |
| Booking | — | booking proxy | — | — | — | 25% |
| Course | — | funnel events | Planned | — | — | 30% |
| Video | ✅ feed | feed_context | — | — | — | 50% |
| AI Director | Orchestrate | POST director/plan | — | — | ✅ native | 75% |
| Analytics | Admin | dashboard RO | — | — | — | 80% |
| CRM | Admin | notes RO | — | — | — | 60% |
| Admin | FTX | flags | — | — | — | 90% |

---

## 2. Context Matrix

(See [JARVIS_CONTEXT_ENGINE.md](./JARVIS_CONTEXT_ENGINE.md) — full table.)

Summary: Food + Marketplace = production context; Wallet/Merchant = partial; Services/Booking/Course = event-only Phase 1.

---

## 3. Memory Matrix

(See [JARVIS_MEMORY.md](./JARVIS_MEMORY.md) — tier × product.)

Storage: \`user_ai_preferences.context_json\` + \`user_experience_profiles\` — no freeze migration.

---

## 4. Persona Matrix

(See [JARVIS_PERSONAS.md](./JARVIS_PERSONAS.md).)

Keys: \`merchant | food | marketplace | wallet | super\` × 11 locales.

---

## 5. Event Integration Matrix

| Event | Products | Jarvis effect |
|-------|----------|---------------|
| order.* | Food, Market | Session + brief |
| wallet.* | Wallet | Brief only |
| merchant.* | Merchant | Proactive priority |
| rider.* | Food, Rider | ETA narration |
| ftx.* | Super | Onboarding tone |
| growth.* | All | Offer card |
| aivos.director.* | Merchant | Campaign suggest |

Bus map: [SUPER_APP_EVENT_MAP.md](../../architecture/SUPER_APP_EVENT_MAP.md)

---

## 6. Recommendation Matrix

(See [JARVIS_RECOMMENDATION_ENGINE.md](./JARVIS_RECOMMENDATION_ENGINE.md).)

---

## 7. Regional Matrix (11 countries)

| Code | Language | Currency | Timezone | Tone | Greeting (example) | Etiquette | Payment phrasing | Festivals |
|------|----------|----------|----------|------|-------------------|-----------|------------------|-----------|
| TH | th-TH | THB | Asia/Bangkok | Polite, warm | สวัสดีครับ | ครับ/ค่ะ, wai metaphor | พร้อมเพย์/โอน | Songkran, Loy Krathong |
| US | en-US | USD | America/New_York | Friendly direct | Hey there | First name OK | Card, Apple Pay | Thanksgiving, July 4 |
| CN | zh-CN | CNY | Asia/Shanghai | Respectful efficient | 您好 | 您 | 微信/支付宝 | CNY, Mid-Autumn |
| TW | zh-TW | TWD | Asia/Taipei | Warm formal | 您好 | 您 | LINE Pay, 轉帳 | Lunar NY |
| MY | ms-MY | MYR | Asia/Kuala_Lumpur | Multicultural polite | Selamat datang | Mix EN/MY | FPX, e-wallet | Hari Raya |
| ID | id-ID | IDR | Asia/Jakarta | Friendly | Halo | Anda/kamu by context | GoPay, OVO | Lebaran |
| SG | en-SG | SGD | Asia/Singapore | Efficient | Hello | Mixed EN | PayNow | National Day |
| LA | lo-LA | LAK | Asia/Vientiane | Gentle | ສະບາຍດີ | Respect elders | Bank transfer | Pi Mai |
| MM | my-MM | MMK | Asia/Yangon | Polite | မင်္ဂလာပါ | Formal address | KBZPay | Thingyan |
| BN | ms-BN | BND | Asia/Brunei | Formal polite | Selamat datang | Malay formal | BIBD transfer | Royal birthdays |
| LK | si-LK | LKR | Asia/Colombo | Warm respectful | Ayubowan | Mixed SI/TA/EN | LankaPay | Vesak, Avurudu |

---

## 8. AI Director Integration (Jarvis as orchestrator)

\`\`\`
User: "ช่วยทำโฆษณาร้านอาหาร"
  │
  ▼
Jarvis (intent classify) ── not replace director
  │
  ▼
POST /api/aivos/merchant-ad/director/plan
  │  backend/lib/aivos/merchant-ad/director/orchestrator.js
  ▼
director/run → script/video engines
  │
  ▼
Jarvis narrates status → merchant dashboard /m/merchant/assistant
\`\`\`

**Rules:** Jarvis **triggers** Director; Director owns generation state machine (\`generationStateMachine.js\`). Jarvis does not embed video providers.

---

*End of contracts — changes require ADR + sprint approval.*
`);

// ─── SUPER_APP architecture docs ──────────────────────────────────────────
write('architecture/SUPER_APP_ARCHITECTURE.md', `# AQOND Super App Architecture

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Vision

One mobile shell (Meerak core on port 3000) + storefront v2 (\`/m/*\` on 3003) sharing **AQOND Kernel** services: Identity, Wallet, Experience, Jarvis, AI Director, Event Bus.

---

## Layered stack

\`\`\`
┌─────────────────────────────────────────┐
│  Mobile WebView / Storefront UI         │
│  JarvisFab, /m/home, product verticals    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  BFF (storefront app/api/*)             │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
 backend/     ai-core/     postgres/
 (experience,  (jarvis      (commerce
  aivos,        concierge)    schema)
  commerce)
\`\`\`

---

## Jarvis position

Unified AI gateway — see [../products/jarvis/JARVIS_ARCHITECTURE.md](../products/jarvis/JARVIS_ARCHITECTURE.md).

**Not** a duplicate Experience Engine; Jarvis **consumes** experience state and **emits** no domain writes without tool approval.

---

## Kernel modules (target)

| Module | Current path | Maturity |
|--------|--------------|----------|
| Experience Engine | \`backend/lib/experience/\` | Sprint 30a stubs |
| AI Director | \`backend/lib/aivos/merchant-ad/director/\` | Production (ads) |
| Jarvis | storefront + ai-core | Production (TH) |
| Event Bus | \`userCommerceEvents\`, experience events | Partial |
| Commerce | \`backend/server.js\` | Production |

---

## Principles

1. Products connect through Kernel — no cross-wire BFF hacks
2. Feature flags per layer (\`AIVOS_*\`, \`NEXT_PUBLIC_*\`)
3. Additive evolution — see [SUPER_APP_DOMAIN_BOUNDARIES.md](./SUPER_APP_DOMAIN_BOUNDARIES.md)

Related: [SUPER_APP_AI_GATEWAY.md](./SUPER_APP_AI_GATEWAY.md), [SUPER_APP_EVENT_MAP.md](./SUPER_APP_EVENT_MAP.md).
`);

write('architecture/SUPER_APP_EVENT_MAP.md', `# Super App Event Map

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Envelope (target ACP)

\`\`\`json
{
  "type": "order.updated",
  "version": 1,
  "timestamp": "ISO",
  "actor": { "type": "user|system", "id": "" },
  "payload": {},
  "trace_id": ""
}
\`\`\`

---

## Producers

| Domain | Producer | Examples |
|--------|----------|----------|
| Commerce | \`userCommerceEvents.js\` | order.*, wallet.* |
| Experience | \`experienceRoutes.js\` | ftx.*, experience.* |
| Payments | \`server.js\` ledger hooks | payment.* |
| AIVOS | \`eventBus.js\` (kernel) | aivos.pipeline.* |
| Jobs | MatchJob/advance flows | job.* |

---

## Consumers (read-only)

| Consumer | Subscribes | Action |
|----------|------------|--------|
| Jarvis | order.*, wallet.*, merchant.*, rider.*, ftx.* | Brief + context |
| Experience Engine | ftx.*, experience.* | Lifecycle |
| Analytics | * | Metrics |
| Growth | commerce + growth.* | Campaigns |
| AI Director | merchant.campaign_* | Pipeline |

---

## Storefront ingress

\`POST /api/experience/events\` → \`experienceProxy.ts\` → backend

**Freeze rule:** Jarvis does not publish commerce mutations — only \`jarvis.ack\`, \`jarvis.dismiss\` telemetry via experience events.

See [../products/jarvis/JARVIS_EVENT_INTEGRATION.md](../products/jarvis/JARVIS_EVENT_INTEGRATION.md).
`);

write('architecture/SUPER_APP_CONTEXT_MAP.md', `# Super App Context Map

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Context sources by domain

| Domain | Authoritative store | BFF access | Jarvis slice |
|--------|---------------------|------------|--------------|
| Identity | users, sessions | x-user-id | buyer_id, guest |
| Commerce orders | order tables | jarvisContext.ts | active_orders |
| Food feed | feed APIs | foodFeedBridge.ts | feed_context |
| Wallet | wallet ledger | wallet BFF | balance RO |
| Merchant | merchant_os | /m/merchant/* | shop_id, pending |
| Experience | 038 profiles | /api/experience/state | intent, lifecycle |
| AI prefs | 037 user_ai_preferences | /api/ai/user-preferences | locale, memory |
| Director | director state | aivos routes | campaign_id |

---

## Flow

\`\`\`
Client mount → GET /api/experience/state
User opens Jarvis → POST /api/ai/jarvis
  ← merge context map entries (not full DB)
\`\`\`

**Anti-pattern:** Jarvis route calling 10 micro-queries per turn — use cached snapshot + event invalidation.

See [../products/jarvis/JARVIS_CONTEXT_ENGINE.md](../products/jarvis/JARVIS_CONTEXT_ENGINE.md).
`);

write('architecture/SUPER_APP_AI_GATEWAY.md', `# Super App AI Gateway

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Gateways

| Gateway | Entry | Backend |
|---------|-------|---------|
| **Jarvis** | \`POST /api/ai/jarvis\` | ai-core \`/v1/jarvis/concierge\` |
| **Merchant assistant** | \`/m/merchant/assistant\` | Hermes / merchant tools |
| **AI Director** | \`/api/aivos/merchant-ad/director/*\` | orchestrator.js |
| **Rules fallback** | same BFF | \`localJarvis.ts\` |

---

## Routing rules

1. ai-core when key present + healthy
2. \`localJarvis\` when ai-core down or \`VOICE_USE_RULES_ONLY=1\`
3. Language/persona layers **before** ai-core (Sprint 31–33)
4. Director invoked only via explicit tool/intent — not every chat turn

---

## Keys & env

\`aiCoreApi\`, \`aiCoreKey\` from \`lib/server-env.ts\`

**Kill:** \`AIVOS_JARVIS_KILL=1\`

See [../products/jarvis/JARVIS_API.md](../products/jarvis/JARVIS_API.md).
`);

write('architecture/SUPER_APP_PERMISSION_MODEL.md', `# Super App Permission Model (Jarvis)

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Scopes

| Action | Guest | User | Merchant | Admin |
|--------|-------|------|----------|-------|
| Chat Jarvis | ✅ | ✅ | ✅ | ✅ |
| Place order via tool | ❌ | ✅ | N/A | ❌ |
| View wallet balance | ❌ | ✅ own | ❌ | RO |
| Trigger Director | ❌ | ❌ | ✅ own shop | ✅ |
| Change shop hours | ❌ | ❌ | ✅ | ✅ |
| Read CRM notes | ❌ | ❌ | ❌ | ✅ |

---

## Tool approval

Financial and irreversible actions require:

1. Explicit user confirmation UI (existing checkout flows)
2. No silent tool execution from proactive brief
3. \`buyer_id\` / \`x-user-id\` must match resource owner

---

## Data minimization

Jarvis context excludes: full PAN, KYC docs, other users' PII.

**Reuse:** existing auth middleware on BFF routes; no new permission store in freeze.
`);

write('architecture/SUPER_APP_STATE_MACHINE.md', `# Super App State Machine — Jarvis Session

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Client session states

\`\`\`
idle → opening → chatting → tool_pending → awaiting_confirm → chatting
                    ↓
              proactive_brief → dismissed | engaged
\`\`\`

**Store:** \`lib/jarvis/session.ts\` (localStorage), patched by \`POST /api/ai/jarvis\` response.

---

## Server-side (additive)

| State | Meaning |
|-------|---------|
| \`lang_detected\` | language_profile saved |
| \`memory_synced\` | medium tier written |
| \`brief_active\` | proactive showing |
| \`director_handoff\` | campaign plan started |

---

## Director generation (reference)

\`backend/lib/aivos/merchant-ad/director/state/generationStateMachine.js\` — Jarvis only observes; does not drive transitions.

---

## Experience lifecycle (parallel)

\`visitor → new → activated → power → merchant → partner → vip → enterprise\`

From \`lifecycleEngine.js\` — affects tone, not session FSM directly.
`);

write('architecture/SUPER_APP_DOMAIN_BOUNDARIES.md', `# Super App Domain Boundaries

**Status:** FROZEN  
**Date:** ${TODAY}

---

## Ownership

| Domain | Owns | Must not leak into |
|--------|------|-------------------|
| **Jarvis** | Conversation, intent, narration | Payment settlement, order DB writes |
| **Experience Engine** | Home order, FTX, intent, flags | LLM prompts |
| **AI Director** | Ad/script/video generation | General concierge |
| **Commerce** | Orders, wallet, ledger | UI copy |
| **ai-core** | LLM tools execution | Postgres direct |
| **Storefront BFF** | Aggregation, auth | Business rules duplication |

---

## Integration contracts

- Jarvis → Experience: \`GET /api/experience/state\`, \`jarvis-brief\`
- Jarvis → Commerce: read \`jarvisContext\`, tools via ai-core
- Jarvis → Director: \`POST .../director/plan\` only
- Experience → Jarvis: events via \`POST /api/experience/events\`

---

## Forbidden

1. Jarvis route importing director video engines directly
2. Director rewriting jarvis-concierge prompts
3. New parallel memory DB without ADR
4. Mobile repo changes for Jarvis sprints (storefront only)

See [../products/jarvis/JARVIS_ARCHITECTURE.md](../products/jarvis/JARVIS_ARCHITECTURE.md).
`);

// ─── JARVIS_READINESS_REPORT.md ───────────────────────────────────────────
write('reports/JARVIS_READINESS_REPORT.md', `# Jarvis Readiness Report

**Date:** ${TODAY}  
**Scope:** Repository audit — Architecture Freeze (docs only)

---

## Readiness summary

| Area | % | Rationale |
|------|---|-----------|
| **Architecture** | **92%** | Jarvis BFF, ai-core, experience stubs, director orchestrator documented; gaps: unified event bridge, voice package |
| **Memory** | **75%** | \`user_ai_preferences\`, \`aiMemoryEngine.js\` stub, client session; missing tiered server merge |
| **Voice** | **20%** | Rider-voice + director voiceEngine exist; no \`aqond-v2/voice/\`, no STT/TTS matrix |
| **Localization** | **10%** | Thai production prompts; i18n partial; 11-country matrix spec only |
| **Recommendation** | **5%** | \`jarvis-brief\` stub, recommendationEngine delegates; no event-driven briefs |
| **CRM** | **60%** | Admin notes exist; Jarvis read-only integration not wired |
| **Analytics** | **80%** | FTX dashboard, experience analytics; Jarvis telemetry partial |
| **Admin** | **90%** | FTX admin, flags, feature gates mature |
| **Food** | **95%** | feed_context, foodFeedBridge, track_order tools production |
| **Marketplace** | **90%** | search/compare/place_order in ai-core |
| **Wallet** | **80%** | Commerce events + BFF; Jarvis context not wired |

---

## Implementation priorities

1. **Sprint 31** — Language Intelligence (unblocks localization)
2. **Sprint 32** — Memory tiers (unblocks personalization)
3. **Sprint 34** — Proactive briefs (user-visible value)
4. **Sprint 33** — Personas (depends on 31)
5. **Sprint 35** — Voice (highest risk, last)

---

## Reusable modules (do not rewrite)

| Module | Path |
|--------|------|
| Jarvis BFF | \`aqond-v2/apps/storefront/app/api/ai/jarvis/route.ts\` |
| ai-core brain | \`aqond-v2/infra/ai-core/lib/prompts/jarvis-concierge.js\` |
| Rules fallback | \`aqond-v2/apps/storefront/lib/server/localJarvis.ts\` |
| Order context | \`aqond-v2/apps/storefront/lib/server/jarvisContext.ts\` |
| Food bridge | \`aqond-v2/apps/storefront/lib/server/foodFeedBridge.ts\` |
| Client UI | \`components/jarvis/JarvisFab.tsx\` |
| Session | \`aqond-v2/apps/storefront/lib/jarvis/session.ts\` |
| Experience Engine | \`backend/lib/experience/experienceEngine.js\` |
| AI Memory stub | \`backend/lib/experience/aiMemoryEngine.js\` |
| Jarvis brief | \`aqond-v2/apps/storefront/app/api/experience/jarvis-brief/route.ts\` |
| Commerce events | \`backend/lib/userCommerceEvents.js\` |
| AI Director | \`backend/lib/aivos/merchant-ad/director/orchestrator.js\` |
| Prompt library pattern | \`backend/lib/aivos/merchant-ad/director/data/prompt-library/v3/\` |
| User AI prefs DDL | \`aqond-v2/infra/postgres/migrations/037_tier3_ai.sql\` |
| Experience DDL | \`aqond-v2/infra/postgres/migrations/038_experience_engine.sql\` |

---

## Blockers before Sprint 31 code

- [ ] Architecture Freeze approval (this document set)
- [ ] Confirm no breaking changes to \`POST /api/ai/jarvis\`
- [ ] Feature flag defaults documented in helm/env

**Next:** [../NEXT_TASK.md](../NEXT_TASK.md)
`);

// ─── OS status files ──────────────────────────────────────────────────────
write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}

| Sprint | Status |
|--------|--------|
| 28 Services | COMPLETE |
| 29 Component Registry | COMPLETE |
| 30a Experience Engine stubs | COMPLETE |
| 30b/c FTX | COMPLETE (per prior sprints) |
| **Architecture Freeze (Jarvis + Super App)** | **COMPLETE** |

## Jarvis Architecture Freeze

Docs under \`products/jarvis/\` and \`architecture/\` — **no production code**.

- 10-layer Jarvis stack frozen
- Sprints 31–35 roadmap defined
- All contract matrices in JARVIS_CONTRACTS.md
- Readiness report: reports/JARVIS_READINESS_REPORT.md

## Awaiting

**Sprint 31 approval** — Language Intelligence Engine
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}

## Sprint 31 awaits approval

Architecture Freeze is complete. **Do not implement** until approved.

### On approval — Sprint 31: Language Intelligence Engine

1. \`backend/lib/jarvis/languageIntelligence.js\`
2. Hook \`aqond-v2/apps/storefront/app/api/ai/jarvis/route.ts\` (flagged)
3. \`POST /api/jarvis/language-profile\` BFF
4. Persist \`context_json.language_profile\`
5. TH + EN prompt skeleton in prompt library

See: \`products/jarvis/JARVIS_ROADMAP.md\`, \`products/jarvis/JARVIS_LANGUAGE_ENGINE.md\`
`);

write('SESSION.md', `# SESSION

**Updated:** ${TODAY}

**Resume:** Architecture Freeze complete — await Sprint 31 (Language Intelligence) approval.

Delivered: Jarvis + Super App docs via \`scripts/write-jarvis-architecture-freeze.mjs\`. No production code changes.
`);

// Append DECISIONS.md
const decPath = path.join(OS, 'DECISIONS.md');
let dec = fs.existsSync(decPath) ? fs.readFileSync(decPath, 'utf8') : '# DECISIONS\n\nArchitecture Decision Records.\n';
if (!dec.includes('ADR-JARVIS-001')) {
  dec += `
## ADR-JARVIS-001 — Architecture Freeze (${TODAY})

**Status:** Accepted

Jarvis evolves as **additive layers** on existing \`POST /api/ai/jarvis\`, ai-core, Experience Engine, and AI Director — no parallel runtime, no breaking API changes, no translate-then-think pipeline. Memory in \`user_ai_preferences.context_json\` without new migration in freeze. Sprints 31–35 sequenced: Language → Memory → Persona → Recommendation → Voice.

`;
  fs.writeFileSync(decPath, dec);
  console.log('wrote: DECISIONS.md (appended ADR-JARVIS-001)');
}

// Append KNOWLEDGE_INDEX.md
const kiPath = path.join(OS, 'KNOWLEDGE_INDEX.md');
let ki = fs.existsSync(kiPath) ? fs.readFileSync(kiPath, 'utf8') : '# KNOWLEDGE INDEX\n\n| Topic | Path | Sprint |\n|-------|------|--------|\n';
const kiAdds = [
  ['products/jarvis/JARVIS_ARCHITECTURE.md', 'Jarvis 10-layer architecture'],
  ['products/jarvis/JARVIS_MEMORY.md', 'Memory tiers L3'],
  ['products/jarvis/JARVIS_LANGUAGE_ENGINE.md', 'Language intelligence L1+L5'],
  ['products/jarvis/JARVIS_PERSONAS.md', 'Regional personas L2+4+9'],
  ['products/jarvis/JARVIS_PROMPT_LIBRARY.md', 'Locale prompt library'],
  ['products/jarvis/JARVIS_CONTEXT_ENGINE.md', 'Context matrix L7'],
  ['products/jarvis/JARVIS_RECOMMENDATION_ENGINE.md', 'Proactive recommendations L8'],
  ['products/jarvis/JARVIS_EVENT_INTEGRATION.md', 'Event subscribe L10'],
  ['products/jarvis/JARVIS_API.md', 'API stability review'],
  ['products/jarvis/JARVIS_ROADMAP.md', 'Sprints 31–35'],
  ['products/jarvis/JARVIS_CONTRACTS.md', 'All Jarvis matrices'],
  ['architecture/SUPER_APP_ARCHITECTURE.md', 'Super App stack'],
  ['architecture/SUPER_APP_EVENT_MAP.md', 'Event envelope map'],
  ['architecture/SUPER_APP_CONTEXT_MAP.md', 'Context sources'],
  ['architecture/SUPER_APP_AI_GATEWAY.md', 'AI routing'],
  ['architecture/SUPER_APP_PERMISSION_MODEL.md', 'Jarvis permissions'],
  ['architecture/SUPER_APP_STATE_MACHINE.md', 'Session FSM'],
  ['architecture/SUPER_APP_DOMAIN_BOUNDARIES.md', 'Domain ownership'],
  ['reports/JARVIS_READINESS_REPORT.md', 'Readiness audit'],
];
for (const [file, desc] of kiAdds) {
  if (!ki.includes(file)) ki += `| ${desc} | docs/aqond-os/${file} | Arch Freeze |\n`;
}
fs.writeFileSync(kiPath, ki);
console.log('wrote: KNOWLEDGE_INDEX.md (appended entries)');

// Summary
const count = [
  'products/jarvis/JARVIS_ARCHITECTURE.md',
  ...kiAdds.map(([f]) => f),
  'CURRENT_STATUS.md',
  'NEXT_TASK.md',
  'SESSION.md',
  'DECISIONS.md',
  'KNOWLEDGE_INDEX.md',
].length;
console.log(`\nArchitecture Freeze complete — ${count} files touched under docs/aqond-os/`);
