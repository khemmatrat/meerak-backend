#!/usr/bin/env node
/** AQOND-OS sync after AI Director Phase 2 */
const fs = require('fs');
const path = require('path');

const OS = path.join(__dirname, '..', 'docs', 'aqond-os');
const TODAY = '2026-06-30';

function write(rel, content) {
  fs.writeFileSync(path.join(OS, rel), content, 'utf8');
  console.log('updated:', rel);
}

write('SESSION.md', `# SESSION — Live Working Memory

**Last Updated:** ${TODAY}  
**Session:** 007 — AI Director Phase 2 (Prompt Composition Engine)

---

## Resume Point

**WAITING FOR USER APPROVAL** before Phase 3 (Script Engine).

---

## Phase 2 Delivered

- Prompt Composition Engine v2.0.0
- External config: director/data/*.json (9 dimension files + catalog)
- APIs: buildPromptComposeInput, composePromptFromDimensions, composePromptWithScript
- Versioning: catalog_version + dimension_versions + reproducibility_hash
- TVC: prompt skipped (tvc_uses_brief_engine) — pipeline unchanged
- Tests: 25/25 PASS (MAD01–MAD25)

---

## Code

\`backend/lib/aivos/merchant-ad/director/engines/\`
- promptConfigLoader.js
- promptComposer.js
- promptEngine.js

\`backend/lib/aivos/merchant-ad/director/data/\` — versioned JSON dimensions

---

## Regression

\`cd backend && node --test __tests__/aivosMerchantAd*.test.js\`
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}  
**Status:** Phase 2 complete — **await approval for Phase 3**

---

## Phase 3 — Script Engine (NOT STARTED)

1. Template-based Thai scripts from data files (pains, hooks, CTAs)
2. Wire scriptEngine.js — replace pending_phase_3
3. Integrate composePromptWithScript() after script generation
4. Tests + AQOND-OS update
5. Wait for approval before Phase 4

---

## Do NOT start Phase 3 until user approves.
`);

write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}

| Module | Progress |
|--------|----------|
| AI Director Phase 1 | 100% |
| **AI Director Phase 2** | **100%** |
| AI Director Phase 3–8 | 0% (gated) |
| TVC legacy generate() | unchanged |
| UGC video (Phase 4) | stub |

**Tests:** 25/25 PASS
`);

const decisionsPath = path.join(OS, 'DECISIONS.md');
let decisions = fs.readFileSync(decisionsPath, 'utf8');
if (!decisions.includes('ADR-007')) {
  decisions += `
## ADR-007 — Prompt Composition Engine Phase 2 (${TODAY})

**Status:** Accepted

**Decision:**
- Multi-dimension JSON config (business, industry, audience, style, campaign, language, platform, CTA, provider)
- composePromptFromDimensions() — no hardcoded prompt text in code
- reproducibility_hash + per-dimension version stamps
- TVC format skips video prompt (briefEngine unchanged)
- composePromptWithScript() for Script Engine handoff

**Code:** director/data/, director/engines/prompt*.js
`;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('updated: DECISIONS.md');
}

const kiPath = path.join(OS, 'KNOWLEDGE_INDEX.md');
let ki = fs.readFileSync(kiPath, 'utf8');
if (!ki.includes('promptComposer')) {
  ki += `
### Prompt Composition Engine (Phase 2)

| Path | Role |
|------|------|
| director/engines/promptComposer.js | composePromptFromDimensions |
| director/engines/promptConfigLoader.js | Load versioned JSON |
| director/data/prompt-catalog.json | Catalog v2.0.0 + recipes |
| director/data/*.json | Dimension fragments |
| __tests__/aivosMerchantAdPromptEngine.test.js | MAD19–MAD25 |
`;
  fs.writeFileSync(kiPath, ki, 'utf8');
  console.log('updated: KNOWLEDGE_INDEX.md');
}

const dailyPath = path.join(OS, 'logs', 'daily', `${TODAY}.md`);
if (fs.existsSync(dailyPath)) {
  let d = fs.readFileSync(dailyPath, 'utf8');
  if (!d.includes('Phase 2 implementation')) {
    d += `
---

## Session 007 — AI Director Phase 2 Implementation

- Prompt Composition Engine with 9 external dimension configs
- 25/25 regression PASS
- TVC pipeline untouched

**Next:** Phase 3 Script Engine (approval required)
`;
    fs.writeFileSync(dailyPath, d, 'utf8');
    console.log('updated: daily log');
  }
}

console.log('done');
