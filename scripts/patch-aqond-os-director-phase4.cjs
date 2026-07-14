#!/usr/bin/env node
/** AQOND-OS sync after AI Director Phase 4 */
const fs = require('fs');
const path = require('path');

const OS = path.join(__dirname, '..', 'docs', 'aqond-os');
const TODAY = '2026-06-30';

function write(rel, content) {
  const full = path.join(OS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('updated:', rel);
}

write('SESSION.md', `# SESSION — Live Working Memory

**Last Updated:** ${TODAY}  
**Session:** 010 — AI Director Phase 4 (UGC Lip Sync Pipeline)

---

## Resume Point

**WAITING FOR USER APPROVAL** before production rollout.

---

## Phase 4 Delivered

Generation flow:
\`\`\`
Request → Validation → Planning → Capability Check → Video Generation → Publishing → Completion
\`\`\`

### Components
- **Validation Layer** — \`validationEngine.js\` (image, script, prompt, tokens, aspect, language)
- **Cost Estimation** — \`costEstimationEngine.js\` (tokens, duration, 720p, 9:16)
- **Capability Layer** — \`capabilityLayer.js\` + \`provider-capabilities.json\` (Grok/Veo/Runway/Kling)
- **State Machine** — \`generationStateMachine.js\` (queued→planning→validating→generating→uploading→publishing→completed)
- **Merchant Preview** — \`previewEngine.js\` via \`POST /director/plan\`

### UGC Provider
- \`ugcProvider.js\` → capability check → \`grokUgcAdapter.js\` → \`ugcVideoBridge.js\` → \`merchant_ad_ugc.py\`
- No direct Grok calls inside Director orchestrator
- Mock mode: \`AIVOS_MERCHANT_AD_MOCK_UGC=1\`

**Director Phase:** 4 | **Tests:** 38/38 PASS

---

## Production gate

Do NOT enable production Grok UGC until user approves rollout.
Set \`AIVOS_MERCHANT_AD_GROK_VIDEO=1\` + \`XAI_API_KEY\` for live generation.
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}  
**Status:** Phase 4 complete — **await approval for production rollout**

---

## Production Rollout (NOT STARTED)

1. User approval for live Grok UGC
2. Storefront proxy \`director/plan\` + \`director/run\` + preview UI
3. E2E test with real XAI key
4. Monitor token economics

**Do NOT enable production until user approves.**
`);

write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}

| Module | Progress |
|--------|----------|
| AI Director Phase 1–3 | 100% |
| **AI Director Phase 4** | **100%** (mock + pipeline) |
| Production UGC rollout | 0% (gated) |
| TVC generate() | unchanged |

**Tests:** 38/38 PASS
`);

write('products/brain/UGC_LIPSYNC_ARCHITECTURE.md', `# UGC Lip Sync Architecture — Phase 4

## Generation Flow

\`\`\`
Merchant Request
    ↓
Validation Layer (sync — no credit on failure)
    ↓
Planning (script + prompt composition)
    ↓
Provider Capability Check
    ↓
Video Generation (UGC Provider → Adapter → Bridge → Python)
    ↓
Publishing (optional auto_publish)
    ↓
Completed
\`\`\`

## State Machine

| State | Description |
|-------|-------------|
| queued | Job created |
| planning | Director plan built |
| validating | Input checks passed |
| generating | Video provider running |
| uploading | Output normalized |
| publishing | Studio publish |
| completed | Done |

### Error codes
\`validation_failed\` | \`capability_unavailable\` | \`provider_failed\` | \`timeout\` | \`quota_exceeded\` | \`publish_failed\`

## Merchant Preview (\`POST /director/plan\`)

Returns: script, prompt_summary, duration, style, cost_estimate, validation, capabilities, ready_to_generate

## Provider Layer

\`\`\`
ugcProvider (ugc_grok)
    ↓ capabilityLayer.checkProviderCapabilities()
    ↓ grokUgcAdapter (or future veo/kling adapters)
    ↓ ugcVideoBridge.generateUgcClip()
    ↓ aqond-brain/scripts/merchant_ad_ugc.py
\`\`\`

Director orchestrator has **no** provider-specific logic.

## Env flags

| Flag | Purpose |
|------|---------|
| AIVOS_MERCHANT_AD_VIDEO_GEN | Master video switch |
| AIVOS_MERCHANT_AD_GROK_VIDEO | Live Grok UGC |
| AIVOS_MERCHANT_AD_MOCK_UGC | Mock ffmpeg clip (dev/test) |
| XAI_API_KEY | Grok credentials |
`);

const decisionsPath = path.join(OS, 'DECISIONS.md');
let decisions = fs.existsSync(decisionsPath) ? fs.readFileSync(decisionsPath, 'utf8') : '# DECISIONS\n';
if (!decisions.includes('ADR-010')) {
  decisions += `
## ADR-010 — UGC Lip Sync Phase 4 (${TODAY})

**Status:** Accepted

**Decision:**
- Validation before async generation; validation_failed returns 400 without token deduct
- Provider capability layer externalized in provider-capabilities.json
- UGC provider uses adapter pattern; Grok isolated in grokUgcAdapter + ugcVideoBridge
- Generation state machine on job.generation_state + generation_timeline
- Merchant preview bundled in director/plan response
- TVC legacy generate() unchanged

**Code:** director/engines/{validation,costEstimation,preview}Engine.js, director/state/, ugcVideoBridge.js, merchant_ad_ugc.py
`;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('updated: DECISIONS.md');
}

console.log('patch-aqond-os-director-phase4: complete');
