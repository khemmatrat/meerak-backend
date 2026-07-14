#!/usr/bin/env node
/**
 * Consolidate architecture into ARCHITECT_RULES.md (The Bible)
 * and update all specs to reference it as sole authority.
 * Run: node scripts/consolidate-bible.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

const BIBLE = `# AQOND Architect Rules

**The Bible — single architectural authority for all AQOND AI agents and engineers.**
Read this file before any task. Specs are implementation references only.

---

## Mission

Transform AQOND into an enterprise AI Operating System where every AI product plugs into the same Runtime without modifying Core.

## Vision

AQOND survives ten years of new models, plugins, and workflows. Resume AI is Plugin #1, not the product. The platform is the product.

## Architecture Layers

| Layer | Name | Owns |
|-------|------|------|
| 0 | AQOND Core | Auth, billing, queues, media, storage |
| 1 | AI Runtime | Orchestration, policy, governance, discovery |
| 2 | AI Kernel | Inference, memory facade, quality scoring |
| 3 | Video Pipeline | Generic media workflow templates |
| 4 | Plugin Platform | Intent, capabilities, domain adapters |
| 5 | Frontend | Shell, studio, admin surfaces |

**Call direction:** Frontend → Plugin → Runtime → Kernel / Pipeline → Core.
Never reverse. Never skip Runtime.

## Golden Rules

1. Architecture before code. No implementation until architecture is approved.
2. Reuse before create. Extend existing modules; never duplicate Core.
3. Plugins never call models, never supply raw prompts, never choose workflow stages.
4. Runtime orchestrates; Kernel infers; Pipeline renders; Core persists.
5. All agents communicate by events only — never direct agent-to-agent calls.
6. Every workflow node is checkpointed, resumable, and retryable individually.
7. Version every artifact: prompt, skill, workflow, model, plugin, brand.
8. Scale without rewrite: 100 plugins, 100 models, 1,000 concurrent jobs, 100,000 users.
9. Preserve backward compatibility unless explicitly approved to break it.
10. Protected forever: payment ledger, registration evolution, wallet semantics.

## Decision Tree

Before any change, answer in order:

1. Does \`ARCHITECT_RULES.md\` allow it?
2. Does an existing module satisfy ≥80%? → Extend it.
3. Which layer owns it? → Implement only in that layer.
4. Does it affect Core? → Stop; redesign at Runtime or Plugin layer.
5. Is architecture approved? → If no, write spec only.
6. Can it ship behind a flag with rollback? → If no, reject.

## Plugin Rules

Plugins declare intent, capabilities, permissions, billing, dependencies, and events.
Plugins never hardcode stages, models, prompts, or creative decisions.
New plugins require no Core or Runtime modification.
Every new plugin must pass the four-question gate: reuse map, new modules, Runtime impact, future scale.

## Runtime Rules

Runtime owns planning, execution graphs, skill graphs, capability discovery, policy, prompt compilation, approval, cost, learning, and observability.
Runtime decides model, budget, latency, quality tier, fallback, and premium access.
Runtime composes workflows from discovered skills — never from plugin hardcoding.
Human approval gates exist on every workflow: draft, preview, approve, reject, reprompt, publish.

## Reuse Rules

Never rewrite Auth, Billing, Wallet, Queues, S3, ffmpeg, ai-core, or Hermes memory.
Never duplicate tables that already exist.
Copy patterns from registration evolution checkpoints — do not import signup code.
Extend Bull queues and ai-core prompts; do not replace them.

## Extension Rules

New capabilities ship as plugins or workflow templates in the marketplace.
External developers use the public SDK only — never Runtime internals.
Workflows and plugins share lifecycle: install, enable, disable, upgrade, rollback, suspend, resume, delete.
Semantic memory, learning, and feedback loops are platform services — not plugin silos.

## Review Rules

Follow: Architecture → Specification → Review → Implement → Test → Optimize → Production.
Never skip Review. Never request approval until specs exist and reviews report ready.
One human approval unlocks one implementation phase.
No new architecture documents unless explicitly requested.

## Testing Rules

Every phase passes all tests before the next phase begins.
No TODO, placeholder, dead code, or duplicate logic in merged work.
Parity tests protect legacy paths until flags remove them.
Security, scale, and governance tests are gates — not afterthoughts.

## Definition of Done

A change is done when: spec updated, tests pass, observability emits trace, governance records version, rollback documented, Bible rules unchanged or Bible explicitly amended by human approval.

## Agent Workflow

1. Load \`ARCHITECT_RULES.md\`.
2. Load only the relevant implementation spec(s).
3. Run the Decision Tree.
4. If blocked, stop and report — do not improvise architecture.
5. If approved phase, implement minimally within assigned layer.
6. Verify Definition of Done.
7. Never create parallel architectural truth.

---

*Implementation details live in \`*_SPEC.md\` files. This document is the only architectural authority.*
`;

const CURSOR_RULES = `# Cursor Agent Instructions

## Mandatory first step

Before any coding, review, refactor, or architecture task:

1. **Read [ARCHITECT_RULES.md](../ARCHITECT_RULES.md)** — the single canonical source of architectural truth (The Bible).
2. Treat all \`*_SPEC.md\` files as **implementation references only**, not competing authority.
3. **Do not begin implementation** until \`ARCHITECT_RULES.md\` rules are satisfied and the current phase is human-approved.

## When in doubt

- Follow the Decision Tree in \`ARCHITECT_RULES.md\`.
- Stop and ask rather than invent architecture.
- Do not create new architecture documents unless the user explicitly requests them.

## Prohibited without Bible compliance

- Calling AI models from plugins
- Skipping Runtime layer
- Rewriting AQOND Core (auth, billing, wallet, payment gateway)
- Duplicating architectural rules in code comments or new docs
`;

const SPEC_FILES = [
  'AI_KERNEL_SPEC.md',
  'AI_POLICY_ENGINE_SPEC.md',
  'AI_RUNTIME_SPEC.md',
  'AI_VIDEO_PLATFORM_ARCHITECTURE.md',
  'CAPABILITY_DISCOVERY_SPEC.md',
  'EVENT_BUS_SPEC.md',
  'EXECUTION_GRAPH_SPEC.md',
  'FEEDBACK_LOOP_SPEC.md',
  'GOVERNANCE_SPEC.md',
  'IMPLEMENTATION_PLAN.md',
  'LEARNING_ENGINE_SPEC.md',
  'OBSERVABILITY_SPEC.md',
  'PLUGIN_SDK.md',
  'PROMPT_COMPILER_SPEC.md',
  'QUALITY_ENGINE_SPEC.md',
  'SDK_SPEC.md',
  'SEMANTIC_MEMORY_SPEC.md',
  'SKILL_GRAPH_SPEC.md',
  'TEST_PLAN.md',
  'VIDEO_PIPELINE_SPEC.md',
  'WORKFLOW_MARKETPLACE_SPEC.md',
  'ARCHITECTURE_READINESS.md',
  'ARCHITECTURE_REVIEW.md',
  'AI_OS_CONSTITUTION.md',
  'AI_OS_ROADMAP.md',
  'AUDIT.md',
  'MODULE_MAP.md',
];

/** Sections to strip (duplicated architectural rules) */
const STRIP_PATTERNS = [
  /\*\*Rule:\*\* Architecture → Spec → Review → Implement[^\n]*\n/g,
  /\*\*Philosophy:\*\* Architecture → Spec[^\n]*\n/g,
  /\*\*Constitution:\*\* v1\.0\n/g,
  /\*\*Constitution layer:\*\*[^\n]*\n/g,
  /\*\*Prerequisites:\*\*[^\n]*\n/g,
  /\*\*Status:\*\* FROZEN[^\n]*\n/g,
  /\*\*Date:\*\*[^\n]*\n/g,
  /\*\*Version:\*\*[^\n]*\n/g,
  /\*\*Authority:\*\* \[ARCHITECT_RULES\.md\][^\n]*\n/g,
  /\*\*Role:\*\*[^\n]*\n/g,
  /> \*\*Architectural authority:\*\*[^\n]*\n\n/g,
  /> All immutable principles live in \[ARCHITECT_RULES\.md\][^\n]*\n\n/g,
  /## 3\. Design Principles \(Constitution v1\.0\)\n\n[\s\S]*?(?=\n---\n)/,
  /## 1\. v3\.0 Principles\n\nPlugins declare \*\*intent[\s\S]*?(?=\n---\n|\n## 2\.)/,
  /## 2\. Constitution Stack[\s\S]*?(?=\n## [34])/,
  /## 1\. Mission\n\n[\s\S]*?(?=\n## [234])/,
];

