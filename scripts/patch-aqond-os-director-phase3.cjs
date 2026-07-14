#!/usr/bin/env node
/** AQOND-OS sync after AI Director Phase 3 */
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
**Session:** 008 — AI Director Phase 3 (Script Strategy Engine)

---

## Resume Point

**WAITING FOR USER APPROVAL** before Phase 4 (UGC Lip Sync video).

---

## Phase 3 Delivered

Pipeline: Business Context → Strategy Engine → Psychology Engine → Script Composer → Prompt Engine

- script-catalog.json v3.0.0 + 5 config files
- 11 marketing strategies (sell_memory, sell_time, sell_confidence, ...)
- 9 script types (ugc, tvc, story, interview, explainer, product_demo, recruitment, review, testimonial)
- Industry auto-strategy: food→memory+happiness, beauty→confidence+beauty, marketplace→time+value
- Layers: business → strategy → emotion → hook → pain → solution → offer → cta
- Tests: 32/32 PASS

---

## Regression

\`cd backend && node --test __tests__/aivosMerchantAd*.test.js\`

---

## Do NOT start Phase 4 until user approves.
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}  
**Status:** Phase 3 complete — **await approval for Phase 4**

---

## Phase 4 — UGC Lip Sync Video (NOT STARTED)

1. Implement ugcProvider with Grok grok-imagine-video-1.5
2. merchant_ad_ugc.py 10s single clip
3. Wire composed prompt + script to Grok
4. E2E test one clip
5. AQOND-OS update

**Do NOT start until user approves.**
`);

write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}

| Module | Progress |
|--------|----------|
| AI Director Phase 1 | 100% |
| AI Director Phase 2 | 100% |
| **AI Director Phase 3** | **100%** |
| Phase 4 UGC Video | 0% (gated) |
| TVC generate() | unchanged |

**Tests:** 32/32 PASS
`);

const decisionsPath = path.join(OS, 'DECISIONS.md');
let decisions = fs.readFileSync(decisionsPath, 'utf8');
if (!decisions.includes('ADR-008')) {
  decisions += `
## ADR-008 — Script Strategy Engine Phase 3 (${TODAY})

**Status:** Accepted

**Decision:**
- Layered pipeline: Business → Strategy → Psychology → Script → Prompt
- Marketing strategies externalized in JSON; industry maps in business-strategy-map.json
- 9 script types share one engine; strategy selection varies by business context
- TVC video pipeline unchanged; script still generated for director_plan metadata
- composePromptWithScript() binds full_text_th to Grok spoken layer

**Code:** director/data/script-*.json, director/engines/{businessContext,strategyEngine,psychologyEngine,scriptComposer}.js
`;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('updated: DECISIONS.md');
}

const kiPath = path.join(OS, 'KNOWLEDGE_INDEX.md');
let ki = fs.readFileSync(kiPath, 'utf8');
if (!ki.includes('script_strategy_engine')) {
  ki += `
### Script Strategy Engine (Phase 3)

| Path | Role |
|------|------|
| director/engines/strategyEngine.js | Marketing strategy selection |
| director/engines/psychologyEngine.js | Emotional strategy |
| director/engines/scriptComposer.js | Layer composition |
| director/data/script-catalog.json | Catalog v3.0.0 |
| director/data/marketing-strategies.json | 11 sell strategies |
| director/data/business-strategy-map.json | Industry→strategy |
| __tests__/aivosMerchantAdScriptEngine.test.js | MAD26–MAD32 |
`;
  fs.writeFileSync(kiPath, ki, 'utf8');
  console.log('updated: KNOWLEDGE_INDEX.md');
}

const dailyPath = path.join(OS, 'logs', 'daily', `${TODAY}.md`);
if (fs.existsSync(dailyPath)) {
  let d = fs.readFileSync(dailyPath, 'utf8');
  if (!d.includes('Phase 3 implementation')) {
    d += `
---

## Session 008 — AI Director Phase 3 Script Strategy Engine

- Business→Strategy→Psychology→Script pipeline
- 32/32 regression PASS
- TVC pipeline untouched

**Next:** Phase 4 UGC Lip Sync (approval required)
`;
    fs.writeFileSync(dailyPath, d, 'utf8');
    console.log('updated: daily log');
  }
}

console.log('done');
