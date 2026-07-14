#!/usr/bin/env node
/** Patch AQOND-OS docs to integrate SESSION.md management system */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs', 'aqond-os');

function patch(file, replacements) {
  const full = path.join(ROOT, file);
  let content = fs.readFileSync(full, 'utf8');
  for (const [oldStr, newStr] of replacements) {
    if (!content.includes(oldStr)) {
      console.warn(`WARN: pattern not found in ${file}:`, oldStr.slice(0, 60) + '...');
      continue;
    }
    content = content.replace(oldStr, newStr);
  }
  fs.writeFileSync(full, content, 'utf8');
  console.log('patched:', file);
}

patch('README.md', [
  [
    `## AI Reading Rules (Required — Start of Every Session)

Read **ONLY** these files, in order:

1. [README.md](./README.md) (this file)
2. [CURRENT_STATUS.md](./CURRENT_STATUS.md)
3. [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) (skim relevant sections)
4. [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) (locate task modules only)
5. [NEXT_TASK.md](./NEXT_TASK.md)
6. [DECISIONS.md](./DECISIONS.md) (recent entries)
7. Latest file in [logs/daily/](./logs/daily/)

**Do NOT** scan unrelated markdown under \`docs/\` unless explicitly referenced by the Knowledge Index.`,
    `## AI Reading Rules (Required — Start of Every Session)

### Before writing code (minimal resume set)

1. [SESSION.md](./SESSION.md) — **live working memory; resume from Resume Point**
2. [CURRENT_STATUS.md](./CURRENT_STATUS.md)
3. [NEXT_TASK.md](./NEXT_TASK.md)

If SESSION.md exists: **do NOT** restart project analysis or rediscover completed work.  
Only open additional files when SESSION.md or the Knowledge Index requires it.

### Full context (first session or architecture work)

4. [README.md](./README.md) (this file)
5. [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) (skim relevant sections)
6. [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) (locate task modules only)
7. [DECISIONS.md](./DECISIONS.md) (recent entries)
8. Latest file in [logs/daily/](./logs/daily/)

**Do NOT** scan unrelated markdown under \`docs/\` unless explicitly referenced by the Knowledge Index.`
  ],
  [
    `| File | Role |
|------|------|
| README.md | Entry point, rules |
| CURRENT_STATUS.md | Today's state |`,
    `| File | Role |
|------|------|
| SESSION.md | **Live working memory** — current session; overwritten during dev |
| README.md | Entry point, rules |
| CURRENT_STATUS.md | Today's state |`
  ],
  [
    `## Documentation Maintenance (After Every Completed Task)

1. Update [CURRENT_STATUS.md](./CURRENT_STATUS.md)`,
    `## SESSION.md Rules

- **One file only:** \`docs/aqond-os/SESSION.md\`
- **During development:** update continuously (progress, working files, resume point, regression)
- **Before writing code:** read SESSION.md; resume from Resume Point
- **End of session:** finalize SESSION.md, then sync to other docs below

## Documentation Maintenance (After Every Completed Task)

0. Update [SESSION.md](./SESSION.md) — progress, resume point, regression checklist
1. Update [CURRENT_STATUS.md](./CURRENT_STATUS.md)`
  ],
  [
    `| [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) | Full platform architecture |
| [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) | Module lookup — use before scanning code |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | **Start here** — today's state |
| [NEXT_TASK.md](./NEXT_TASK.md) | Current sprint task card |`,
    `| [SESSION.md](./SESSION.md) | **Live working memory** — resume point for current session |
| [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) | Full platform architecture |
| [KNOWLEDGE_INDEX.md](./KNOWLEDGE_INDEX.md) | Module lookup — use before scanning code |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | Today's state |
| [NEXT_TASK.md](./NEXT_TASK.md) | Current sprint task card |`
  ],
]);

