#!/usr/bin/env node
/** Update AQOND-OS after AI Director planning session */
const fs = require('fs');
const path = require('path');

const OS = path.join(__dirname, '..', 'docs', 'aqond-os');
const TODAY = '2026-06-30';

function write(rel, content) {
  const p = path.join(OS, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  console.log('updated:', rel);
}

write('SESSION.md', `# SESSION — Live Working Memory

**Last Updated:** ${TODAY}  
**Session:** 005 — AI Director Foundation (Planning Only)

---

## Resume Point

**WAITING FOR USER APPROVAL** — Architecture docs complete. Do NOT implement production code until approved.

Next when approved: Phase 2 Prompt Engine (\`promptEngine.js\` + JSON libraries)

---

## Session Goal

Create complete AI Director Foundation planning docs. Transform Merchant Ad Studio vision into one-tap Director without breaking TVC.

---

## Completed This Session

- [x] AI_DIRECTOR_ARCHITECTURE.md
- [x] UGC_LIPSYNC_ARCHITECTURE.md (input/output/prompt/API/Grok/publish + sequence diagrams)
- [x] UGC_PROMPT_LIBRARY.md (9 categories + Thai templates)
- [x] UGC_STYLE_LIBRARY.md (6 presets + director matrix)
- [x] UGC_SCRIPT_ENGINE.md (Hook→Pain→Solution→Offer→CTA)
- [x] AI_DIRECTOR_ROADMAP.md (Phases 1–8)

Location: \`docs/aqond-os/products/brain/\`

---

## Prior Sessions (summary)

- Session 004: PDP Video E2E 16/16 PASS
- Session 005 (earlier): Merchant Ad Studio publish flow (background/retry/notification) — code complete

---

## Working Files (planning only — no code changes)

| File | Status |
|------|--------|
| docs/aqond-os/products/brain/*.md | Created |
| backend/lib/aivos/merchant-ad/director/ | NOT STARTED |
| Production code | UNTOUCHED this session |

---

## Regression Checklist (unchanged)

- PDP E2E: \`cd aqond-v2/apps/storefront && npm run test:e2e:pdp\`
- MAD backend: \`cd backend && node --test __tests__/aivosMerchantAd.test.js\`

---

## Blockers

None for planning. Implementation blocked on user approval.

---

## Notes

- XAI_API_KEY present in backend/.env and aqond-brain/.env (~$3.95 credits)
- UGC Lip Sync preferred for food/beauty/services; TVC retained for luxury
- Publish Engine reuses Priority 2 work (no new publish service)
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}  
**Mode:** Planning complete → **awaiting approval**

---

## Current Priority

### P0 — User Approval

Review planning docs in \`docs/aqond-os/products/brain/\`:

1. AI_DIRECTOR_ARCHITECTURE.md
2. UGC_LIPSYNC_ARCHITECTURE.md
3. UGC_PROMPT_LIBRARY.md
4. UGC_STYLE_LIBRARY.md
5. UGC_SCRIPT_ENGINE.md
6. AI_DIRECTOR_ROADMAP.md

Reply **approve** to start implementation Phase 2 (Prompt Engine).

---

## After Approval — Implementation Order

1. **Phase 2** Prompt Engine — JSON libraries + promptEngine.js
2. **Phase 3** Script Engine — template-first Thai scripts
3. **Phase 4** UGC Lip Sync — Grok single clip + Director MVP
4. **Phase 7** Auto-publish wiring (reuse existing publish runner)
5. Phase 5 Voice → Phase 6 Subtitle → Phase 8 Optimization

---

## Deferred

- Grok TVC multi-shot production verification (lower priority vs UGC)
- Veo / Runway / Kling providers (Phase 8)
`);

write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}  
**Sprint:** ~90%

---

## Product Status

| Module | Progress | Notes |
|--------|----------|-------|
| PDP Video | 100% | E2E 16/16 mobile |
| Merchant Ad Studio — Publish | ~100% | Background job, retry, notification |
| Merchant Ad Studio — Generate | 80% | TVC 10-shot; Grok key ready |
| **AI Director Foundation** | **Planning 100%** | Docs only — no code yet |
| UGC Lip Sync | 0% impl | Architecture approved pending |
| Grok Production (TVC) | 30% | XAI_API_KEY configured |

---

## AI Director Planning (Session 005)

Complete architecture package at \`docs/aqond-os/products/brain/\`.

Vision: Merchant → one tap → Director → Style → Script → Video → Publish

---

## Environment

- XAI_API_KEY: configured (backend + aqond-brain)
- xAI credits: ~$3.95 remaining
- Storefront: :3003 | Backend: :3001

---

## Do Not Start

Production code for AI Director until user approves architecture.
`);

const decisionsPath = path.join(OS, 'DECISIONS.md');
let decisions = fs.existsSync(decisionsPath) ? fs.readFileSync(decisionsPath, 'utf8') : '# DECISIONS\n\n';
const entry = `
## ADR-005 — AI Director Foundation (${TODAY})

**Status:** Proposed (awaiting approval)

**Context:** Merchant Ad Studio needs one-tap "AI Director" with UGC Lip Sync for food/beauty/services while keeping TVC multi-shot for premium.

**Decision:**
- Add orchestration layer \`director/\` on top of existing merchant-ad module
- Template-first Script + Prompt libraries (no full AI rewrite each run)
- UGC format \`ugc_lipsync\` coexists with \`tvc_multi_shot\`
- Reuse existing publish pipeline (Priority 2)
- Grok grok-imagine-video-1.5 for UGC 10s lip sync
- Voice/Subtitle as later phases

**Docs:** docs/aqond-os/products/brain/

`;
if (!decisions.includes('ADR-005')) {
  fs.writeFileSync(decisionsPath, decisions.trimEnd() + '\n' + entry, 'utf8');
  console.log('updated: DECISIONS.md');
}

