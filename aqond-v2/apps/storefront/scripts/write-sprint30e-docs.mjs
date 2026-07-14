#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(osDir, { recursive: true });

const sprint = `# Sprint 30e — Analytics + Admin FTX Dashboard

**Status:** COMPLETE · ${today}

## Backend

- \`backend/lib/experience/experienceAnalytics.js\` — funnel aggregation
- \`GET /api/admin/ftx/dashboard?rangeDays=30\` — admin auth required
- Metrics: funnel steps, guest vs registered, referral sources, primary intents, retention, daily events

## Storefront events

- \`experience.first_launch\` — once per browser (localStorage)
- \`ftx.jarvis_greet_shown\` — proactive Jarvis chip

## nexus-admin

- \`components/FtxDashboardView.tsx\`
- Sidebar: **AQOND FTX** (\`ftx-dashboard\`)
- \`getFtxDashboard()\` in \`services/adminApi.ts\`

## Monitor

- Rollout: \`GET /api/experience/rollout\`
- Admin funnel: nexus-admin → Strategy & Growth → AQOND FTX
`;

fs.writeFileSync(path.join(osDir, 'SPRINT_30e.md'), sprint);
fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 30 — COMPLETE (30a–30f + 30e)\n\n- Monitor FTX funnel in nexus-admin\n- Prod rollout when ready (\`NEXT_PUBLIC_EXPERIENCE_KILL\` rollback)\n`,
);
console.log('Sprint 30e docs written');
