#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(osDir, { recursive: true });

fs.writeFileSync(
  path.join(osDir, 'SPRINT_31.md'),
  `# Sprint 31 — Language Intelligence Engine

**Status:** COMPLETE · ${today}

## Delivered

- \`backend/lib/jarvis/languageIntelligence.js\` — detect lang/country/tone/formality (11 regions)
- \`backend/lib/jarvis/jarvisRoutes.js\` — \`GET/POST /api/jarvis/language-profile\`
- \`lib/server/languageIntelligence.ts\` — storefront fast detect (20–50ms heuristic)
- Jarvis route hook — enriches session before ai-core (flagged)
- BFF \`app/api/jarvis/language-profile/route.ts\`
- ai-core native prompt packs: \`lib/prompts/jarvis/locales/{th,en}.js\`
- Persist \`context_json.language_profile\` via user_ai_preferences

## Flags

\`\`\`
AIVOS_JARVIS_LANG_INTEL=1
JARVIS_LANG_INTEL=1
NEXT_PUBLIC_JARVIS_LANG_INTEL=1
\`\`\`

## Next

Sprint 32 — Conversation Memory Engine (tiered memory)
`,
);

fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 32 — Conversation Memory Engine\n\n- Tiered memory: short (15m), medium (7d), long, permanent\n- Extend \`context_json.jarvis_memory\`\n- See \`products/jarvis/JARVIS_MEMORY.md\`\n`,
);

console.log('Sprint 31 docs written');
