#!/usr/bin/env node
/** AQOND-OS sync after AI Director Phase 1 implementation */
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
**Session:** 006 — AI Director Phase 1 (Core Orchestrator)

---

## Resume Point

**WAITING FOR USER APPROVAL** before Phase 2 (Prompt Engine).

Phase 1 complete. Next: structured JSON prompt libraries + promptEngine.js

---

## Phase 1 Delivered

- \`backend/lib/aivos/merchant-ad/director/\` — orchestrator + engine interfaces
- Video provider registry (tvc_pipeline, ugc_grok stub)
- \`generateVideo()\`, \`generateVoice()\`, \`generateSubtitle()\` extension points
- API: POST /api/aivos/merchant-ad/director/plan | /director/run
- **generate() unchanged** — no director_plan on legacy jobs

---

## Tests

\`cd backend && node --test __tests__/aivosMerchantAd.test.js __tests__/aivosMerchantAdDirector.test.js\`

**18/18 PASS** (MAD01–MAD11 legacy + MAD12–MAD18 director)

---

## Regression

- TVC via generate(): unchanged (MAD08, MAD15)
- TVC via director.run(): works (MAD16)
- UGC: fails with DIRECTOR_UGC_NOT_READY until Phase 4 (MAD17)

---

## Blockers

None. Awaiting approval for Phase 2 only.
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}  
**Status:** Phase 1 complete — **await approval for Phase 2**

---

## Phase 2 — Prompt Engine (NOT STARTED)

1. Create \`data/ugc-prompts.json\`, \`data/ugc-styles.json\`
2. Implement \`promptEngine.js\` — load from config, no hardcoded prompts
3. Wire composePrompt() to libraries
4. Tests + AQOND-OS update
5. Wait for approval before Phase 3

**Do NOT start Phase 2 until user approves.**

---

## Reference

Planning: docs/aqond-os/products/brain/
Code: backend/lib/aivos/merchant-ad/director/
`);

write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}

---

## Sprint

| Module | Progress |
|--------|----------|
| PDP Video | 100% |
| Ad Studio Publish | 100% |
| **AI Director Phase 1** | **100%** |
| AI Director Phase 2–8 | 0% (gated) |
| UGC Lip Sync video | 0% (Phase 4) |

---

## AI Director Phase 1

- Orchestrator: createDirectorOrchestrator()
- Formats: tvc_multi_shot | ugc_lipsync (routing only)
- Providers: tvc_pipeline (live), ugc_grok (stub)
- Legacy generate(): **unchanged**
- Tests: 18/18 PASS

---

## APIs (new)

- POST /api/aivos/merchant-ad/director/plan
- POST /api/aivos/merchant-ad/director/run
`);

const decisionsPath = path.join(OS, 'DECISIONS.md');
let decisions = fs.readFileSync(decisionsPath, 'utf8');
if (!decisions.includes('ADR-006')) {
  decisions += `
## ADR-006 — AI Director Phase 1 Implementation (${TODAY})

**Status:** Accepted

**Decision:**
- Add \`director/\` module with provider registry pattern
- \`generate()\` remains untouched for TVC backward compatibility
- New \`director.run()\` / \`director.plan()\` for orchestrated flows
- Provider-specific logic only in \`providers/video/*\`
- UGC video stub returns DIRECTOR_UGC_NOT_READY until Phase 4
- Last-registered video provider wins for same format (extension point)

**Code:** backend/lib/aivos/merchant-ad/director/
`;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('updated: DECISIONS.md');
}

const kiPath = path.join(OS, 'KNOWLEDGE_INDEX.md');
let ki = fs.readFileSync(kiPath, 'utf8');
if (!ki.includes('director/orchestrator')) {
  ki += `
### AI Director code (Phase 1)

| Path | Role |
|------|------|
| backend/lib/aivos/merchant-ad/director/orchestrator.js | Orchestrator |
| backend/lib/aivos/merchant-ad/director/engines/videoEngine.js | generateVideo() |
| backend/lib/aivos/merchant-ad/director/providers/video/ | TVC + UGC adapters |
| backend/__tests__/aivosMerchantAdDirector.test.js | MAD12–MAD18 |
`;
  fs.writeFileSync(kiPath, ki, 'utf8');
  console.log('updated: KNOWLEDGE_INDEX.md');
}

const dailyPath = path.join(OS, 'logs', 'daily', `${TODAY}.md`);
if (fs.existsSync(dailyPath)) {
  let d = fs.readFileSync(dailyPath, 'utf8');
  if (!d.includes('Phase 1 implementation')) {
    d += `
---

## Session 006 — AI Director Phase 1 Implementation

- Added director/ orchestrator module (18/18 tests PASS)
- New APIs: director/plan, director/run
- generate() backward compatible (MAD15)
- UGC stub until Phase 4

**Next:** Phase 2 Prompt Engine (approval required)
`;
    fs.writeFileSync(dailyPath, d, 'utf8');
    console.log('updated: daily log');
  }
}

console.log('done');