patch('NEXT_TASK.md', [
  [
    `**Last Updated:** 2026-06-30
**This file is tomorrow's starting point.**`,
    `**Last Updated:** 2026-06-30
**This file is tomorrow's starting point.**

> **Active session?** Read [SESSION.md](./SESSION.md) first — it contains the live Resume Point.`
  ],
  [
    `## Recommended First Action

1. Read [CURRENT_STATUS.md](./CURRENT_STATUS.md) and latest [logs/daily/](./logs/daily/)`,
    `## Recommended First Action

1. Read [SESSION.md](./SESSION.md) — resume from Resume Point
2. Read [CURRENT_STATUS.md](./CURRENT_STATUS.md) and latest [logs/daily/](./logs/daily/)`
  ],
  [
    `2. Restart backend + storefront with correct env flags
3. Run \`GET /api/aivos/merchant-ad/health\` — confirm runtime enabled
4. Generate one ad clip; confirm job ID prefix is \`mad-*\` (not \`adv-*\`)
5. Publish product; verify home feed fresh section`,
    `3. Restart backend + storefront with correct env flags
4. Run \`GET /api/aivos/merchant-ad/health\` — confirm runtime enabled
5. Generate one ad clip; confirm job ID prefix is \`mad-*\` (not \`adv-*\`)
6. Publish product; verify home feed fresh section`
  ],
]);

patch('CODING_STANDARDS.md', [
  [
    `| AI docs | \`docs/aqond-os/\` only — do not mix with legacy \`docs/\` |`,
    `| AI docs | \`docs/aqond-os/\` only — do not mix with legacy \`docs/\` |
| Session memory | \`docs/aqond-os/SESSION.md\` — single file, overwritten per session |`
  ],
  [
    `5. AQOND-OS documentation append-only — never delete historical entries
6. \`mobile\` is core shell — modify only when explicitly requested`,
    `5. AQOND-OS documentation append-only — never delete historical entries
6. \`mobile\` is core shell — modify only when explicitly requested
7. **SESSION.md** — update continuously during dev; finalize and sync at session end`
  ],
]);

// Append to daily log
const dailyPath = path.join(ROOT, 'logs/daily/2026-06-30.md');
let daily = fs.readFileSync(dailyPath, 'utf8');
if (!daily.includes('SESSION.md')) {
  daily += `

---

## Update — SESSION.md Management System

- Created \`docs/aqond-os/SESSION.md\` — live AI working memory
- Updated README, NEXT_TASK, CODING_STANDARDS with SESSION rules
- Added \`scripts/patch-aqond-os-session.cjs\`
- Decisions: SESSION-001, SESSION-002
`;
  fs.writeFileSync(dailyPath, daily, 'utf8');
  console.log('appended: logs/daily/2026-06-30.md');
}

// Append DECISIONS
const decisionsPath = path.join(ROOT, 'DECISIONS.md');
let decisions = fs.readFileSync(decisionsPath, 'utf8');
if (!decisions.includes('SESSION-001')) {
  decisions += `
---

## SESSION-001 — SESSION.md as live working memory

| Field | Value |
|-------|-------|
| **Date** | 2026-06-30 |
| **Problem** | AI loses context on restart, crash, or new Cursor session |
| **Decision** | Single \`SESSION.md\` continuously updated; overwritten per session; finalized at end |
| **Reason** | Instant resume without repository scan |
| **Impact** | AI reads SESSION before code; syncs to CURRENT_STATUS/NEXT_TASK at session end |
| **Status** | Accepted |

---

## SESSION-002 — Minimal resume reading set

| Field | Value |
|-------|-------|
| **Date** | 2026-06-30 |
| **Problem** | Full doc read on every resume wastes tokens |
| **Decision** | Before code: SESSION.md + CURRENT_STATUS.md + NEXT_TASK.md only |
| **Reason** | Performance — understand current work in 3 files |
| **Impact** | MASTER_BLUEPRINT/KNOWLEDGE_INDEX only when architecture work needed |
| **Status** | Accepted |
`;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('appended: DECISIONS.md');
}

console.log('patch-aqond-os-session: complete');