function stripDuplicatedRules(body) {
  let out = body;
  for (const pat of STRIP_PATTERNS) {
    out = out.replace(pat, '');
  }
  out = out.replace(/\n---\n\n---\n/g, '\n---\n');
  return out;
}

function addAuthorityHeader(body) {
  const lines = body.split('\n');
  const title = lines[0] || '# Document';
  let restStart = 1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      restStart = i + 1;
      break;
    }
  }
  const rest = stripDuplicatedRules(lines.slice(restStart).join('\n'));
  return `${title}

**Version:** 3.0
**Authority:** [ARCHITECT_RULES.md](./ARCHITECT_RULES.md)
**Role:** Implementation reference only

---

> Immutable principles: [ARCHITECT_RULES.md](./ARCHITECT_RULES.md)

${rest.trimStart()}`;
}

// Write Bible and Cursor rules
fs.writeFileSync(path.join(ROOT, 'ARCHITECT_RULES.md'), BIBLE, 'utf8');
fs.mkdirSync(path.join(ROOT, '.cursor'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.cursor/rules.md'), CURSOR_RULES, 'utf8');
console.log('Wrote ARCHITECT_RULES.md', fs.statSync(path.join(ROOT, 'ARCHITECT_RULES.md')).size, 'bytes');
console.log('Wrote .cursor/rules.md', fs.statSync(path.join(ROOT, '.cursor/rules.md')).size, 'bytes');

// Supersede Constitution with pointer
fs.writeFileSync(
  path.join(ROOT, 'AI_OS_CONSTITUTION.md'),
  `# AI-OS Constitution (Superseded)

> **Architectural authority:** [ARCHITECT_RULES.md](./ARCHITECT_RULES.md) (The Bible).

This file is retained for history only. All immutable principles now live in \`ARCHITECT_RULES.md\`.

For implementation details, see the relevant \`*_SPEC.md\` document.
`,
  'utf8',
);

// Update each spec
for (const file of SPEC_FILES) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    console.log('Skip (missing)', file);
    continue;
  }
  const raw = fs.readFileSync(p, 'utf8');
  const updated = addAuthorityHeader(raw);
  fs.writeFileSync(p, updated, 'utf8');
  console.log('Updated', file, fs.statSync(p).size, 'bytes');
}

