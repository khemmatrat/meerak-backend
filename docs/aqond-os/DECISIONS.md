# AQOND — Architectural Decisions

**Last Updated:** 2026-06-30

Never delete entries. Append new decisions with incrementing numbers.

---

## DOS-001 — Local catalog fallback for storefront dev

| Field                      | Value                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Date**                   | 2026-06-29                                                                           |
| **Problem**                | Kong/catalog-svc not always running in local dev; home page empty                    |
| **Decision**               | Storefront uses `.data/dev/catalog.json` via `localCatalog.ts` when Kong unavailable |
| **Reason**                 | Fast merchant-ad iteration without full infra stack                                  |
| **Impact**                 | Dev/prod divergence; production must use catalog-svc                                 |
| **Alternative Considered** | Require Docker compose for all dev sessions                                          |
| **Status**                 | Accepted                                                                             |

---

## DOS-002 — Catalog wins over affiliate.json

| Field                      | Value                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| **Date**                   | 2026-06-29                                                                         |
| **Problem**                | Published merchant-ad products ranked last on home; `source: merchant-ad` stripped |
| **Decision**               | `localCatalog.ts` skips affiliate overwrite when product already exists in catalog |
| **Reason**                 | Affiliate links are secondary; catalog is source of truth for merchant products    |
| **Impact**                 | Home `loadHomeProducts()` correctly pins merchant-ad items                         |
| **Alternative Considered** | Merge affiliate metadata without replacing catalog row                             |
| **Status**                 | Accepted — verified                                                                |

---

## DOS-003 — Grok per-shot video with ffmpeg concat

| Field                      | Value                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| **Date**                   | 2026-06-28                                                                 |
| **Problem**                | Single-shot Grok limits ad length; kenburns fallback low quality           |
| **Decision**               | `videoEngine.js` generates N Grok shots (max 4 default), concat via ffmpeg |
| **Reason**                 | Better quality clips; graceful per-shot timeout (4 min)                    |
| **Impact**                 | Higher XAI cost; requires `XAI_API_KEY` and ffmpeg on backend host         |
| **Alternative Considered** | Kenburns-only fallback as default                                          |
| **Status**                 | Accepted — kenburns behind `MERCHANT_AD_ALLOW_KENBURNS_FALLBACK=1`         |

---

## DOS-004 — AIVOS dev key proxy from storefront

| Field                      | Value                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| **Date**                   | 2026-06-28                                                                                |
| **Problem**                | Storefront could not auth to AIVOS merchant-ad; fell back to local kenburns (`adv-*`)     |
| **Decision**               | `X-Aivos-Merchant-Ad-Key` header + `AIVOS_MERCHANT_AD_DEV_KEY` in storefront `.env.local` |
| **Reason**                 | Route real jobs (`mad-*`) through backend in dev                                          |
| **Impact**                 | Dev key must not ship to production without proper auth                                   |
| **Alternative Considered** | Public unauthenticated AIVOS routes                                                       |
| **Status**                 | Accepted (dev only)                                                                       |

---

## DOS-005 — AQOND-OS as isolated AI documentation workspace

| Field                      | Value                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Date**                   | 2026-06-30                                                                                                   |
| **Problem**                | AI sessions re-scan entire codebase; docs mixed with legacy files in `docs/`                                 |
| **Decision**               | Maintain `docs/aqond-os/` as the ONLY official AI documentation workspace; preserve legacy `docs/` unchanged |
| **Reason**                 | Reduce token usage; clear navigation; single source of truth for AI sessions                                 |
| **Impact**                 | Every session reads aqond-os first; end-of-task doc updates required                                         |
| **Alternative Considered** | Continue using flat `docs/` DOS at repo root                                                                 |
| **Status**                 | Accepted                                                                                                     |

## ADR-005 — AI Director Foundation (2026-06-30)

**Status:** Proposed (awaiting approval)

**Context:** Merchant Ad Studio needs one-tap "AI Director" with UGC Lip Sync for food/beauty/services while keeping TVC multi-shot for premium.

**Decision:**

- Add orchestration layer `director/` on top of existing merchant-ad module
- Template-first Script + Prompt libraries (no full AI rewrite each run)
- UGC format `ugc_lipsync` coexists with `tvc_multi_shot`
- Reuse existing publish pipeline (Priority 2)
- Grok grok-imagine-video-1.5 for UGC 10s lip sync
- Voice/Subtitle as later phases

**Docs:** docs/aqond-os/products/brain/

## ADR-006 — AI Director Phase 1 Implementation (2026-06-30)

