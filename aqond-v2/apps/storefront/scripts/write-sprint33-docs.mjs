#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(osDir, { recursive: true });

fs.writeFileSync(
  path.join(osDir, 'SPRINT_33.md'),
  `# Sprint 33 — Regional Persona Engine

**Status:** COMPLETE · ${today}

## Delivered

- Product personas: merchant, food, marketplace, wallet, rider, super
- Regional packs: TH, US, SG, MY, ID, CN, TW, LA, MM, BN, LK
- Tone engine (Layers 2, 4, 9) — honorific, opener, lifecycle tone
- \`backend/lib/jarvis/personaEngine.js\` + \`personas/{products,regional}.js\`
- Storefront mirror: \`lib/server/personaEngine.ts\`
- Jarvis route hook — \`jarvis_persona\` + \`prompt_section\` → ai-core
- ai-core: \`prompts/jarvis/persona.js\`, locale packs TH + EN
- API: \`GET /api/jarvis/persona\`
- BFF: \`app/api/jarvis/persona/route.ts\`

## Pipeline

\`\`\`
POST /api/ai/jarvis
  → [31] language_profile
  → [32] memory_summary
  → [33] jarvis_persona (product + regional + tone)
  → ai-core /v1/jarvis/concierge (localized prompt + persona section)
\`\`\`

## Flags

\`\`\`
AIVOS_JARVIS_PERSONA=1
AIVOS_JARVIS_TONE=1
JARVIS_PERSONA=1
NEXT_PUBLIC_JARVIS_PERSONA=1
\`\`\`

## Next

Sprint 34 — Recommendation & Proactive Assistant
`,
);

fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK

**Updated:** ${today}

## Sprint 34 — Recommendation & Proactive Assistant

See \`products/jarvis/JARVIS_ROADMAP.md\`
`,
);

const sessionPath = path.join(osDir, 'SESSION.md');
if (fs.existsSync(sessionPath)) {
  let session = fs.readFileSync(sessionPath, 'utf8');
  session = session.replace(/Sprint 33[^\n]*/i, 'Sprint 33 — Regional Persona Engine ✅ COMPLETE');
  session = session.replace(/Sprint 34[^\n]*/i, 'Sprint 34 — Recommendation & Proactive Assistant (NEXT)');
  fs.writeFileSync(sessionPath, session);
}

console.log('Sprint 33 docs written');
