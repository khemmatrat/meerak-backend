#!/usr/bin/env node
/** AQOND-OS sync after Prompt Composition Engine v2.1 enhancement */
const fs = require('fs');
const path = require('path');

const OS = path.join(__dirname, '..', 'docs', 'aqond-os');
const BRAIN = path.join(OS, 'products', 'brain');
const TODAY = '2026-06-30';

function write(rel, content) {
  const full = path.join(OS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('updated:', rel);
}

write('SESSION.md', `# SESSION — Live Working Memory

**Last Updated:** ${TODAY}  
**Session:** 009 — Prompt Composition Engine v2.1 (multi-dimension + versioning)

---

## Resume Point

**WAITING FOR USER APPROVAL** before Phase 4 (UGC Lip Sync video).

---

## Phase 2 Enhancement Delivered

Prompt Engine is now a **Composition Engine** — not a JSON loader.

### Dimension composition
Business Type + Industry + Audience + Style + Platform + Language + Campaign + Offer + CTA + Provider → composed prompt

### Config-only switches (no code change)
- Restaurant → UGC → TikTok → Thai → Promotion → Soft CTA
- Restaurant → Luxury → Facebook → English → Brand Awareness → Hard CTA

### Libraries
- \`prompt-library/v{1,2,3}/languages/\` — th, en, ja, zh (+ future)
- \`prompt-library/v3/providers/\` — generic, grok, veo, runway, kling

### Versioning
- \`prompt-versions.json\` — active v3, pin v1/v2/v3 via \`guide.prompt_version\`
- Merchant jobs can replay with pinned prompt version

### Marketing strategies doc
- \`docs/aqond-os/products/brain/MARKETING_STRATEGIES.md\`
- Script Strategy Engine references manifest, not embedded concepts

**Engine:** v2.1.0 | **Catalog:** v3.0.0 | **Tests:** 36/36 PASS (MAD01–MAD36)
`);

write('NEXT_TASK.md', `# NEXT TASK

**Updated:** ${TODAY}  
**Status:** Phase 2 enhancement complete — **await approval for Phase 4**

---

## Phase 4 — UGC Lip Sync Video (NOT STARTED)

1. Implement ugcProvider with Grok grok-imagine-video-1.5
2. Wire composed prompt + script to Grok
3. E2E test one clip
4. AQOND-OS update

**Do NOT start until user approves.**
`);

write('CURRENT_STATUS.md', `# CURRENT STATUS

**Date:** ${TODAY}

| Module | Progress |
|--------|----------|
| AI Director Phase 1 | 100% |
| AI Director Phase 2 (Composition Engine v2.1) | 100% |
| AI Director Phase 3 (Script Strategy) | 100% |
| Phase 4 UGC Video | 0% (gated) |
| TVC generate() | unchanged |

**Tests:** 36/36 PASS
`);

write('products/brain/PROMPT_ENGINE.md', `# Prompt Composition Engine

**Version:** 2.1.0 | **Catalog:** 3.0.0 | **Active prompt version:** v3

---

## Purpose

Compose video prompts from **dimensions** — not load a single JSON template.

\`\`\`
Business Type + Industry + Audience + Style Preset
        + Platform + Language + Campaign Goal + Offer + CTA + AI Provider
        ↓
Compose Prompt (versioned, reproducible)
\`\`\`

---

## Dimension files

| Dimension | File |
|-----------|------|
| Business type | business-types.json |
| Industry | industries.json (+ aliases: restaurant→food) |
| Audience | audiences.json |
| Style | styles.json (+ aliases: ugc→tiktok_creator, luxury→luxury_brand) |
| Campaign | campaign-goals.json (+ promotion, brand_awareness) |
| Platform | platforms.json (+ tiktok, facebook) |
| CTA | ctas.json |
| CTA intensity | cta-intensity.json (soft / hard) |
| Provider | providers.json |

---

## Libraries (not flat JSON only)

\`\`\`
prompt-library/
├── v1/
├── v2/
└── v3/
    ├── languages/   th, en, ja, zh
    └── providers/   generic, grok, veo, runway, kling
\`\`\`

Each provider has its own \`prefix\`, \`spoken_wrapper\`, \`suffix\`.

---

## Versioning

\`prompt-versions.json\` defines v1, v2, v3. Pass \`guide.prompt_version: "v1"\` to replay old prompts after upgrade.

\`reproducibility_hash\` includes prompt_version + all dimensions.

---

## API

- \`buildPromptComposeInput(request, context)\`
- \`composePromptFromDimensions(input)\`
- \`composePromptWithScript(input, script)\`
- \`listPromptVersions()\`

---

## Code

\`backend/lib/aivos/merchant-ad/director/engines/promptConfigLoader.js\`  
\`backend/lib/aivos/merchant-ad/director/engines/promptComposer.js\`
`);

const decisionsPath = path.join(OS, 'DECISIONS.md');
let decisions = fs.existsSync(decisionsPath) ? fs.readFileSync(decisionsPath, 'utf8') : '# DECISIONS\n';
if (!decisions.includes('ADR-009')) {
  decisions += `
## ADR-009 — Prompt Composition Engine v2.1 (${TODAY})

**Status:** Accepted

**Decision:**
- Prompt Engine composes from dimensions + versioned libraries; not a single JSON loader
- Language/provider content in \`prompt-library/v{n}/\`; dimensions in shared JSON
- \`prompt_version\` pinning for merchant reproducibility across catalog upgrades
- CTA intensity (soft/hard) as separate dimension layer
- Marketing strategies documented in MARKETING_STRATEGIES.md; runtime via marketing-strategies.json + manifest

**Code:** director/engines/promptConfigLoader.js, promptComposer.js, director/data/prompt-library/
`;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('updated: DECISIONS.md');
}

console.log('patch-aqond-os-director-phase2-enhancement: complete');
