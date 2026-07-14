#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);

fs.writeFileSync(
  path.join(osDir, 'SPRINT_32.md'),
  `# Sprint 32 — Conversation Memory Engine

**Status:** COMPLETE · ${today}

## Delivered

- Tiered memory: short (15m turns), medium (7d), long (years), permanent (jarvis_locale)
- \`backend/lib/jarvis/conversationMemory.js\`
- Extended \`aiMemoryEngine.js\` — mergeTurn + summary
- Jarvis route hook — \`memory_summary\` in prompt, persist \`jarvis_memory\`
- APIs: \`GET /api/jarvis/memory\`, \`POST /api/jarvis/memory/merge\`
- BFF: \`app/api/jarvis/memory/route.ts\`
- Client \`session.ts\` — turns + 15m prune

## Schema (context_json)

\`\`\`json
{ "jarvis_memory": { "v": 1, "medium": {...}, "long": {...} } }
\`\`\`

## Flags

\`\`\`
AIVOS_JARVIS_MEMORY=1
JARVIS_MEMORY=1
NEXT_PUBLIC_JARVIS_MEMORY=1
\`\`\`

## Next

Sprint 33 — Regional Persona Engine
`,
);

fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 33 — Regional Persona Engine\n\nSee \`products/jarvis/JARVIS_PERSONAS.md\`\n`,
);

console.log('Sprint 32 docs written');
