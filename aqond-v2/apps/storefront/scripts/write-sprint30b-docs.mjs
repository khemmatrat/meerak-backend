#!/usr/bin/env node
/**
 * Sprint 30b — FTX Home UI docs (AQOND-OS)
 * Usage: node apps/storefront/scripts/write-sprint30b-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');
const osDir = path.join(root, 'docs', 'aqond-os');

fs.mkdirSync(osDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);

const SPRINT_30B = `# Sprint 30b — FTX Home Experience UI

**Status:** COMPLETE  
**Date:** ${today}

## Delivered

| Item | Path |
|------|------|
| FtxHomeShell | \`components/experience/FtxHomeShell.tsx\` |
| FtxHomeHeader | Logo · Search · Notifications · Language · Login · Register |
| FtxWelcomeOverlay | Guest-only, dismissible, discover cards |
| Experience hook | \`lib/experience/useExperienceState.ts\` |
| Guest storage | \`lib/experience/guestStorage.ts\` → \`aqond_ftx_guest_v1\` |
| Styles | \`components/experience/ftx-axs.css\` |
| Home wiring | \`app/m/home/page.tsx\` |

## Feature flags

| Env | Layer |
|-----|-------|
| \`NEXT_PUBLIC_EXPERIENCE_ENGINE=1\` | Client experience gate |
| \`NEXT_PUBLIC_EXPERIENCE_FTX=1\` | FTX shell + overlay |
| \`AIVOS_EXPERIENCE_ENABLED=1\` | Backend snapshot |

Query override: \`/m/home?ftx=1\` (force on) · \`?ftx=0\` (force off)

## API wired on mount

- \`GET /api/experience/state?surface=home&guestId=...\`
- \`POST /api/experience/events\` — \`ftx.welcome_shown\`, \`ftx.welcome_dismissed\`, \`ftx.welcome_explore\`

## Not in 30b (30c+)

- Smart Entry Wizard (\`/m/ftx/wizard\`)
- Personalized module reorder
- Guided tour spotlight
- Jarvis auto-greet wiring

## Regression

\`\`\`bash
node apps/storefront/scripts/services-theme-regression.mjs
\`\`\`

Includes \`/m/home\`, \`/m/home?ftx=1\`, \`/m/home?ftx=0\`.
`;

fs.writeFileSync(path.join(osDir, 'SPRINT_30b.md'), SPRINT_30B);

const statusPath = path.join(osDir, 'CURRENT_STATUS.md');
if (fs.existsSync(statusPath)) {
  let s = fs.readFileSync(statusPath, 'utf8');
  s = s.replace('| 30b FTX Home UI | NEXT |', '| **30b FTX Home UI** | **COMPLETE** |');
  s = s.replace('| **30a Experience Engine stubs** | **COMPLETE** |', '| **30a Experience Engine stubs** | **COMPLETE** |\n| **30b FTX Home UI** | **COMPLETE** |');
  if (!s.includes('30b FTX')) {
    s += '\n| **30b FTX Home UI** | **COMPLETE** |\n';
  }
  fs.writeFileSync(statusPath, s);
}

const nextPath = path.join(osDir, 'NEXT_TASK.md');
fs.writeFileSync(
  nextPath,
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 30c — Smart Entry Wizard\n\n1. \`/m/ftx/wizard\` multi-step UI\n2. POST \`/api/experience/preferences\` (interests, referral source)\n3. Persist to \`commerce.user_experience_profiles\`\n4. Post-wizard redirect by primary intent\n5. Hide wizard when \`wizard_completed_at\` set\n`,
);

const sessionPath = path.join(osDir, 'SESSION.md');
fs.writeFileSync(
  sessionPath,
  `# SESSION\n\n**Updated:** ${today}\n**Resume:** Sprint 30c — Smart Entry Wizard\n\n30b done: FtxHomeShell, welcome overlay, experience state on /m/home.\n`,
);

console.log('Sprint 30b docs written:', osDir);