const kiPath = path.join(OS, 'KNOWLEDGE_INDEX.md');
let ki = fs.existsSync(kiPath) ? fs.readFileSync(kiPath, 'utf8') : '';
const brainSection = `
### AI Director / UGC (brain product)

| Doc | Purpose |
|-----|---------|
| [products/brain/AI_DIRECTOR_ARCHITECTURE.md](./products/brain/AI_DIRECTOR_ARCHITECTURE.md) | Orchestrator + engines |
| [products/brain/UGC_LIPSYNC_ARCHITECTURE.md](./products/brain/UGC_LIPSYNC_ARCHITECTURE.md) | UGC format technical flow |
| [products/brain/UGC_PROMPT_LIBRARY.md](./products/brain/UGC_PROMPT_LIBRARY.md) | Category prompt templates |
| [products/brain/UGC_STYLE_LIBRARY.md](./products/brain/UGC_STYLE_LIBRARY.md) | Style presets |
| [products/brain/UGC_SCRIPT_ENGINE.md](./products/brain/UGC_SCRIPT_ENGINE.md) | Script generation |
| [products/brain/AI_DIRECTOR_ROADMAP.md](./products/brain/AI_DIRECTOR_ROADMAP.md) | Implementation phases |

**Code (when approved):** \`backend/lib/aivos/merchant-ad/director/\`, \`aqond-brain/scripts/merchant_ad_ugc.py\`
`;
if (!ki.includes('AI_DIRECTOR_ARCHITECTURE')) {
  fs.writeFileSync(kiPath, ki.trimEnd() + '\n' + brainSection, 'utf8');
  console.log('updated: KNOWLEDGE_INDEX.md');
}

write('products/brain.md', `# Brain Product (aqond-brain + AIVOS merchant-ad)

**Paths:** \`aqond-brain/\`, \`backend/lib/aivos/merchant-ad/\`, \`aqond-v2/infra/ai-core/\`

---

## AI Director Foundation (Planning)

Full design package: **[products/brain/](./brain/)**

| Document | Description |
|----------|-------------|
| [AI_DIRECTOR_ARCHITECTURE.md](./brain/AI_DIRECTOR_ARCHITECTURE.md) | Merchant AI Director orchestration |
| [UGC_LIPSYNC_ARCHITECTURE.md](./brain/UGC_LIPSYNC_ARCHITECTURE.md) | UGC lip sync technical design |
| [UGC_PROMPT_LIBRARY.md](./brain/UGC_PROMPT_LIBRARY.md) | Thai category templates |
| [UGC_STYLE_LIBRARY.md](./brain/UGC_STYLE_LIBRARY.md) | 6 style presets |
| [UGC_SCRIPT_ENGINE.md](./brain/UGC_SCRIPT_ENGINE.md) | Hook→CTA script pipeline |
| [AI_DIRECTOR_ROADMAP.md](./brain/AI_DIRECTOR_ROADMAP.md) | Phases 1–8 |

---

## Existing Integration

- Grok video: \`aqond-brain/scripts/factory/grok_video_api.py\`
- Merchant shot: \`aqond-brain/scripts/merchant_ad_shot.py\`
- Bridge: \`backend/lib/aivos/merchant-ad/grokVideoBridge.js\`
- Brief: \`ai-core/lib/prompts/merchant-ad-video.js\` (10-shot TVC)

---

## Env

- \`XAI_API_KEY\` — backend/.env + aqond-brain/.env
- \`AIVOS_MERCHANT_AD_GROK_VIDEO=1\`
- \`GROK_VIDEO_USE_XAI_SDK=1\` (aqond-brain)
`);

const dailyPath = path.join(OS, 'logs', 'daily', `${TODAY}.md`);
const dailyAppend = `

---

## Session 005 — AI Director Foundation (Planning)

**Type:** Architecture only — no production code

**Deliverables:**
- docs/aqond-os/products/brain/ (6 documents)
- ADR-005 proposed in DECISIONS.md
- AQOND-OS SESSION, CURRENT_STATUS, NEXT_TASK updated

**Key decisions:**
- Template-first prompts/scripts (not AI rewrite every run)
- UGC lip sync + TVC coexist
- Reuse publish pipeline from Priority 2

**Next:** User approval → Phase 2 Prompt Engine
`;
if (fs.existsSync(dailyPath)) {
  const d = fs.readFileSync(dailyPath, 'utf8');
  if (!d.includes('Session 005')) {
    fs.writeFileSync(dailyPath, d.trimEnd() + dailyAppend, 'utf8');
    console.log('updated: logs/daily/' + TODAY + '.md');
  }
} else {
  write('logs/daily/' + TODAY + '.md', `# Daily Log ${TODAY}\n` + dailyAppend);
}

console.log('AQOND-OS sync complete');
