#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(osDir, { recursive: true });

fs.writeFileSync(
  path.join(osDir, 'SPRINT_34.md'),
  `# Sprint 34 — Recommendation & Proactive Assistant

**Status:** COMPLETE · ${today}

## Delivered

- \`jarvisEventBridge.js\` — read-only commerce + experience event subscriber → \`jarvis_signals\`
- \`proactiveAssistant.js\` — recommendation matrix + enriched \`jarvis-brief\`
- \`recommendationEngine.js\` — delegates to proactive brief builder
- Merchant pending-order brief via \`commerce-signals\` internal API
- \`POST /api/jarvis/brief-dismiss\` + dismiss memory (medium tier)
- \`FtxJarvisGreet\` — real brief id, dismiss API, growth/lifecycle wiring
- Brief cache 60s + invalidate on events

## Matrix (live)

| Trigger | Brief |
|---------|-------|
| merchant.order_pending | ตอบลูกค้า N รายการ |
| order.draft / cart | เตือนรถเข็นค้าง |
| wallet.credit | แจ้งเงินเข้ากระเป๋า |
| ftx.wizard_step | ชวนทำ wizard ต่อ |
| growth.promotion | สิทธิพิเศษ |
| lifecycle welcome | ทักทาย Jarvis |

## Flags

\`\`\`
AIVOS_JARVIS_PROACTIVE=1
NEXT_PUBLIC_JARVIS_PROACTIVE=1
STOREFRONT_INTERNAL_URL=http://127.0.0.1:3003
\`\`\`

## Next

Sprint 35 — Voice & Multilingual AI
`,
);

fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK

**Updated:** ${today}

## Sprint 35 — Voice & Multilingual AI

See \`products/jarvis/JARVIS_ROADMAP.md\`
`,
);

const sessionPath = path.join(osDir, 'SESSION.md');
if (fs.existsSync(sessionPath)) {
  let session = fs.readFileSync(sessionPath, 'utf8');
  session = session.replace(/Sprint 33[^\n]*/i, 'Sprint 33 — Regional Persona Engine ✅ COMPLETE');
  session = session.replace(/Sprint 34[^\n]*/i, 'Sprint 34 — Recommendation & Proactive Assistant ✅ COMPLETE');
  session = session.replace(/Sprint 35[^\n]*/i, 'Sprint 35 — Voice & Multilingual AI (NEXT)');
  fs.writeFileSync(sessionPath, session);
}

console.log('Sprint 34 docs written');
