#!/usr/bin/env node
/**
 * Sprint 30 — Experience Engine + AQOND Kernel planning docs
 * Usage: node apps/storefront/scripts/write-sprint30-experience-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');
const osDir = path.join(root, 'docs', 'aqond-os');
const productsDir = path.join(osDir, 'products');

fs.mkdirSync(productsDir, { recursive: true });

const STACK = `# AQOND Experience Stack

\`\`\`
Home
  ↓
FTX (First-Time overlay + wizard)
  ↓
Experience Engine (orchestrator)
  ↓
Personalization (module order)
  ↓
AI Memory (preferences, favorites)
  ↓
Recommendation (cross-product)
  ↓
Growth (promotions, campaigns)
\`\`\`

FTX is **one layer** — not the whole system. All products share the same Experience Engine.

## Products on shared experience

AQOND Food · Market · Jobs · Wallet · Pay · Brain · Courses · Rider · Merchant · Services · Feed

Each product calls **AQOND Kernel → Experience Engine** — not cross-wire APIs.
`;

const KERNEL = `# AQOND Kernel (target architecture)

Central hub — every product connects here:

\`\`\`
AQOND Kernel
├── Identity
├── Wallet
├── Pay
├── Event Bus
├── Analytics
├── Experience Engine  ← Sprint 30
├── AI Director
├── Jarvis (AI OS)
├── Notification
├── Feature Flag
├── Permissions
├── Audit
└── API Gateway
\`\`\`

**Sprint 30a:** Experience Engine stubs in \`backend/lib/experience/\`.  
Kernel is **documented target** — incremental extraction, not big-bang rewrite.

## Experience Engine modules (30a stubs)

| Module | File | Role |
|--------|------|------|
| Orchestrator | experienceEngine.js | getSnapshot, layers |
| Intent | intentEngine.js | Primary / Secondary / Hidden |
| Lifecycle | lifecycleEngine.js | Visitor → Enterprise |
| Personalization | personalizationEngine.js | Home module order |
| AI Memory | aiMemoryEngine.js | context_json extension |
| Recommendation | recommendationEngine.js | Delegates to recsys |
| Growth | growthDecisionEngine.js | Wraps growthEngine |
| Feature gate | featureGateEngine.js | AIVOS_EXPERIENCE_* flags |
`;

const INTENT = `# Intent Engine

On signup / wizard — not just "what I want to do" but computed:

- **Primary Intent** — main selection
- **Secondary Intent** — other selections
- **Hidden Intent** — expanded dependency graph

Example: เปิดร้านอาหาร → merchant → food → delivery → wallet → ads → analytics → ai

System knows **what to show first** on Home, Jarvis, tutorials, promotions.

Implementation: \`backend/lib/experience/intentEngine.js\` (stub 30a).
`;

const LIFECYCLE = `# Lifecycle Engine

FTX does not end at signup:

\`\`\`
Visitor → New User → Activated → Power User
  → Merchant → Partner → VIP → Enterprise
\`\`\`

Each stage changes: Home layout, Jarvis tone, tutorials, promotions.

Implementation: \`backend/lib/experience/lifecycleEngine.js\` (stub 30a).
`;

const JARVIS_OS = `# Jarvis as AI OS (not floating chat)

Jarvis must **speak first** with proactive briefs:

- วันนี้ยังไม่ได้ตอบลูกค้า
- ร้านยังไม่เปิด
- ยอดขายลด / อาหารขายดี
- Wallet เข้ามา / Rider ขาด
- คอร์สขายได้

API: \`GET /api/experience/jarvis-brief\` (stub 30a).  
Reuse: \`/api/ai/jarvis\`, \`JarvisFab\`, ai-core prompt — extend, do not recreate.

Flag: \`AIVOS_JARVIS_PROACTIVE=1\`
`;

const FTX_PRODUCT = `# FTX — First-Time Experience (layer)

**Parent:** Experience Engine  
**Not:** standalone product

FTX = Welcome overlay + Smart Entry Wizard + guided tour on \`/m/home\`.

After onboarding, **Lifecycle + Intent + Personalization** take over for all visits.

See: experience-stack.md, SPRINT_30_FTX_ARCHITECTURE.md
`;

const SPRINT30A = `# Sprint 30a — Delivered

**Date:** 2026-07-01  
**Status:** COMPLETE (stubs + BFF + migration file)

## Backend

- \`backend/lib/experience/*.js\` — 8 engine stubs + routes
- \`attachExperienceRoutes\` in server.js
- \`038_experience_engine.sql\`

## API

- \`GET /api/experience/state\`
- \`POST /api/experience/preferences\`
- \`POST /api/experience/events\`
- \`GET /api/experience/flags\`
- \`GET /api/experience/jarvis-brief\`

## Storefront BFF

- \`/api/experience/*\` pass-through

## Flags

| Env | Purpose |
|-----|---------|
| AIVOS_EXPERIENCE_ENABLED | Master backend switch |
| AIVOS_EXPERIENCE_FTX | FTX overlay |
| AIVOS_JARVIS_PROACTIVE | Proactive Jarvis brief |
| NEXT_PUBLIC_EXPERIENCE_ENGINE | Client flag |

## Next: Sprint 30b

FTX Home shell + Welcome overlay UI (no logic change in engines).
`;

fs.writeFileSync(path.join(osDir, 'experience-stack.md'), STACK);
fs.writeFileSync(path.join(osDir, 'AQOND_KERNEL.md'), KERNEL);
fs.writeFileSync(path.join(osDir, 'INTENT_ENGINE.md'), INTENT);
fs.writeFileSync(path.join(osDir, 'LIFECYCLE_ENGINE.md'), LIFECYCLE);
fs.writeFileSync(path.join(osDir, 'JARVIS_AI_OS.md'), JARVIS_OS);
fs.writeFileSync(path.join(productsDir, 'ftx.md'), FTX_PRODUCT);
fs.writeFileSync(path.join(osDir, 'SPRINT_30a.md'), SPRINT30A);

// Patch SESSION / NEXT_TASK / CURRENT_STATUS
const today = '2026-07-01';
fs.writeFileSync(
  path.join(osDir, 'CURRENT_STATUS.md'),
  `# CURRENT STATUS\n\n**Date:** ${today}\n\n| Sprint | Status |\n|--------|--------|\n| 28 Services | COMPLETE |\n| 29 Component Registry | COMPLETE |\n| **30a Experience Engine stubs** | **COMPLETE** |\n| 30b FTX Home UI | NEXT |\n\n## Experience Stack\n\nHome → FTX → Experience Engine → Personalization → AI Memory → Recommendation → Growth\n\n## Docs\n\n- experience-stack.md, AQOND_KERNEL.md, INTENT_ENGINE.md, LIFECYCLE_ENGINE.md, JARVIS_AI_OS.md\n- products/ftx.md, SPRINT_30a.md\n`,
);

fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 30b — FTX Home Experience UI\n\n1. FtxHomeShell on /m/home (feature flag)\n2. FtxWelcomeOverlay (guest, dismissible)\n3. Header: Logo | Search | Notifications | Language | Login | Register\n4. Wire /api/experience/state on mount\n5. No wizard UI yet (30c)\n\nRun migration: psql -f aqond-v2/infra/postgres/migrations/038_experience_engine.sql\n`,
);

fs.writeFileSync(
  path.join(osDir, 'SESSION.md'),
  `# SESSION\n\n**Updated:** ${today}\n**Resume:** Sprint 30b — FTX Home shell UI\n\n30a done: experience engine stubs, BFF, migration SQL, docs.\n`,
);

const decPath = path.join(osDir, 'DECISIONS.md');
if (fs.existsSync(decPath)) {
  let dec = fs.readFileSync(decPath, 'utf8');
  if (!dec.includes('ADR-FTX-002')) {
    dec += `\n## ADR-FTX-002 — Experience Engine over FTX-only (${today})\n\n**Status:** Accepted\n\nFTX is a layer under Experience Engine. Intent Engine (primary/secondary/hidden), Lifecycle (visitor→enterprise), Jarvis AI OS proactive briefs. AQOND Kernel as long-term hub. Products must not cross-wire — use createExperienceRuntime().\n`;
    fs.writeFileSync(decPath, dec);
  }
}

const kiPath = path.join(osDir, 'KNOWLEDGE_INDEX.md');
if (fs.existsSync(kiPath)) {
  let ki = fs.readFileSync(kiPath, 'utf8');
  const adds = [
    ['experience-stack.md', 'Experience layer stack'],
    ['AQOND_KERNEL.md', 'Kernel target architecture'],
    ['INTENT_ENGINE.md', 'Primary/secondary/hidden intent'],
    ['LIFECYCLE_ENGINE.md', 'User lifecycle stages'],
    ['JARVIS_AI_OS.md', 'Proactive Jarvis'],
    ['SPRINT_30a.md', 'Sprint 30a deliverables'],
  ];
  for (const [file, desc] of adds) {
    if (!ki.includes(file)) ki += `\n| ${desc} | docs/aqond-os/${file} | Sprint 30 |`;
  }
  fs.writeFileSync(kiPath, ki);
}

console.log('Experience Engine + Kernel docs written to docs/aqond-os/');