**Status:** Accepted

**Decision:**

- Add `director/` module with provider registry pattern
- `generate()` remains untouched for TVC backward compatibility
- New `director.run()` / `director.plan()` for orchestrated flows
- Provider-specific logic only in `providers/video/*`
- UGC video stub returns DIRECTOR_UGC_NOT_READY until Phase 4
- Last-registered video provider wins for same format (extension point)

**Code:** backend/lib/aivos/merchant-ad/director/

## ADR-007 — Prompt Composition Engine Phase 2 (2026-06-30)

**Status:** Accepted

**Decision:**

- Multi-dimension JSON config (business, industry, audience, style, campaign, language, platform, CTA, provider)
- composePromptFromDimensions() — no hardcoded prompt text in code
- reproducibility_hash + per-dimension version stamps
- TVC format skips video prompt (briefEngine unchanged)
- composePromptWithScript() for Script Engine handoff

**Code:** director/data/, director/engines/prompt\*.js

## ADR-008 — Script Strategy Engine Phase 3 (2026-06-30)

**Status:** Accepted

**Decision:**

- Layered pipeline: Business → Strategy → Psychology → Script → Prompt
- Marketing strategies externalized in JSON; industry maps in business-strategy-map.json
- 9 script types share one engine; strategy selection varies by business context
- TVC video pipeline unchanged; script still generated for director_plan metadata
- composePromptWithScript() binds full_text_th to Grok spoken layer

**Code:** director/data/script-\*.json, director/engines/{businessContext,strategyEngine,psychologyEngine,scriptComposer}.js

## ADR-009 — Prompt Composition Engine v2.1 (2026-06-30)

**Status:** Accepted

**Decision:**

- Prompt Engine composes from dimensions + versioned libraries; not a single JSON loader
- Language/provider content in `prompt-library/v{n}/`; dimensions in shared JSON
- `prompt_version` pinning for merchant reproducibility across catalog upgrades
- CTA intensity (soft/hard) as separate dimension layer
- Marketing strategies documented in MARKETING_STRATEGIES.md; runtime via marketing-strategies.json + manifest

**Code:** director/engines/promptConfigLoader.js, promptComposer.js, director/data/prompt-library/

## ADR-010 — UGC Lip Sync Phase 4 (2026-06-30)

**Status:** Accepted

**Decision:**

- Validation before async generation; validation_failed returns 400 without token deduct
- Provider capability layer externalized in provider-capabilities.json
- UGC provider uses adapter pattern; Grok isolated in grokUgcAdapter + ugcVideoBridge
- Generation state machine on job.generation_state + generation_timeline
- Merchant preview bundled in director/plan response
- TVC legacy generate() unchanged

**Code:** director/engines/{validation,costEstimation,preview}Engine.js, director/state/, ugcVideoBridge.js, merchant_ad_ugc.py

## ADR-FTX-001 — FTX as storefront experience layer (2026-07-01)

**Status:** Proposed (planning)

**Decision:**

- FTX lives on storefront /m/home as overlay + wizard layer
- No duplicate product backends
- Extension tables only: user_ftx_preferences, ftx_events
- Welcome becomes FtxWelcomeOverlay, not route deletion
- mobile/ unchanged in Sprint 30a–c; entry redirect via handoff optional Phase 0

**Doc:** products/ftx.md, SPRINT_30_FTX_ARCHITECTURE.md

## ADR-FTX-002 — Experience Engine over FTX-only (2026-07-01)

**Status:** Accepted

FTX is a layer under Experience Engine. Intent Engine (primary/secondary/hidden), Lifecycle (visitor→enterprise), Jarvis AI OS proactive briefs. AQOND Kernel as long-term hub. Products must not cross-wire — use createExperienceRuntime().

## ADR-JARVIS-001 — Architecture Freeze (2026-06-30)

**Status:** Accepted

Jarvis evolves as **additive layers** on existing `POST /api/ai/jarvis`, ai-core, Experience Engine, and AI Director — no parallel runtime, no breaking API changes, no translate-then-think pipeline. Memory in `user_ai_preferences.context_json` without new migration in freeze. Sprints 31–35 sequenced: Language → Memory → Persona → Recommendation → Voice.

- Sprint 29: Component Registry — เสร็จสมบูรณ์ (2026-0X-XX)
- Sprint 30a-f: Experience Engine stubs + FTX — เสร็จสมบูรณ์
- Sprint 31-35: Jarvis roadmap phases — เสร็จสมบูรณ์
