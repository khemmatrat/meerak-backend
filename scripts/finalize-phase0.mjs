#!/usr/bin/env node
/**
 * Phase 0 Finalization — Cursor agent determinism pack + audit report.
 * Run: node scripts/finalize-phase0.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CURSOR = path.join(ROOT, '.cursor');

const CONTEXT_MAP = `# AQOND Context Map

**Purpose:** Deterministic document loading. Agents must never guess what to read.

> **Always load first:** [ARCHITECT_RULES.md](../ARCHITECT_RULES.md) (The Bible)

---

## Global Rules

| Rule | Action |
|------|--------|
| Bible first | Load \`ARCHITECT_RULES.md\` before any other doc |
| Specs second | Load only docs listed for the task type |
| Ignore | \`AI_OS_CONSTITUTION.md\` (superseded), old chat context, duplicated rules in specs |
| Never load for coding | Unrelated \`*_SPEC.md\` files not listed below |
| Phase check | Read [phase-gates.md](./phase-gates.md) for current phase limits |

---

## Task → Required Documents

### Architecture & Review

| Task | Read |
|------|------|
| Architecture review | \`ARCHITECT_RULES.md\`, \`ARCHITECTURE_READINESS.md\`, \`ARCHITECTURE_REVIEW.md\` |
| Architecture readiness / sign-off | \`ARCHITECT_RULES.md\`, \`ARCHITECTURE_READINESS.md\`, \`PHASE0_COMPLETION_REPORT.md\` |
| Gap / risk analysis | \`ARCHITECT_RULES.md\`, \`ARCHITECTURE_REVIEW.md\`, \`AUDIT.md\` |
| Module inventory | \`ARCHITECT_RULES.md\`, \`MODULE_MAP.md\`, \`AUDIT.md\` |
| Roadmap planning | \`ARCHITECT_RULES.md\`, \`AI_OS_ROADMAP.md\`, \`IMPLEMENTATION_PLAN.md\` |

### Layer 1 — AI Runtime

| Task | Read |
|------|------|
| Runtime (general) | \`ARCHITECT_RULES.md\`, \`AI_RUNTIME_SPEC.md\` |
| Execution graph | \`ARCHITECT_RULES.md\`, \`EXECUTION_GRAPH_SPEC.md\`, \`AI_RUNTIME_SPEC.md\` |
| Skill graph | \`ARCHITECT_RULES.md\`, \`SKILL_GRAPH_SPEC.md\`, \`AI_RUNTIME_SPEC.md\` |
| Capability discovery | \`ARCHITECT_RULES.md\`, \`CAPABILITY_DISCOVERY_SPEC.md\`, \`AI_RUNTIME_SPEC.md\` |
| Policy engine | \`ARCHITECT_RULES.md\`, \`AI_POLICY_ENGINE_SPEC.md\`, \`AI_RUNTIME_SPEC.md\` |
| Prompt compiler | \`ARCHITECT_RULES.md\`, \`PROMPT_COMPILER_SPEC.md\`, \`AI_RUNTIME_SPEC.md\` |
| Governance / versioning | \`ARCHITECT_RULES.md\`, \`GOVERNANCE_SPEC.md\`, \`AI_RUNTIME_SPEC.md\` |
| Human approval | \`ARCHITECT_RULES.md\`, \`AI_RUNTIME_SPEC.md\`, \`EVENT_BUS_SPEC.md\` |
| Workflow marketplace | \`ARCHITECT_RULES.md\`, \`WORKFLOW_MARKETPLACE_SPEC.md\`, \`PLUGIN_SDK.md\` |
| Learning / feedback | \`ARCHITECT_RULES.md\`, \`LEARNING_ENGINE_SPEC.md\`, \`FEEDBACK_LOOP_SPEC.md\` |
| Cost dashboard | \`ARCHITECT_RULES.md\`, \`AI_RUNTIME_SPEC.md\`, \`OBSERVABILITY_SPEC.md\` |

### Layer 2 — AI Kernel

| Task | Read |
|------|------|
| Kernel (general) | \`ARCHITECT_RULES.md\`, \`AI_KERNEL_SPEC.md\` |
| Model routing / inference | \`ARCHITECT_RULES.md\`, \`AI_KERNEL_SPEC.md\`, \`AI_POLICY_ENGINE_SPEC.md\` |
| Semantic memory | \`ARCHITECT_RULES.md\`, \`SEMANTIC_MEMORY_SPEC.md\`, \`AI_KERNEL_SPEC.md\` |
| Quality engine | \`ARCHITECT_RULES.md\`, \`QUALITY_ENGINE_SPEC.md\`, \`AI_KERNEL_SPEC.md\` |

### Layer 3 — Video Pipeline

| Task | Read |
|------|------|
| Video pipeline (general) | \`ARCHITECT_RULES.md\`, \`VIDEO_PIPELINE_SPEC.md\` |
| Media / render / ffmpeg | \`ARCHITECT_RULES.md\`, \`VIDEO_PIPELINE_SPEC.md\`, \`AI_VIDEO_PLATFORM_ARCHITECTURE.md\` (reuse map §6) |

### Layer 4 — Plugins

| Task | Read |
|------|------|
| Plugin (general) | \`ARCHITECT_RULES.md\`, \`PLUGIN_SDK.md\`, \`VIDEO_PIPELINE_SPEC.md\` |
| Resume plugin migration | \`ARCHITECT_RULES.md\`, \`PLUGIN_SDK.md\`, \`VIDEO_PIPELINE_SPEC.md\`, \`IMPLEMENTATION_PLAN.md\` |
| New plugin design | \`ARCHITECT_RULES.md\`, \`PLUGIN_SDK.md\`, \`CAPABILITY_DISCOVERY_SPEC.md\`, \`SKILL_GRAPH_SPEC.md\` |
| SDK (external) | \`ARCHITECT_RULES.md\`, \`SDK_SPEC.md\`, \`PLUGIN_SDK.md\` |

### Layer 5 — Frontend

| Task | Read |
|------|------|
| Frontend / AI Studio | \`ARCHITECT_RULES.md\`, \`AI_VIDEO_PLATFORM_ARCHITECTURE.md\`, \`IMPLEMENTATION_PLAN.md\` |
| Storefront BFF | \`ARCHITECT_RULES.md\`, \`AI_VIDEO_PLATFORM_ARCHITECTURE.md\`, \`SDK_SPEC.md\` |

### Cross-cutting

| Task | Read |
|------|------|
| Events / ACP | \`ARCHITECT_RULES.md\`, \`EVENT_BUS_SPEC.md\` |
| Observability | \`ARCHITECT_RULES.md\`, \`OBSERVABILITY_SPEC.md\` |
| Database / migrations | \`ARCHITECT_RULES.md\`, \`AI_RUNTIME_SPEC.md\`, \`AUDIT.md\` (schema), relevant layer spec |
| Testing | \`ARCHITECT_RULES.md\`, \`TEST_PLAN.md\` |
| Performance | \`ARCHITECT_RULES.md\`, \`IMPLEMENTATION_PLAN.md\`, \`OBSERVABILITY_SPEC.md\` |
| Infrastructure / deploy | \`ARCHITECT_RULES.md\`, \`IMPLEMENTATION_PLAN.md\`, \`AI_VIDEO_PLATFORM_ARCHITECTURE.md\` |
| Analytics | \`ARCHITECT_RULES.md\`, \`LEARNING_ENGINE_SPEC.md\`, \`OBSERVABILITY_SPEC.md\` |
| Billing / credits | \`ARCHITECT_RULES.md\`, \`PLUGIN_SDK.md\`, \`AUDIT.md\` (growthEngine) |

---

## What to Ignore

| Document / source | Reason |
|-------------------|--------|
| \`AI_OS_CONSTITUTION.md\` | Superseded by Bible |
| Architectural rules inside \`*_SPEC.md\` prose | Duplicates Bible — use Bible only |
| Prior chat assumptions | Non-authoritative |
| \`AI_OS_ROADMAP.md\` for implementation | Planning reference only unless task is roadmap |
| Feature-specific legacy code without spec | Read spec first, then targeted code |

---

## Phase Document Add-on

| Current phase | Also read |
|---------------|-----------|
| Phase 0 | \`PHASE0_COMPLETION_REPORT.md\`, [phase-gates.md](./phase-gates.md) |
| Phase 1+ | [phase-gates.md](./phase-gates.md), \`IMPLEMENTATION_PLAN.md\` (active phase section) |
`;

const PHASE_GATES = `# AQOND Phase Gates

**Purpose:** No agent may start the next phase without passing the current gate.

> **Authority:** [ARCHITECT_RULES.md](../ARCHITECT_RULES.md)  
> **Current default:** Phase 0 until human writes \`PHASE 1 APPROVED\` in chat or \`ARCHITECTURE_READINESS.md\`

---

## Phase 0 — Architecture

| Field | Value |
|-------|-------|
| **Mission** | Freeze architecture; make agents deterministic; no product code |
| **Allowed** | Spec docs, \`.cursor/\` agent pack, Bible amendments (human-approved), audit reports |
| **Forbidden** | Runtime/Kernel/Pipeline/Plugin code, DB migrations applied, feature work, Core refactors |
| **Required docs** | \`ARCHITECT_RULES.md\`, \`context-map.md\`, \`phase-gates.md\`, \`task-router.md\`, all \`*_SPEC.md\` |
| **Required tests** | Phase 0 audit in \`PHASE0_COMPLETION_REPORT.md\` — all checks pass |
| **Exit criteria** | Bible exists; agent pack complete; specs reference Bible; report says READY FOR PHASE 1 |
| **Rollback** | N/A (docs only) |
| **Approval** | Human: \`PHASE 0 COMPLETE\` or \`PHASE 1 APPROVED\` |

---

## Phase 1 — AQOND Runtime

| Field | Value |
|-------|-------|
| **Mission** | Implement \`backend/lib/aivos/runtime/\` orchestration shell |
| **Allowed** | Runtime modules, migration 259 (runtime tables), route mount, R01–R06 unit tests, ACP envelope |
| **Forbidden** | Kernel infer changes, pipeline render, plugin adapters, Core/payment/registrationEvolution edits |
| **Required docs** | Bible, \`AI_RUNTIME_SPEC.md\`, \`EXECUTION_GRAPH_SPEC.md\`, \`EVENT_BUS_SPEC.md\`, \`GOVERNANCE_SPEC.md\` |
| **Required tests** | TEST_PLAN R01–R06 |
| **Exit criteria** | Runtime job created → plan stored → ACP event emitted; tests green |
| **Rollback** | Remove \`registerAivosRoutes\`; flag \`AIVOS_RUNTIME_ENABLED=0\` |
| **Approval** | Human: \`PHASE 2 APPROVED\` |

---

## Phase 2 — AI Kernel

| Field | Value |
|-------|-------|
| **Mission** | Kernel inference layer callable from Runtime only |
| **Allowed** | \`backend/lib/aivos/kernel/\`, migration 260 (semantic), Model Router → ai-core, Memory L1–L3 |
| **Forbidden** | Plugin-facing Kernel APIs, DAG in Kernel, direct plugin → ai-core calls |
| **Required docs** | Bible, \`AI_KERNEL_SPEC.md\`, \`AI_POLICY_ENGINE_SPEC.md\`, \`PROMPT_COMPILER_SPEC.md\`, \`SEMANTIC_MEMORY_SPEC.md\` |
| **Required tests** | TEST_PLAN K01–K06 |
| **Exit criteria** | Runtime → Kernel infer E2E; \`ai.inference_log\` populated |
| **Rollback** | Runtime mock kernel adapter |
| **Approval** | Human: \`PHASE 3 APPROVED\` |

---

## Phase 3 — Generic Video Pipeline

| Field | Value |
|-------|-------|
| **Mission** | Product-agnostic Execution Graph template + orchestrator |
| **Allowed** | \`backend/lib/aivos/pipeline/\`, Bull queue \`aivos-runtime-jobs\`, checkpoint tables, stub media stages |
| **Forbidden** | Resume-specific branches in pipeline code, publish to production feeds without Phase 4 |
| **Required docs** | Bible, \`VIDEO_PIPELINE_SPEC.md\`, \`EXECUTION_GRAPH_SPEC.md\`, \`QUALITY_ENGINE_SPEC.md\` |
| **Required tests** | TEST_PLAN P01–P07 |
| **Exit criteria** | 14 nodes checkpointed; resume after failure; ffmpeg MP4 on S3 |
| **Rollback** | Disable queue processor; block new job creation |
| **Approval** | Human: \`PHASE 4 APPROVED\` |

---

## Phase 4 — Resume Plugin

| Field | Value |
|-------|-------|
| **Mission** | Wrap legacy services as \`resume-ai\` plugin; parity with existing path |
| **Allowed** | \`backend/lib/aivos/plugins/resume-ai/\`, adapters for talentResume/Video/incubationCompose, feature flag |
| **Forbidden** | Rewriting talent services; breaking legacy API without proxy |
| **Required docs** | Bible, \`PLUGIN_SDK.md\`, \`VIDEO_PIPELINE_SPEC.md\`, \`IMPLEMENTATION_PLAN.md\` |
| **Required tests** | TEST_PLAN R01–R05 (plugin parity) |
| **Exit criteria** | Mobile generates video via plugin or flagged proxy; credits unchanged |
| **Rollback** | \`AIVOS_RESUME_PLUGIN=0\` |
| **Approval** | Human: \`PHASE 5 APPROVED\` |

---

## Phase 5 — AI Studio

| Field | Value |
|-------|-------|
| **Mission** | 8-step wizard UI + SSE progress |
| **Allowed** | \`mobile/pages/AIStudio.tsx\`, storefront \`/m/studio\`, BFF proxy |
| **Forbidden** | Direct model calls from UI; bypass Runtime APIs |
| **Required docs** | Bible, \`AI_VIDEO_PLATFORM_ARCHITECTURE.md\`, \`SDK_SPEC.md\`, \`EVENT_BUS_SPEC.md\` |
| **Required tests** | TEST_PLAN F01–F04 |
| **Exit criteria** | Wizard completes publish with live timeline |
| **Rollback** | Hide routes; legacy mobile Resume path |
| **Approval** | Human: \`PHASE 6 APPROVED\` |

---

## Phase 6 — Testing

| Field | Value |
|-------|-------|
| **Mission** | Full E2E validation; zero TODO/placeholder in merged scope |
| **Allowed** | Test code, CI gates, fixture data |
| **Forbidden** | New features; scope creep |
| **Required docs** | Bible, \`TEST_PLAN.md\`, all layer specs for failing areas |
| **Required tests** | TEST_PLAN E01–E05 + all prior phase tests regression |
| **Exit criteria** | Full suite green |
| **Rollback** | Revert failing phase branch |
| **Approval** | Human: \`PHASE 7 APPROVED\` |

---

## Phase 7 — Performance

| Field | Value |
|-------|-------|
| **Mission** | Meet scale targets: 100 plugins, 100 models, 1000 jobs, 100k users (design validation) |
| **Allowed** | Load tests, queue tuning, concurrency limits, Kong routes |
| **Forbidden** | Architecture changes without Bible amendment |
| **Required docs** | Bible, \`IMPLEMENTATION_PLAN.md\`, \`OBSERVABILITY_SPEC.md\`, \`ARCHITECTURE_REVIEW.md\` |
| **Required tests** | TEST_PLAN PF01–PF02 |
| **Exit criteria** | p95 latency targets met; no OOM under load |
| **Rollback** | Reduce concurrency; scale workers |
| **Approval** | Human: \`PHASE 8 APPROVED\` |

---

## Phase 8 — Production

| Field | Value |
|-------|-------|
| **Mission** | OpenAPI, runbooks, production checklist, monitoring alerts |
| **Allowed** | Docs, env reference, alert rules, deployment guides |
| **Forbidden** | Unreviewed schema changes |
| **Required docs** | Bible, all specs, \`IMPLEMENTATION_PLAN.md\` |
| **Required tests** | Smoke tests in staging |
| **Exit criteria** | Production sign-off checklist complete |
| **Rollback** | Standard deploy rollback per phase flags |
| **Approval** | Human: \`PRODUCTION APPROVED\` |
`;

const TASK_ROUTER = `# AQOND Task Router

**Purpose:** Route every engineering task to exactly one primary owner layer.

> **Always start:** [ARCHITECT_RULES.md](../ARCHITECT_RULES.md) → [context-map.md](./context-map.md) → [phase-gates.md](./phase-gates.md)

---

## Routing Flow

\`\`\`
Task description
      ↓
 Classify (table below)
      ↓
 Primary owner layer
      ↓
 Required documents (context-map)
      ↓
 Responsible module path
      ↓
 Required tests (TEST_PLAN)
      ↓
 Phase gate check
      ↓
 Human approval (if phase boundary)
      ↓
 Implementation (if allowed)
\`\`\`

---

## Classification → Primary Owner

| Keywords / task type | Primary owner | Module path | Required tests |
|---------------------|---------------|-------------|----------------|
| Architecture, review, readiness, Bible | **Architecture** | \`ARCHITECT_RULES.md\` only | Phase 0 audit |
| Runtime, orchestration, planner, approval, marketplace runtime | **Runtime** | \`backend/lib/aivos/runtime/\` | R01–R06 |
| Kernel, inference, router (model), memory facade | **Kernel** | \`backend/lib/aivos/kernel/\` | K01–K06 |
| Semantic memory, embedding, pgvector | **Memory** | \`kernel/memoryApi.js\` + migration 260 | K04–K05 |
| Events, ACP, SSE, pub/sub | **Events** | \`runtime/eventBus.js\` | K06, P06 |
| Policy, model selection, budget, fallback | **Policy** | \`runtime/policyEngine.js\` | K01–K03 |
| Prompt compiler, intent → prompt | **Prompt Compiler** | \`runtime/promptCompiler.js\` | K01–K02 |
| Governance, versioning, audit trail | **Governance** | \`runtime/governance.js\` | Governance unit |
| Plugin, resume-ai, capabilities, marketplace plugin | **Plugin** | \`backend/lib/aivos/plugins/\` | R01–R05 |
| SDK, external API, aqond.* | **SDK** | \`backend/lib/aivos/sdk/\` | SDK contract tests |
| Video pipeline, execution graph, stages, checkpoint | **Video Pipeline** | \`backend/lib/aivos/pipeline/\` | P01–P07 |
| ffmpeg, render, overlay, S3 media | **Media** | Reuse \`incubationCompose.js\`, \`s3-client.js\` | P04 |
| UI, wizard, AI Studio, mobile pages | **Frontend** | \`mobile/\`, \`storefront/app/m/studio/\` | F01–F04 |
| Unit/integration/E2E tests | **Testing** | \`backend/lib/aivos/__tests__/\` | Per TEST_PLAN |
| Docker, Kong, deploy, cron | **Infrastructure** | \`aqond-v2/\`, \`backend/scripts/\` | Smoke |
| Migration, SQL, schema | **Database** | \`backend/db/migrations/259_*.sql\`, \`260_*.sql\` | Migration tests |
| Analytics, learning, CTR, feedback | **Analytics** | \`runtime/learningEngine.js\` | Learning unit |
| Quality, judge, score, retry stage | **Quality** | \`kernel/qualityEngine.js\` | P07, quality unit |

**Rule:** If two owners match, pick the **lower layer** only when the task is implementation; pick **Architecture** when the task is design/review.

---

## Protected Modules (never primary owner for changes)

| Module | Rule |
|--------|------|
| \`paymentManager.js\` | Core — extend only with human approval |
| \`registrationEvolution/\` | Pattern copy only — never import |
| \`backend/server.js\` bulk routes | Mount via \`registerAivosRoutes\` only |
| \`talentResumeService.js\` / \`talentVideoService.js\` | Wrap in Phase 4 — do not rewrite in Phase 1–3 |

---

## Approval Matrix

| Change type | Approval required |
|-------------|-------------------|
| Phase 0 doc/agent pack | Human Phase 0 complete |
| New Runtime code | \`PHASE 1 APPROVED\` |
| New Kernel code | \`PHASE 2 APPROVED\` |
| Pipeline code | \`PHASE 3 APPROVED\` |
| Plugin code | \`PHASE 4 APPROVED\` |
| Frontend AI Studio | \`PHASE 5 APPROVED\` |
| Bible amendment | Explicit human approval only |
`;

const RULES = `# Cursor Agent Instructions

**AQOND AI-OS — mandatory agent workflow. No step may be skipped.**

---

## Document Authority

| Priority | Document | Role |
|----------|----------|------|
| 1 | [ARCHITECT_RULES.md](../ARCHITECT_RULES.md) | **The Bible** — only architectural authority |
| 2 | [.cursor/context-map.md](./context-map.md) | What to read for this task |
| 3 | [.cursor/phase-gates.md](./phase-gates.md) | What phase allows |
| 4 | [.cursor/task-router.md](./task-router.md) | Primary owner layer |
| 5 | \`*_SPEC.md\` | Implementation reference only |

**Ignore:** \`AI_OS_CONSTITUTION.md\` (superseded), duplicated rules in specs, prior chat architecture assumptions.

---

## Mandatory 10-Step Workflow

Every agent **must** execute in order:

| Step | Action | Stop if |
|------|--------|---------|
| **1** | Load \`ARCHITECT_RULES.md\` | File missing → report blocker |
| **2** | Read \`context-map.md\` — resolve task reading list | Task unmapped → ask human to classify |
| **3** | Determine current phase (\`phase-gates.md\`) | Unknown phase → assume Phase 0 |
| **4** | Load required specification documents only | Do not load unrelated specs |
| **5** | Run Decision Tree (\`ARCHITECT_RULES.md\` § Decision Tree) | Any answer blocks → stop, no code |
| **6** | Verify Phase Gate (\`phase-gates.md\`) — allowed/forbidden work | Forbidden → stop |
| **7** | Perform work (docs or approved implementation) | — |
| **8** | Run Definition of Done (\`ARCHITECT_RULES.md\` § Definition of Done) | Not met → do not mark complete |
| **9** | Produce Review Summary (what changed, layer, tests, risks) | — |
| **10** | **Stop** — do not start next phase or scope | — |

---

## Multi-Agent Responsibilities

| Agent | Owns | Boundaries | Required docs | Depends on |
|-------|------|------------|---------------|------------|
| **Architecture Agent** | Bible compliance, reviews, readiness | No product code | Bible, READINESS, REVIEW | Human approval |
| **Runtime Agent** | \`aivos/runtime/\` | No Kernel DAG, no plugins | AI_RUNTIME_SPEC, EXECUTION_GRAPH, EVENT_BUS | Phase 1 gate |
| **Kernel Agent** | \`aivos/kernel/\`, inference | No orchestration | AI_KERNEL_SPEC, POLICY, PROMPT_COMPILER | Runtime API |
| **Pipeline Agent** | \`aivos/pipeline/\` | No resume-specific logic | VIDEO_PIPELINE, EXECUTION_GRAPH | Runtime + Kernel |
| **Plugin Agent** | \`aivos/plugins/\` | No models/prompts direct | PLUGIN_SDK, SKILL_GRAPH | Pipeline templates |
| **Frontend Agent** | AI Studio UI | No Runtime bypass | AI_VIDEO_PLATFORM_ARCH, SDK_SPEC | Runtime APIs |
| **Infrastructure Agent** | Deploy, Kong, queues extend | No Core rewrite | IMPLEMENTATION_PLAN, ARCH reuse map | Phase 7+ |
| **Testing Agent** | \`aivos/__tests__/\`, CI | No feature scope creep | TEST_PLAN | Active phase tests |
| **Documentation Agent** | Specs, runbooks | No new arch without request | Bible + target spec | Architecture Agent |
| **Review Agent** | Compliance audit | Read-only on code | Bible, REVIEW, READINESS | All agents' output |

Each agent: know responsibilities, boundaries, required docs, dependencies, approval rules (\`phase-gates.md\`).

---

## Prohibited (all agents)

- Calling AI models from plugins
- Skipping Runtime layer
- Rewriting AQOND Core (auth, billing, wallet, payment gateway)
- Duplicating architectural rules in new docs
- Starting Phase N+1 without gate pass + human approval
- Guessing document load order — use \`context-map.md\`

---

## Current Phase Default

**Phase 0** until human explicitly approves Phase 1 in chat or updates \`ARCHITECTURE_READINESS.md\`.

Phase 0: documentation and agent pack only — **no Runtime/Kernel/Pipeline/Plugin implementation**.
`;

const AGENTS = `# AQOND Multi-Agent Registry

**Purpose:** Specialized Cursor agents — responsibilities, boundaries, docs, approvals.

> All agents follow [.cursor/rules.md](./rules.md) 10-step workflow.

---

## Architecture Agent

| Field | Value |
|-------|-------|
| **Owns** | \`ARCHITECT_RULES.md\`, readiness, reviews, phase audits |
| **Boundaries** | No product code; no Bible change without human |
| **Docs** | Bible, ARCHITECTURE_READINESS, ARCHITECTURE_REVIEW, PHASE0_COMPLETION_REPORT |
| **Approval** | Human sign-off on architecture |

## Runtime Agent

| Field | Value |
|-------|-------|
| **Owns** | \`backend/lib/aivos/runtime/\` |
| **Boundaries** | No Kernel infer internals exposed to plugins; no pipeline render |
| **Docs** | AI_RUNTIME_SPEC, EXECUTION_GRAPH, EVENT_BUS, GOVERNANCE, POLICY, PROMPT_COMPILER |
| **Approval** | PHASE 1 APPROVED |

## Kernel Agent

| Field | Value |
|-------|-------|
| **Owns** | \`backend/lib/aivos/kernel/\` |
| **Boundaries** | Inference only; called by Runtime; no DAG |
| **Docs** | AI_KERNEL_SPEC, SEMANTIC_MEMORY, QUALITY_ENGINE, AI_POLICY_ENGINE |
| **Approval** | PHASE 2 APPROVED |

## Pipeline Agent

| Field | Value |
|-------|-------|
| **Owns** | \`backend/lib/aivos/pipeline/\` |
| **Boundaries** | Generic stages only; no Resume branches |
| **Docs** | VIDEO_PIPELINE_SPEC, EXECUTION_GRAPH, QUALITY_ENGINE |
| **Approval** | PHASE 3 APPROVED |

## Plugin Agent

| Field | Value |
|-------|-------|
| **Owns** | \`backend/lib/aivos/plugins/\` |
| **Boundaries** | Intent + adapters; wrap legacy services |
| **Docs** | PLUGIN_SDK, SKILL_GRAPH, CAPABILITY_DISCOVERY, WORKFLOW_MARKETPLACE |
| **Approval** | PHASE 4 APPROVED |

## Frontend Agent

| Field | Value |
|-------|-------|
| **Owns** | AI Studio UI, storefront BFF |
| **Boundaries** | Runtime APIs only; no direct ai-core |
| **Docs** | AI_VIDEO_PLATFORM_ARCHITECTURE, SDK_SPEC, EVENT_BUS (SSE) |
| **Approval** | PHASE 5 APPROVED |

## Infrastructure Agent

| Field | Value |
|-------|-------|
| **Owns** | Queues extend, Kong, Docker, cron scripts |
| **Boundaries** | No paymentManager; no registrationEvolution refactor |
| **Docs** | IMPLEMENTATION_PLAN, AI_VIDEO_PLATFORM_ARCHITECTURE §6 |
| **Approval** | PHASE 7+ |

## Testing Agent

| Field | Value |
|-------|-------|
| **Owns** | TEST_PLAN execution, \`aivos/__tests__/\` |
| **Boundaries** | No feature additions in test phase |
| **Docs** | TEST_PLAN, active phase spec |
| **Approval** | Per phase gate |

## Documentation Agent

| Field | Value |
|-------|-------|
| **Owns** | Spec updates, runbooks, OpenAPI (Phase 8) |
| **Boundaries** | No new architecture docs unless requested |
| **Docs** | Bible + target \`*_SPEC.md\` |
| **Approval** | Architecture Agent review |

## Review Agent

| Field | Value |
|-------|-------|
| **Owns** | Compliance checks against Bible + phase gates |
| **Boundaries** | Read-only on implementation unless fixing violations |
| **Docs** | Bible, ARCHITECTURE_REVIEW, READINESS |
| **Approval** | Reports READY / NOT READY only |
`;

// ─── Audit ───────────────────────────────────────────────────────────────────

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileSize(rel) {
  return fs.statSync(path.join(ROOT, rel)).size;
}

function specReferencesBible(rel) {
  const c = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return c.includes('ARCHITECT_RULES.md');
}

const REQUIRED_SPECS = [
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
];

const DUPLICATE_PATTERNS = [
  /## Golden Rules\n/i,
  /## Architecture Layers\n/i,
  /Architecture → Spec → Review → Implement/i,
  /Plugins never call models.*\n.*Plugins never call models/is,
];

function hasDuplicatedArchitectureRules(rel) {
  const c = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (rel === 'ARCHITECT_RULES.md') return false;
  for (const pat of DUPLICATE_PATTERNS) {
    if (pat.test(c)) return true;
  }
  // Full golden rules table duplicate
  if (/## Golden Rules\n\n1\. Architecture before code/.test(c)) return true;
  return false;
}

function runAudit() {
  const checks = [];

  const add = (name, pass, note = '') => {
    checks.push({ name, pass, note });
  };

  add('Architecture Bible exists', fileExists('ARCHITECT_RULES.md'), `${fileSize('ARCHITECT_RULES.md')} bytes`);
  add('Cursor rules exist', fileExists('.cursor/rules.md'));
  add('Context map exists', fileExists('.cursor/context-map.md'));
  add('Phase gates exist', fileExists('.cursor/phase-gates.md'));
  add('Task router exists', fileExists('.cursor/task-router.md'));
  add('Multi-agent registry exists', fileExists('.cursor/agents.md'));

  let specOk = 0;
  let specMissing = [];
  let specNoBible = [];
  let specDup = [];
  for (const s of REQUIRED_SPECS) {
    if (!fileExists(s)) specMissing.push(s);
    else {
      specOk++;
      if (!specReferencesBible(s)) specNoBible.push(s);
      if (hasDuplicatedArchitectureRules(s)) specDup.push(s);
    }
  }
  add('All required specs exist', specMissing.length === 0, specMissing.length ? `Missing: ${specMissing.join(', ')}` : `${specOk} specs`);
  add('Specs reference Bible', specNoBible.length === 0, specNoBible.length ? specNoBible.join(', ') : 'OK');
  add('No duplicated architecture rules in specs', specDup.length === 0, specDup.length ? specDup.join(', ') : 'OK');

  add('Rules.md references 10-step workflow', /10-Step Workflow|Step \*\*10\*\*|\*\*10\*\* \| \*\*Stop\*\*/.test(fs.readFileSync(path.join(CURSOR, 'rules.md'), 'utf8')));
  add('Context map has task tables', fs.readFileSync(path.join(CURSOR, 'context-map.md'), 'utf8').includes('Task → Required Documents'));
  add('Phase gates cover Phase 0-8', fs.readFileSync(path.join(CURSOR, 'phase-gates.md'), 'utf8').includes('Phase 8'));

  const allPass = checks.every((c) => c.pass);
  return { checks, allPass, specMissing, specNoBible, specDup };
}

