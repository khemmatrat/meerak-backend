#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(osDir, { recursive: true });

const sprint = `# Sprint 30f — FTX Rollout

**Status:** COMPLETE · ${today}

## Delivered

- **Discover cards** — \`FtxDiscoverCards\` on personalized home (\`discover\` section)
- **Rollout gates** — \`lib/experience/rollout.ts\`, kill switch \`NEXT_PUBLIC_EXPERIENCE_KILL=1\` / \`AIVOS_EXPERIENCE_KILL=1\`
- **Rollout monitor** — \`GET /api/experience/rollout\` (7-day funnel counts)
- **Mobile handoff** — default \`/m/home?ftx=1\` via \`marketplaceHandoff.ts\` + \`MarketplaceEmbed\`
- **Auth handoff** — \`/m/auth/handoff\` → \`experienceHandoffNext()\`
- **Regression** — \`scripts/experience-ftx-rollout-regression.mjs\` + extended services regression

## Env (staging / prod)

**Storefront**
\`\`\`
NEXT_PUBLIC_EXPERIENCE_ENGINE=1
NEXT_PUBLIC_EXPERIENCE_FTX=1
NEXT_PUBLIC_JARVIS_PROACTIVE=1
# rollback:
# NEXT_PUBLIC_EXPERIENCE_KILL=1
\`\`\`

**Backend**
\`\`\`
AIVOS_EXPERIENCE_ENABLED=1
AIVOS_EXPERIENCE_FTX=1
AIVOS_JARVIS_PROACTIVE=1
AIVOS_EXPERIENCE_TOUR=1
# rollback:
# AIVOS_EXPERIENCE_KILL=1
\`\`\`

## Rollback

Set kill switch → instant revert to Sprint 27 home shell (no FTX overlay).

## Next

Sprint 30e — Analytics funnel + nexus-admin FTX dashboard
`;

fs.writeFileSync(path.join(osDir, 'SPRINT_30f.md'), sprint);
fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 30e — Analytics + Admin FTX dashboard\n\n- Funnel API aggregation\n- nexus-admin-core FTX dashboard view\n- Monitor \`/api/experience/rollout\` in staging before prod\n`,
);
console.log('Sprint 30f docs written');