// Remove mermaid stack diagram from architecture reference (layers live in Bible)
const archPath = path.join(ROOT, 'AI_VIDEO_PLATFORM_ARCHITECTURE.md');
let arch = fs.readFileSync(archPath, 'utf8');
arch = arch.replace(/### Mermaid[\s\S]*?```\n\n/g, '');
fs.writeFileSync(archPath, arch, 'utf8');
console.log('Cleaned AI_VIDEO_PLATFORM_ARCHITECTURE.md');

// Update ARCHITECTURE_READINESS to point to Bible
const readyPath = path.join(ROOT, 'ARCHITECTURE_READINESS.md');
let ready = fs.readFileSync(readyPath, 'utf8');
ready = ready.replace(/Constitution v1\.0/g, 'ARCHITECT_RULES.md');
ready = ready.replace(/AI_OS_CONSTITUTION\.md/g, 'ARCHITECT_RULES.md');
fs.writeFileSync(readyPath, ready, 'utf8');

// Update AI_RUNTIME executive summary — remove philosophy duplicate
const rtPath = path.join(ROOT, 'AI_RUNTIME_SPEC.md');
let rt = fs.readFileSync(rtPath, 'utf8');
rt = rt.replace(/\*\*Philosophy:\*\* Architecture[^\n]*\n\n/, '');
rt = rt.replace(/\*\*Scale targets[^\n]*\n\n/, '');
fs.writeFileSync(rtPath, rt, 'utf8');

console.log('Done. Bible is sole architectural authority.');
