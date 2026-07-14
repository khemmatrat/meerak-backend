#!/usr/bin/env node
/**
 * Sprint 30c — Smart Entry Wizard docs
 * Usage: node apps/storefront/scripts/write-sprint30c-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');
const osDir = path.join(root, 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(osDir, { recursive: true });

const DOC = `# Sprint 30c — Smart Entry Wizard

**Status:** COMPLETE  
**Date:** ${today}

## Delivered

| Item | Path |
|------|------|
| Wizard UI (3 steps) | \`components/experience/FtxSmartEntryWizard.tsx\` |
| Route | \`/m/ftx/wizard\` |
| Config | \`lib/experience/wizardConfig.ts\` |
| Guest draft | \`lib/experience/wizardStorage.ts\` |
| Submit client | \`lib/experience/experienceClient.ts\` |
| Profile store | \`backend/lib/experience/experienceProfileStore.js\` |

## Wizard steps

1. Referral source
2. Profile (optional)
3. Interests → redirect by primary intent

## Next: Sprint 30d

Home module reorder + guided tour
`;

fs.writeFileSync(path.join(osDir, 'SPRINT_30c.md'), DOC);
fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 30d — Personalization + Tour\n\n1. Reorder /m/home modules by intent\n2. Guided tour overlay\n3. Jarvis auto-greet hook\n`,
);
console.log('Sprint 30c docs written');