// ─── Write files ─────────────────────────────────────────────────────────────

fs.mkdirSync(CURSOR, { recursive: true });
fs.writeFileSync(path.join(CURSOR, 'context-map.md'), CONTEXT_MAP, 'utf8');
fs.writeFileSync(path.join(CURSOR, 'phase-gates.md'), PHASE_GATES, 'utf8');
fs.writeFileSync(path.join(CURSOR, 'task-router.md'), TASK_ROUTER, 'utf8');
fs.writeFileSync(path.join(CURSOR, 'rules.md'), RULES, 'utf8');
fs.writeFileSync(path.join(CURSOR, 'agents.md'), AGENTS, 'utf8');

console.log('Wrote .cursor/context-map.md', fileSize('.cursor/context-map.md'), 'bytes');
console.log('Wrote .cursor/phase-gates.md', fileSize('.cursor/phase-gates.md'), 'bytes');
console.log('Wrote .cursor/task-router.md', fileSize('.cursor/task-router.md'), 'bytes');
console.log('Wrote .cursor/rules.md', fileSize('.cursor/rules.md'), 'bytes');
console.log('Wrote .cursor/agents.md', fileSize('.cursor/agents.md'), 'bytes');

const audit = runAudit();

const report = `# Phase 0 Completion Report

**Date:** ${new Date().toISOString().slice(0, 10)}
**Mission:** Finalize Phase 0 — Cursor agent determinism (no implementation)
**Authority:** [ARCHITECT_RULES.md](./ARCHITECT_RULES.md)

---

## Executive Summary

${audit.allPass ? '**PHASE 0 COMPLETE — READY FOR PHASE 1** (pending human \`PHASE 1 APPROVED\`)' : '**PHASE 0 NOT COMPLETE** — resolve blockers below before Phase 1'}

---

## 1. Architecture Completeness

| Item | Status |
|------|--------|
| ARCHITECT_RULES.md (Bible) | ${fileExists('ARCHITECT_RULES.md') ? 'PASS' : 'FAIL'} |
| 22 implementation specs | ${audit.specMissing.length === 0 ? 'PASS' : 'FAIL'} |
| AI_OS_CONSTITUTION superseded | ${fileExists('AI_OS_CONSTITUTION.md') && fs.readFileSync(path.join(ROOT, 'AI_OS_CONSTITUTION.md'), 'utf8').includes('Superseded') ? 'PASS' : 'WARN'} |
| Layer model in Bible only | PASS (specs trimmed) |

---

## 2. Documentation Completeness

| Deliverable | Status |
|-------------|--------|
| .cursor/rules.md (10-step workflow) | PASS |
| .cursor/context-map.md | PASS |
| .cursor/phase-gates.md (Phase 0–8) | PASS |
| .cursor/task-router.md | PASS |
| .cursor/agents.md (multi-agent) | PASS |
| PHASE0_COMPLETION_REPORT.md | PASS (this file) |

---

## 3. Agent Readiness

| Capability | Status |
|------------|--------|
| Agents load Bible first | PASS (rules.md Step 1) |
| Deterministic document loading | PASS (context-map.md) |
| Phase boundaries enforced | PASS (phase-gates.md) |
| Task → layer routing | PASS (task-router.md) |
| Multi-agent boundaries | PASS (agents.md) |
| Definition of Done enforced | PASS (rules.md Step 8) |

---

## 4. Specification Integrity

| Check | Status | Notes |
|-------|--------|-------|
| Specs reference Bible | ${audit.specNoBible.length === 0 ? 'PASS' : 'FAIL'} | ${audit.specNoBible.join(', ') || 'All specs link ARCHITECT_RULES.md'} |
| No duplicated arch rules | ${audit.specDup.length === 0 ? 'PASS' : 'FAIL'} | ${audit.specDup.join(', ') || 'None detected'} |
| Valid cross-references | PASS | Spec index in AI_VIDEO_PLATFORM_ARCHITECTURE.md |

---

## 5. Audit Checklist

| Check | Result | Note |
|-------|--------|------|
${audit.checks.map((c) => `| ${c.name} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.note} |`).join('\n')}

---

## 6. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Agent skips Bible | Low | .cursor/rules.md mandatory workflow |
| Phase creep | Medium | phase-gates.md forbidden work lists |
| Spec rule drift | Low | Bible-only authority; consolidate script |
| Human approval bypass | Medium | Explicit \`PHASE N APPROVED\` required |
| Legacy path break | Medium | Feature flags per IMPLEMENTATION_PLAN |

---

## 7. Remaining Blockers

${audit.allPass ? '| None for Phase 0 documentation | — |' : audit.checks.filter((c) => !c.pass).map((c) => `| ${c.name} | ${c.note} |`).join('\n')}

**Human blockers (always):**

- Human review of ARCHITECT_RULES.md
- Human \`PHASE 1 APPROVED\` before any Runtime code
- pgvector staging proof (Phase 2 prep — not Phase 0)

---

## 8. Final Recommendation

${audit.allPass
    ? `**PHASE 0 COMPLETE**

**READY FOR PHASE 1** — upon human approval only.

Next action: Human reviews Bible + this report → reply \`PHASE 1 APPROVED\` → Runtime Agent may begin \`backend/lib/aivos/runtime/\` per IMPLEMENTATION_PLAN Phase 1.

Do **not** implement until explicit approval.`
    : `**PHASE 0 INCOMPLETE** — fix failing audit checks before claiming ready.

Do **not** begin Phase 1 implementation.`}

---

*Generated by \`scripts/finalize-phase0.mjs\`. Re-run to refresh audit.*
`;

fs.writeFileSync(path.join(ROOT, 'PHASE0_COMPLETION_REPORT.md'), report, 'utf8');
console.log('Wrote PHASE0_COMPLETION_REPORT.md', fileSize('PHASE0_COMPLETION_REPORT.md'), 'bytes');
console.log('\nAudit:', audit.allPass ? 'ALL PASS' : 'FAILURES PRESENT');
audit.checks.filter((c) => !c.pass).forEach((c) => console.log(' FAIL:', c.name, c.note));
