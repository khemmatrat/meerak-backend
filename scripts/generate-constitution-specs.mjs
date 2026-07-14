#!/usr/bin/env node
/**
 * AQOND AI-OS Constitution v1.0 — generates 24 specification documents.
 * Run: node scripts/generate-constitution-specs.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATE = '2026-06-27';
const VER = '3.0 (Constitution v1.0)';
const CONSTITUTION = '1.0';

const written = [];

function OUT(name, body) {
  const p = path.join(ROOT, name);
  fs.writeFileSync(p, body.replace(/\r\n/g, '\n'), 'utf8');
  const bytes = fs.statSync(p).size;
  console.log(`Wrote ${name} ${bytes} bytes`);
  written.push({ name, bytes });
  return bytes;
}

const hdr = (title, extra = '') => `# ${title}

**Version:** ${VER}
**Constitution:** v${CONSTITUTION}
**Date:** ${DATE}
**Status:** FROZEN — pending human APPROVED before Phase 1 code
**Rule:** Architecture → Spec → Review → Implement → Test → Optimize → Production
${extra}
---

`;

const REUSE = `| Existing module | Path | Role |
|-----------------|------|------|
| Auth | \`server.js\`, \`verifyFirebaseIdTokenPublic.js\` | JWT/Firebase on all APIs |
| Billing | \`growthEngine.js\`, \`growth_entitlements\` | Credits; marketplace metering |
| Wallet | \`paymentManager.js\` | **Do not redesign** |
| Queues | \`backend/lib/queues.js\` | \`aivos-runtime-jobs\`, \`aivos-video-pipeline\` |
| Checkpoints | \`registrationEvolution/workflowCheckpointRuntime.js\` | **Pattern copy only** — no import |
| ai-core | \`aqond-v2/infra/ai-core/\` | Kernel inference target |
| Hermes | \`hermes_episodic_memory\`, \`hermes_procedural_rules\` | Memory L2–L3 |
| ffmpeg / S3 | \`incubationCompose.js\`, \`s3-client.js\` | Render + artifacts |
| Resume legacy | \`talentResumeService.js\`, \`talentVideoService.js\` | resume-ai adapter |
| Analytics | \`user_intent_events\`, \`ai.inference_log\` | Observability + cost |
| FCM | \`fcmService.js\` | Approval + completion push |`;

const LAYERS = `\`\`\`
┌─────────────────────────────────────────────────────────────┐
│  Layer 5 — Frontend: AI Studio (mobile + storefront BFF)    │
├─────────────────────────────────────────────────────────────┤
│  Layer 4 — Plugin Platform: resume-ai │ portfolio-ai │ …    │
├─────────────────────────────────────────────────────────────┤
│  Layer 3 — Generic Video Pipeline (Execution Graph template)│
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — AI Kernel (inference ONLY — no orchestration)    │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — AI Runtime Platform (orchestration + governance) │
├─────────────────────────────────────────────────────────────┤
│  Layer 0 — AQOND CORE: Auth, Billing, Queue, Media, S3, Kong│
└─────────────────────────────────────────────────────────────┘
\`\`\`

**Call direction:** Frontend → Plugin → **Runtime** → Kernel / Pipeline → AQOND CORE
**Hard rule:** Plugins never call models. Runtime routes via **Policy Engine** → Kernel Model Router.`;

const MIG259 = `| Table | Spec |
|-------|------|
| \`aivos_runtime_jobs\` | AI_RUNTIME_SPEC §1 |
| \`aivos_runtime_plans\` | EXECUTION_GRAPH_SPEC |
| \`aivos_policy_decisions\` | AI_POLICY_ENGINE_SPEC |
| \`aivos_prompt_compilations\` | PROMPT_COMPILER_SPEC |
| \`aivos_governance_audit\` | GOVERNANCE_SPEC |
| \`aivos_plugin_registry\` | PLUGIN_SDK, WORKFLOW_MARKETPLACE_SPEC |
| \`aivos_agent_registry\` | SKILL_GRAPH_SPEC |
| \`aivos_skill_registry\` | SKILL_GRAPH_SPEC |
| \`aivos_prompt_registry\` | PROMPT_COMPILER_SPEC |
| \`aivos_brand_dna\` | PROMPT_COMPILER_SPEC |
| \`aivos_workflow_jobs\` | EXECUTION_GRAPH_SPEC |
| \`aivos_workflow_checkpoints\` | EXECUTION_GRAPH_SPEC |
| \`aivos_quality_scores\` | QUALITY_ENGINE_SPEC |
| \`aivos_events\` | EVENT_BUS_SPEC |
| \`aivos_video_timeline\` | OBSERVABILITY_SPEC |
| \`aivos_context_snapshots\` | SEMANTIC_MEMORY_SPEC L5 |
| \`aivos_approval_requests\` | AI_RUNTIME_SPEC §9 |
| \`aivos_cost_ledger\` | AI_RUNTIME_SPEC §11 |`;

const MIG260 = `| Table | Spec |
|-------|------|
| \`aivos_semantic_memory\` | SEMANTIC_MEMORY_SPEC L7 |
| \`aivos_learning_signals\` | LEARNING_ENGINE_SPEC |
| \`aivos_prompt_evolution\` | FEEDBACK_LOOP_SPEC |
| \`aivos_governance_versions\` | GOVERNANCE_SPEC |
| \`aivos_marketplace_plugins\` | WORKFLOW_MARKETPLACE_SPEC |
| \`aivos_marketplace_workflows\` | WORKFLOW_MARKETPLACE_SPEC |
| \`aivos_marketplace_versions\` | WORKFLOW_MARKETPLACE_SPEC |
| \`aivos_plugin_permissions\` | PLUGIN_SDK |
| \`aivos_observability_spans\` | OBSERVABILITY_SPEC |`;

// ─── NEW SPECS (12) ────────────────────────────────────────────────────────

OUT('AI_POLICY_ENGINE_SPEC.md', hdr('AI Policy Engine Specification', '**Path:** `backend/lib/aivos/runtime/policyEngine.js`\n**See:** AI_RUNTIME_SPEC.md §Policy Engine, AI_KERNEL_SPEC.md §Model Router\n') + `## 1. Purpose

The **Policy Engine** is the sole authority for model selection, budget caps, latency targets, quality tiers, premium routing, and fallback chains. **Plugins never choose models.** Plugins declare intent and capability tokens; Runtime Policy Engine resolves every inference request before Kernel invocation.

| Actor | May choose model? |
|-------|-------------------|
| Plugin | **No** |
| Frontend | **No** |
| Runtime Policy Engine | **Yes** |
| Kernel Model Router | Executes Policy decision (task → endpoint) |

---

## 2. Policy Dimensions

| Dimension | Source | Example rule |
|-----------|--------|--------------|
| **Model** | \`aivos_policy_rules.model\` | \`reasoning\` → hermes3:3b; premium → claude slot |
| **Budget** | User entitlement + job estimate | Block if credits < estimated cost |
| **Latency** | SLA tier (standard / express) | Express → smaller model, skip optional nodes |
| **Quality** | Plugin + brand tier | Enterprise → higher quality_judge threshold |
| **Premium** | \`growth_entitlements.premium_ai\` | Route to cloud config slots |
| **Fallback** | Ordered chain per task type | hermes → qwen → rule-based |

---

## 3. Policy Rules Table (migration 259)

\`aivos_policy_rules\` — admin-configurable; hot-reload via Redis cache.

| Column | Type | Description |
|--------|------|-------------|
| \`id\` | UUID PK | Rule id |
| \`scope\` | TEXT | \`global\` \| \`plugin:{id}\` \| \`user_tier:{tier}\` |
| \`task_type\` | TEXT | Kernel task: reasoning, writing, vision, embedding, quality_judge |
| \`priority\` | INT | Higher wins on conflict |
| \`conditions\` | JSONB | e.g. \`{ "input_tokens_lt": 4096, "premium": true }\` |
| \`decision\` | JSONB | \`{ "model": "...", "max_tokens": 2048, "fallback": [...] }\` |
| \`enabled\` | BOOL | Soft disable |
| \`version\` | INT | Governance version pin |

**Decision audit:** Every resolve() writes \`aivos_policy_decisions\` (job_id, rule_id, decision JSON, trace_id).

---

## 4. Resolution Algorithm

\`\`\`
1. Load plugin policy profile from aivos_plugin_registry.policy_profile
2. Merge user tier from growth_entitlements
3. Match rules: scope → task_type → conditions (priority DESC)
4. Apply budget gate via costOptimizer estimate
5. Apply latency gate (trim optional infer calls)
6. Emit policy.resolved ACP event
7. Return PolicyDecision { modelSlot, taskType, maxCost, fallbacks }
\`\`\`

Kernel \`modelRouter.infer(taskType, policyDecision)\` — Router never overrides Policy.

---

## 5. API (Runtime internal + admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | \`/api/aivos/runtime/policy/resolve\` | Internal — resolve for job node |
| GET | \`/api/aivos/admin/policy/rules\` | List rules (nexus-admin) |
| PUT | \`/api/aivos/admin/policy/rules/:id\` | Upsert rule (versioned via GOVERNANCE_SPEC) |
| GET | \`/api/aivos/runtime/jobs/:id/policy\` | Decision trail for job |

**SDK:** External plugins use \`aqond.runtime()\` only — no policy API surface.

---

## 6. Integration Points

| Consumer | Usage |
|----------|-------|
| Task Runtime | Resolve on job submit |
| Execution Graph | Resolve per DAG node infer |
| Prompt Compiler | Resolve for compile-time LLM calls |
| Cost Engine | Pre-flight budget check |
| Observability | policy.decisions metric + span attribute |

---

## 7. Default Task Map (seed data — Policy owns, Kernel executes)

| task_type | Default model slot | Fallback |
|-----------|-------------------|----------|
| reasoning | hermes3:3b | rule-based |
| writing | qwen2.5:7b-instruct | rule-based prose |
| vision | moondream | skip |
| structured_json | qwen2.5:7b-instruct | schema reject |
| quality_judge | hermes3:3b | heuristic rubric |
| embedding | nomic-embed-text | keyword hash |

---

## 8. Non-Goals

- Plugins passing \`model:\` in request body — **rejected at validation**
- Kernel selecting models independently — **forbidden**
- Redesign of \`paymentManager.js\` or wallet — billing uses existing growthEngine hooks

---

## 9. Phase Exit

- [ ] Policy resolve unit tests (P01–P04 TEST_PLAN)
- [ ] Audit row per infer call
- [ ] Admin CRUD with governance versioning

*See: GOVERNANCE_SPEC.md, AI_KERNEL_SPEC.md, SDK_SPEC.md*
`);

OUT('PROMPT_COMPILER_SPEC.md', hdr('Prompt Compiler Specification', '**Path:** `backend/lib/aivos/runtime/promptCompiler.js`\n**See:** AI_RUNTIME_SPEC.md §Prompt Compiler, GOVERNANCE_SPEC.md\n') + `## 1. Purpose

Plugins describe **intent** (structured JSON). The **Prompt Compiler** assembles final prompts from the **Prompt Registry**, **Brand DNA**, job context, and semantic memory — **never from raw plugin strings**. This prevents prompt injection, enforces brand consistency, and enables governed versioning.

| Input source | Allowed? |
|--------------|----------|
| Plugin intent JSON | **Yes** |
| Plugin raw prompt text | **No — rejected** |
| Prompt Registry template | **Yes** |
| Brand DNA constraints | **Yes** |
| Semantic memory retrieval | **Yes** |

---

## 2. Compile Pipeline

\`\`\`
intent + skillId + promptId@version
  → load template from aivos_prompt_registry
  → merge brand DNA (aivos_brand_dna)
  → inject context snapshot (aivos_context_snapshots)
  → optional semantic RAG (SEMANTIC_MEMORY_SPEC)
  → Policy Engine resolve (compile-time infer if needed)
  → output CompiledPrompt { messages[], metadata, hash }
\`\`\`

**Persistence:** \`aivos_prompt_compilations\` stores hash, inputs, output (immutable).

---

## 3. Prompt Registry Schema

| Column | Type | Notes |
|--------|------|-------|
| \`id\` | TEXT PK | e.g. \`talent-resume-draft\` |
| \`version\` | INT | Monotonic; governance pinned |
| \`template\` | JSONB | Handlebars-safe slots only |
| \`required_slots\` | TEXT[] | Must exist in intent |
| \`task_type\` | TEXT | For Policy Engine routing |
| \`skill_affinity\` | TEXT[] | SKILL_GRAPH_SPEC bindings |

Wraps existing \`ai-core/lib/prompts/\` — no duplicate prompt files in plugins.

---

## 4. Brand DNA Injection

| Brand field | Compiler behavior |
|-------------|-------------------|
| \`tone\` | Appended to system message |
| \`forbidden_phrases\` | Post-compile filter; fail if violated |
| \`visual_palette\` | Passed to creative stage slots only |
| \`locale\` | Template variant selection |

Brand Director (Creative Runtime) may override **style manifest** but not registry template IDs.

---

## 5. Versioning & Reproducibility

Every compilation records:

\`\`\`json
{
  "prompt_id": "talent-resume-draft",
  "prompt_version": 3,
  "brand_dna_version": 12,
  "context_snapshot_id": "uuid",
  "compiler_version": "1.0.0",
  "content_hash": "sha256:..."
}
\`\`\`

Re-run job with pinned versions via GOVERNANCE_SPEC \`reproduce(job_id)\`.

---

## 6. API

| Function | Caller | Description |
|----------|--------|-------------|
| \`promptCompiler.compile({ skillId, intent, jobId })\` | Runtime executor | Primary |
| \`promptCompiler.validateIntent(intent, skillId)\` | Plugin route pre-check | Schema only |
| GET \`/api/aivos/runtime/jobs/:id/prompts\` | Admin / debug | Compilation audit |

Learning Engine may propose \`prompt_evolution\` — human approve before registry bump.

---

## 7. Skill Binding Example (resume-ai)

| Skill | prompt_id | Slots from intent |
|-------|-----------|-------------------|
| resume-extract-profile | talent-resume-draft@v2 | profile_text, locale |
| resume-story-beats | story-planner@v1 | analysis_json, duration_target |
| resume-voice-script | voice-script@v1 | scenes[], tone (from brand) |

Plugin \`buildInput()\` supplies intent — **not** prompt strings.

---

## 8. Security

- Sanitize all intent strings (max length, no system role injection)
- Templates stored admin-side only
- Compiled output logged with PII redaction in OBSERVABILITY_SPEC

---

## 9. Phase Exit

- [ ] Compile hash reproducibility test
- [ ] Reject raw prompt in plugin payload (integration test)
- [ ] Learning → registry version flow documented in FEEDBACK_LOOP_SPEC

*See: GOVERNANCE_SPEC.md, LEARNING_ENGINE_SPEC.md, SKILL_GRAPH_SPEC.md*
`);

OUT('GOVERNANCE_SPEC.md', hdr('Governance Specification', '**Path:** `backend/lib/aivos/runtime/governance.js`\n**See:** AI_RUNTIME_SPEC.md §Governance, ARCHITECTURE_READINESS.md\n') + `## 1. Purpose

**Governance** ensures every artifact in AI-OS is versioned, auditable, and reproducible. Nothing runs "latest" in production without an explicit pin. Supports compliance, rollback, and forensic replay.

**Version everything:**

| Artifact | Store | Pin field |
|----------|-------|-----------|
| Prompt | \`aivos_prompt_registry\` | \`prompt_id@version\` |
| Skill | \`aivos_skill_registry\` | \`skill_id@version\` |
| Workflow | \`aivos_marketplace_workflows\` | \`workflow_id@version\` |
| Model slot | \`aivos_policy_rules\` | rule version |
| Runtime build | deploy manifest | \`AIVOS_RUNTIME_VERSION\` |
| Pipeline template | \`pipeline/templates/*\` | template semver |
| Plugin | \`aivos_marketplace_versions\` | semver |
| Brand DNA | \`aivos_brand_dna\` | \`version\` column |

---

## 2. Audit Trail

\`aivos_governance_audit\` (259) — append-only.

| Column | Type |
|--------|------|
| \`id\` | UUID PK |
| \`entity_type\` | TEXT |
| \`entity_id\` | TEXT |
| \`from_version\` | INT NULL |
| \`to_version\` | INT |
| \`actor_id\` | UUID |
| \`action\` | TEXT (create, approve, rollback, pin) |
| \`payload\` | JSONB |
| \`trace_id\` | UUID |
| \`created_at\` | TIMESTAMPTZ |

\`aivos_governance_versions\` (260) — snapshot blobs for rollback.

---

## 3. Reproducibility Contract

\`governance.reproduce(runtimeJobId)\`:

1. Load frozen plan from \`aivos_runtime_plans\` (skill + execution graph JSON)
2. Pin all prompt compilations from \`aivos_prompt_compilations\`
3. Pin policy decisions from \`aivos_policy_decisions\`
4. Pin marketplace plugin/workflow versions active at job start
5. Re-execute with \`dry_run\` or full replay mode

**Output:** diff report vs original artifacts (hash compare).

---

## 4. Approval Workflow for Changes

| Change type | Approver | Auto-deploy? |
|-------------|----------|--------------|
| Prompt patch | Admin + optional brand owner | No |
| Policy rule | Platform admin | No |
| Plugin upgrade | Marketplace admin | After canary |
| Workflow template | Architecture review | No |
| Brand DNA | Brand owner | Yes for own tenant |

Events: \`aivos.governance.versioned\`, \`aivos.governance.rollback\`.

---

## 5. Integration Matrix

| Module | Governance hook |
|--------|-----------------|
| Prompt Compiler | Records compilation hash |
| Policy Engine | Records rule version per decision |
| Marketplace | Install pins version row |
| Learning Engine | Proposals → pending until approved |
| SDK | \`aqond.runtime().getJobAudit(jobId)\` read-only |

---

## 6. Retention

| Data | Retention |
|------|-----------|
| Audit log | 7 years (compliance configurable) |
| Compilation rows | Life of job + 90 days |
| Version snapshots | Last 10 per entity |

Reuse existing cron purge pattern from \`aivos_events\` partitioning.

---

## 7. Phase Exit

- [ ] Every infer call links trace_id → governance audit
- [ ] Reproduce API stub returns hash diff
- [ ] TEST_PLAN G01–G05 green

*See: PROMPT_COMPILER_SPEC.md, WORKFLOW_MARKETPLACE_SPEC.md, OBSERVABILITY_SPEC.md*
`);

OUT('SDK_SPEC.md', hdr('AQOND AI-OS Runtime SDK Specification', '**Path:** `backend/lib/aivos/sdk/`\n**See:** AI_RUNTIME_SPEC.md §Runtime SDK, PLUGIN_SDK.md\n') + `## 1. Purpose

The **Runtime SDK** is the **only external API** for plugins, storefront BFF, and mobile clients. No direct access to Kernel, Policy Engine internals, or pipeline executors.

\`\`\`javascript
import aqond from '@aqond/aivos-sdk';

const rt = aqond.runtime({ apiKey, baseUrl });
const wf = aqond.workflow();
const vid = aqond.video();
const mem = aqond.memory();
const plg = aqond.plugin();
const agt = aqond.agent();
const ev = aqond.events();
\`\`\`

---

## 2. Module Surface

### aqond.runtime()

| Method | Description |
|--------|-------------|
| \`submitJob(pluginId, intent, options)\` | Create runtime job |
| \`getJob(jobId)\` | Status + approval state |
| \`approve(jobId)\` / \`reject(jobId)\` / \`reprompt(jobId, intent)\` | Human gates |
| \`getJobTimeline(jobId)\` | Stage progress |
| \`getJobAudit(jobId)\` | Governance read-only trail |
| \`cancel(jobId)\` | Cancel queued job |

### aqond.workflow()

| Method | Description |
|--------|-------------|
| \`listInstalled()\` | Marketplace workflows |
| \`install(workflowId, version)\` | Install workflow package |
| \`enable(workflowId)\` / \`disable(workflowId)\` | Lifecycle |
| \`upgrade(workflowId, version)\` | Semver upgrade |
| \`rollback(workflowId)\` | Previous version pin |

### aqond.video()

| Method | Description |
|--------|-------------|
| \`createJob(input)\` | Alias → runtime.submitJob for video plugins |
| \`retry(jobId, { nodes })\` | Partial DAG retry |
| \`publish(jobId)\` | Post-approval publish |

### aqond.memory()

| Method | Description |
|--------|-------------|
| \`search(query, { namespace, limit })\` | Semantic search (L7) |
| \`getBrandDna(ownerId)\` | Brand DNA read |
| \`listEpisodes(userId, filter)\` | Hermes L2 read |

### aqond.plugin()

| Method | Description |
|--------|-------------|
| \`list()\` | Installed plugins |
| \`getCapabilities(pluginId)\` | Capability tokens |
| \`getPermissions(pluginId)\` | OAuth-style scopes |

### aqond.agent()

| Method | Description |
|--------|-------------|
| \`listSkills(filter)\` | Published skills (no internal registry) |
| \`describeSkill(skillId)\` | Public schema in/out |

### aqond.events()

| Method | Description |
|--------|-------------|
| \`subscribe(jobId, handler)\` | SSE wrapper |
| \`on(eventName, handler)\` | Typed ACP event stream |

---

## 3. Forbidden Access

| Internal path | SDK access |
|---------------|------------|
| \`backend/lib/aivos/kernel/*\` | **Blocked** |
| \`policyEngine.resolve\` direct | **Blocked** |
| \`promptCompiler.compile\` direct | **Blocked** |
| \`modelRouter.infer\` | **Blocked** |
| Raw PG tables | **Blocked** |

HTTP: all calls via \`/api/aivos/*\` with Firebase JWT or service token.

---

## 4. Extension API (Plugin authors)

Plugins register via \`PLUGIN_SDK.md\` — SDK is for **consumers**, not plugin host internals.

| Hook | Host provides |
|------|---------------|
| \`registerRoutes(app, deps)\` | \`deps.runtime\` SDK-backed client |
| \`buildInput(raw, ctx)\` | Returns intent JSON only |

---

## 5. Error Model

\`\`\`typescript
interface AivosError {
  code: 'CAPABILITY_GAP' | 'POLICY_DENIED' | 'BUDGET_EXCEEDED' | 'GOVERNANCE_PIN' | 'APPROVAL_REQUIRED';
  message: string;
  traceId: string;
  retryable: boolean;
}
\`\`\`

---

## 6. Versioning

SDK semver tracks Constitution version. \`aqond.version\` returns \`{ sdk, constitution, runtimeApi }\`.

---

## 7. Phase Exit

- [ ] OpenAPI spec generated from SDK surface (Phase 8)
- [ ] No kernel imports in plugin integration tests
- [ ] TEST_PLAN SDK01–SDK05

*See: PLUGIN_SDK.md, WORKFLOW_MARKETPLACE_SPEC.md, AI_RUNTIME_SPEC.md*
`);

OUT('WORKFLOW_MARKETPLACE_SPEC.md', hdr('Workflow Marketplace Specification', '**Path:** `backend/lib/aivos/runtime/marketplace.js`\n**See:** AI_RUNTIME_SPEC.md §Workflow Marketplace, PLUGIN_SDK.md\n') + `## 1. Purpose

The **Workflow Marketplace** distributes installable **workflows** and **plugins** as versioned packages. Runtime loads enabled packages into Capability Discovery and Skill Graph. Billing uses existing \`growthEngine\` — **no paymentManager redesign**.

---

## 2. Package Types

| Type | Contains | Example |
|------|----------|---------|
| **Plugin** | capabilities, routes, billing profile | resume-ai |
| **Workflow** | execution graph template + skill deps | video-pipeline-v1 |
| **Skill pack** | skill registry rows + prompts | resume-skills-bundle |

---

## 3. Lifecycle States

\`\`\`
Install → Enable → Run → Disable → Suspend → Resume → Upgrade → Rollback → Delete
\`\`\`

| Operation | Runtime action | DB |
|-----------|----------------|-----|
| **Install** | Verify deps; insert version row | \`aivos_marketplace_versions\` |
| **Enable** | Register skills; refresh discovery cache | \`enabled=true\` |
| **Disable** | Stop new jobs; in-flight completes | \`enabled=false\` |
| **Upgrade** | Atomic swap; migration hook | new version pin |
| **Rollback** | Pin previous version | governance audit |
| **Suspend** | Admin kill switch | \`suspended=true\` |
| **Resume** | Re-enable after suspend | clear suspended |
| **Delete** | Archive; optional data retention | soft delete |

---

## 4. Tables (migration 260)

| Table | Purpose |
|-------|---------|
| \`aivos_marketplace_plugins\` | Plugin catalog metadata |
| \`aivos_marketplace_workflows\` | Workflow templates + DAG JSON |
| \`aivos_marketplace_versions\` | Semver rows per package |
| \`aivos_plugin_permissions\` | Scoped permissions |

---

## 5. Dependency Resolution

\`\`\`
install(workflowId) → check required plugins enabled
                   → check required skills in registry
                   → check growth_entitlements tier
                   → governance pin version
\`\`\`

Failure emits \`aivos.marketplace.install.failed\` with \`capability_gap\` detail.

---

## 6. API

| Method | Path |
|--------|------|
| GET | \`/api/aivos/marketplace/plugins\` |
| GET | \`/api/aivos/marketplace/workflows\` |
| POST | \`/api/aivos/marketplace/install\` |
| POST | \`/api/aivos/marketplace/enable\` |
| POST | \`/api/aivos/marketplace/upgrade\` |
| POST | \`/api/aivos/marketplace/rollback\` |
| DELETE | \`/api/aivos/marketplace/:type/:id\` |

SDK: \`aqond.workflow()\` mirrors above.

---

## 7. Billing Integration

| Hook | Module |
|------|--------|
| Credit check | \`growthEngine.getGrowthStatus\` |
| Per-plugin multiplier | \`aivos_marketplace_plugins.credit_multiplier\` |
| Ledger | \`aivos_cost_ledger\` |

---

## 8. Phase Exit

- [ ] Install/enable resume-ai + video-pipeline-v1
- [ ] Rollback integration test
- [ ] Governance audit on every lifecycle transition

*See: GOVERNANCE_SPEC.md, CAPABILITY_DISCOVERY_SPEC.md, SDK_SPEC.md*
`);

OUT('OBSERVABILITY_SPEC.md', hdr('Observability Specification', '**Path:** `backend/lib/aivos/runtime/observability.js`\n**See:** AI_RUNTIME_SPEC.md §Observability, EVENT_BUS_SPEC.md\n') + `## 1. Purpose

Unified **trace, timeline, metrics, logs, events, cost, memory, model usage, and workflow history** for every runtime job. OpenTelemetry-aligned; reuses \`ai.inference_log\`, \`aivos_events\`, \`aivos_video_timeline\`.

---

## 2. Signal Types

| Signal | Storage | Correlation |
|--------|---------|-------------|
| **Trace** | OTel + \`aivos_observability_spans\` | \`trace_id\` |
| **Timeline** | \`aivos_video_timeline\` | \`runtime_job_id\` |
| **Metrics** | Prometheus (Phase 7) | job, plugin, stage labels |
| **Logs** | Winston JSON | \`runtime_job_id\`, \`trace_id\` |
| **Events** | \`aivos_events\` + SSE | ACP envelope |
| **Cost** | \`aivos_cost_ledger\` + inference_log | per infer |
| **Memory** | semantic + episodic ops log | layer, namespace |
| **Model usage** | \`ai.inference_log\` | task_type, model slot |
| **Workflow history** | \`aivos_workflow_checkpoints\` | node_id, checksum |

---

## 3. OpenTelemetry Mapping

| Span name | Parent | Attributes |
|-----------|--------|------------|
| \`aivos.runtime.job\` | — | plugin_id, user_id |
| \`aivos.execution.node\` | job | node_id, stage |
| \`aivos.kernel.infer\` | node | task_type, model_slot, tokens |
| \`aivos.policy.resolve\` | node | rule_id, decision_hash |
| \`aivos.prompt.compile\` | node | prompt_id@version |
| \`aivos.approval.gate\` | job | state |

Export: OTLP HTTP (optional); minimum: structured log + PG spans table.

---

## 4. Tables

### aivos_observability_spans (260)

| Column | Type |
|--------|------|
| \`trace_id\` | UUID |
| \`span_id\` | UUID |
| \`parent_span_id\` | UUID NULL |
| \`name\` | TEXT |
| \`start_time\` | TIMESTAMPTZ |
| \`end_time\` | TIMESTAMPTZ |
| \`attributes\` | JSONB |
| \`runtime_job_id\` | UUID |

Index: \`(trace_id)\`, \`(runtime_job_id, start_time)\`.

---

## 5. Dashboard Views

| View | Audience | Data |
|------|----------|------|
| Job drill-down | Support | timeline + checkpoints + approval |
| AI call drill-down | Engineering | infer spans + policy decisions |
| Cost dashboard | Admin | ledger + inference_log aggregates |
| Plugin health | Product | error rate, p95 latency by plugin |

---

## 6. API

| Method | Path |
|--------|------|
| GET | \`/api/aivos/runtime/jobs/:id/trace\` |
| GET | \`/api/aivos/runtime/jobs/:id/timeline\` |
| GET | \`/api/aivos/runtime/jobs/:id/cost\` |
| GET | \`/api/aivos/events?job_id=\` | SSE |

---

## 7. Retention & Sampling

| Signal | Policy |
|--------|--------|
| Spans | 90 days; sample 100% errors, 10% success at scale |
| Events | Partition monthly (reuse cron) |
| inference_log | Existing retention |

---

## 8. Phase Exit

- [ ] trace_id on every ACP event
- [ ] Job trace API returns nested spans
- [ ] TEST_PLAN O01–O05

*See: AI_POLICY_ENGINE_SPEC.md, GOVERNANCE_SPEC.md, EVENT_BUS_SPEC.md*
`);

OUT('SEMANTIC_MEMORY_SPEC.md', hdr('Semantic Memory Specification', '**Path:** `backend/lib/aivos/kernel/memoryApi.js` (L7); Runtime orchestrates\n**See:** AI_RUNTIME_SPEC.md §Semantic Memory, AI_KERNEL_SPEC.md\n') + `## 1. Purpose

Seven-layer memory architecture with **Semantic layer (L7)** using pgvector embeddings. Enables search across stories, hooks, resumes, prompts, and video artifacts. **Reuses Hermes tables** for L2–L3.

---

## 2. Seven Layers

| Layer | Name | Storage | Embeddings |
|-------|------|---------|------------|
| L1 | Working | Redis \`aivos:wm:{jobId}\` | — |
| L2 | Episode | \`commerce.hermes_episodic_memory\` | optional |
| L3 | Procedural | \`commerce.hermes_procedural_rules\` | — |
| L4 | Brand | \`aivos_brand_dna\` | brand vector (260) |
| L5 | Plugin | \`aivos_context_snapshots\` | — |
| L6 | Artifact | S3 + \`aivos_video_timeline\` | clip vector (260) |
| L7 | **Semantic** | \`aivos_semantic_memory\` | pgvector 768-dim |

---

## 3. Semantic Table (migration 260)

| Column | Type |
|--------|------|
| \`id\` | UUID PK |
| \`owner_id\` | UUID |
| \`namespace\` | TEXT (plugin_id or global) |
| \`content_type\` | TEXT (story, hook, resume, prompt, video) |
| \`key\` | TEXT |
| \`content\` | JSONB |
| \`embedding\` | vector(768) |
| \`source_job_id\` | UUID NULL |
| \`created_at\` | TIMESTAMPTZ |

Index: IVFFlat on \`embedding\`; btree on \`(owner_id, namespace, content_type)\`.

---

## 4. Search API (Kernel — Runtime invoked)

\`\`\`javascript
memory.semantic.search(ownerId, queryText, { limit, namespace, contentTypes })
memory.semantic.upsert(ownerId, { key, content, contentType, namespace, jobId })
memory.get(jobId, layer, key)
memory.set(jobId, layer, key, value, { ttlSec })
memory.appendEpisode(userId, { type, payload })  // Hermes L2
\`\`\`

Embedding via Policy Engine task \`embedding\` → nomic-embed-text.

---

## 5. Use Cases

| Query | Namespace | content_type |
|-------|-----------|--------------|
| Similar resume hooks | resume-ai | hook |
| Past story beats | resume-ai | story |
| Brand-aligned prompts | global | prompt |
| Related video clips | owner | video |

Prompt Compiler may RAG from L7 during compile (see PROMPT_COMPILER_SPEC).

---

## 6. Reuse Hermes

| Hermes table | AI-OS layer | Notes |
|--------------|-------------|-------|
| \`hermes_episodic_memory\` | L2 | Append on analyze/publish |
| \`hermes_procedural_rules\` | L3 | Commerce rules unchanged |
| Redis working | L1 | Job-scoped TTL 24h |

No schema change to Hermes core tables — extend via AI-OS tables only.

---

## 7. Phase Exit

- [ ] pgvector extension verified on staging
- [ ] Semantic search p95 < 200ms at 100k rows
- [ ] TEST_PLAN M01–M05

*See: LEARNING_ENGINE_SPEC.md, PROMPT_COMPILER_SPEC.md, OBSERVABILITY_SPEC.md*
`);

OUT('LEARNING_ENGINE_SPEC.md', hdr('Learning Engine Specification', '**Path:** `backend/lib/aivos/runtime/learningEngine.js`\n**See:** AI_RUNTIME_SPEC.md §Learning Engine, FEEDBACK_LOOP_SPEC.md\n') + `## 1. Purpose

Ingests engagement and quality signals to improve **Prompt Registry**, **Brand DNA**, and **Creative Runtime** parameters. Batch-oriented — never blocks pipeline hot path.

---

## 2. Input Signals

| Signal | Source | Weight | Action |
|--------|--------|--------|--------|
| CTR | feed analytics | 0.20 | Hook prompt variants |
| Watch time | video player | 0.25 | Scene pacing / duration |
| Completion rate | player | 0.20 | Story beat count |
| Likes / shares | social graph | 0.15 | Tone adjustments |
| Quality feedback | Quality Engine + human reject | 0.20 | Creative + brand rules |

Tables: \`aivos_learning_signals\` (260), fed from \`user_intent_events\` + \`aivos_quality_scores\`.

---

## 3. Output Targets

| Target | Mechanism | Approval |
|--------|-----------|----------|
| Prompt Registry | \`aivos_prompt_evolution\` proposals | Admin approve → GOVERNANCE |
| Brand DNA | suggested deltas on \`aivos_brand_dna\` | Brand owner approve |
| Creative Runtime | weight knobs in \`creativeRuntime.config\` | Platform admin |
| Semantic Memory | upsert successful patterns L7 | Auto for owner namespace |

---

## 4. Processing Pipeline

\`\`\`
nightly Bull job: aivos-learning-batch
  → aggregate signals per plugin + owner cohort
  → compute weighted score deltas
  → generate evolution proposals (LLM via Policy Engine)
  → queue for human review OR auto-apply (config)
  → emit aivos.learning.updated
\`\`\`

**Rule:** Only **published** jobs enter learning pool — drafts excluded.

---

## 5. Integration

| Module | Direction |
|--------|-----------|
| Quality Engine | Input dimension breakdown |
| Feedback Loop | Closed cycle step 5 |
| Prompt Compiler | Consumes approved registry versions |
| Observability | learning.run metrics |

---

## 6. Anti-Drift Safeguards

- Max 1 prompt version bump per skill per week (configurable)
- Rollback via GOVERNANCE_SPEC
- A/B flag \`AIVOS_LEARNING_AUTO_APPLY=0\` default off

---

## 7. Phase Exit

- [ ] Signal ingest from mock analytics
- [ ] Proposal → approve → compile uses new version
- [ ] TEST_PLAN L01–L05

*See: FEEDBACK_LOOP_SPEC.md, QUALITY_ENGINE_SPEC.md, GOVERNANCE_SPEC.md*
`);

OUT('FEEDBACK_LOOP_SPEC.md', hdr('Feedback Loop Specification', '**Path:** cross-cutting — `backend/lib/aivos/runtime/`\n**See:** AI_RUNTIME_SPEC.md §Feedback Loop, LEARNING_ENGINE_SPEC.md\n') + `## 1. Closed Loop

\`\`\`
Generate → Judge → Publish → Analytics → Learning → Prompt Update → Next Generation
\`\`\`

| Step | Component | Event | Spec |
|------|-----------|-------|------|
| 1 Generate | Execution Graph | \`aivos.pipeline.completed\` | EXECUTION_GRAPH_SPEC |
| 2 Judge | Quality Engine | \`aivos.quality.scored\` | QUALITY_ENGINE_SPEC |
| 3 Publish | publishing-agent + Approval | \`aivos.publish.completed\` | AI_RUNTIME_SPEC §9 |
| 4 Analytics | analytics-agent | \`aivos.analytics.ingested\` | OBSERVABILITY_SPEC |
| 5 Learning | Learning Engine | \`aivos.learning.updated\` | LEARNING_ENGINE_SPEC |
| 6 Prompt Update | Prompt Registry + Governance | \`aivos.prompt.versioned\` | PROMPT_COMPILER_SPEC |
| 7 Next Gen | Task Runtime new job | \`aivos.runtime.job.created\` | SDK_SPEC |

---

## 2. Data Flow

\`\`\`mermaid
flowchart LR
  Gen[Generate] --> Judge[Quality Judge]
  Judge --> Pub[Publish]
  Pub --> Ana[Analytics]
  Ana --> Learn[Learning Engine]
  Learn --> Prompt[Prompt Update]
  Prompt --> Gen
\`\`\`

Each transition persists checkpoint + ACP event for audit (GOVERNANCE_SPEC).

---

## 3. Human-in-the-Loop Gates

| Gate | Location | Blocks loop? |
|------|----------|--------------|
| Draft review | Approval after quality | Yes — no analytics until publish |
| Prompt evolution approve | Governance | Yes — step 6 |
| Brand DNA approve | Brand owner | Partial — tone only |

---

## 4. Metrics (loop health)

| Metric | Target |
|--------|--------|
| Loop latency (publish → prompt update) | < 7 days batch |
| Quality score trend | Non-decreasing over 30d |
| Engagement lift post-evolution | Measurable A/B |

---

## 5. Failure Modes

| Failure | Recovery |
|---------|----------|
| Analytics gap | Retry ingest; exclude from batch |
| Bad prompt evolution | Governance rollback |
| Quality regression | Freeze learning; alert |

---

## 6. Phase Exit

- [ ] End-to-end loop diagram validated in E2E test E06
- [ ] Published-only filter enforced
- [ ] TEST_PLAN F01–F05

*See: LEARNING_ENGINE_SPEC.md, QUALITY_ENGINE_SPEC.md, GOVERNANCE_SPEC.md*
`);

OUT('CAPABILITY_DISCOVERY_SPEC.md', hdr('Capability Discovery Specification', '**Path:** `backend/lib/aivos/runtime/capabilityDiscovery.js`\n**See:** AI_RUNTIME_SPEC.md §Capability Discovery, SKILL_GRAPH_SPEC.md\n') + `## 1. Purpose

**Kernel answers available skills; Runtime auto-composes workflow.** No hardcoded plugin stage lists. Plugins declare capability tokens; discovery matches skills and workflow templates.

---

## 2. Discovery Algorithm

\`\`\`
1. Load plugin capabilities[] from aivos_plugin_registry
2. Query aivos_skill_registry for skills matching capabilities
3. Filter: marketplace enabled, permissions, billing entitlement
4. Load optional workflow template from marketplace
5. Planner builds minimal DAG for intent → output artifact
6. Missing skill → fail fast capability_gap event
\`\`\`

**Module:** \`runtime/capabilityDiscovery.js\`
**Called by:** \`runtime/planner.js\`

---

## 3. Capability Tokens

| Token pattern | Example |
|---------------|---------|
| \`video.{product}\` | video.talent_intro |
| \`ocr.{format}\` | ocr.pdf |
| \`voice.tts\` | voice.tts |
| \`profile.analyze\` | profile.analyze |

Plugins register tokens — **not** node IDs like \`extract\` or \`render\`.

---

## 4. Composition Rules

| Input signal | Discovery action |
|--------------|------------------|
| PDF upload detected | Inject OCR capability requirement |
| Premium tier | Prefer premium skill variants |
| Short duration intent | Skip optional motion nodes |
| Missing voice skill | capability_gap — suggest marketplace install |

Output: \`DiscoveryPlan { skills[], workflowTemplateId, estimatedNodes[] }\`

---

## 5. Kernel Role

Kernel \`skillRegistry.list({ capability, enabled })\` — **read-only catalog**.

Kernel does **not** compose DAGs. Runtime Planner owns graph construction (EXECUTION_GRAPH_SPEC).

---

## 6. Events

| Event | When |
|-------|------|
| \`aivos.discovery.completed\` | Plan ready |
| \`aivos.discovery.capability_gap\` | Missing skill/workflow |

---

## 7. resume-ai Example

\`\`\`javascript
capabilities: ['video.talent_intro', 'profile.analyze', 'ocr.pdf']
// Runtime adds OCR node only when PDF input present
// Maps to skills: resume-extract-profile, resume-story-beats, ...
\`\`\`

---

## 8. Phase Exit

- [ ] No getStageGraph() in plugin SDK
- [ ] PDF vs text input produces different DAGs
- [ ] TEST_PLAN C01–C05

*See: EXECUTION_GRAPH_SPEC.md, WORKFLOW_MARKETPLACE_SPEC.md, PLUGIN_SDK.md*
`);

OUT('EXECUTION_GRAPH_SPEC.md', hdr('Execution Graph Specification', '**Path:** `backend/lib/aivos/runtime/executionGraph.js`\n**See:** VIDEO_PIPELINE_SPEC.md, AI_RUNTIME_SPEC.md §Execution Graph\n') + `## 1. Purpose

The **Execution Graph** is a checkpointed **DAG** of video production nodes. Generic template — **no Resume-specific knowledge** in graph engine. Resume behavior comes from skills + plugin intent.

---

## 2. Canonical DAG (15 nodes)

\`\`\`
OCR → Extract → Normalize → Analyze → Story → Creative → Prompt → Image → Motion → Voice → Subtitle → Music → Render → Quality → Publish
\`\`\`

| Node ID | Checkpoint key | Retry |
|---------|----------------|-------|
| ocr | ocr.json | 3× exp backoff |
| extract | extract.json | 2× |
| normalize | normalize.json | 2× |
| analyze | analysis.json | 2× |
| story | plan.json | 2× |
| creative | style_manifest.json | 1× |
| prompt | prompts.json | 2× |
| image | images/ | 2× per scene |
| motion | clips/ | 2× |
| voice | voice.wav | 3× |
| subtitle | subs.ass | 2× |
| music | music.mp3 | 1× |
| render | draft.mp4 | 2× |
| quality | quality.json | partial via Decision Engine |
| publish | published_url | 1× |

**Parallelism:** image ∥ voice after prompt/story (Planner sets groups).

---

## 3. Checkpoint / Retry / Resume

Pattern from \`registrationEvolution/workflowCheckpointRuntime.js\`:

- Immutable append-only \`aivos_workflow_checkpoints\`
- SHA-256 checksum per payload
- Resume from last completed node after worker kill
- Retry API: \`POST /api/video/jobs/:id/retry?nodes=voice,subtitle\`

\`\`\`javascript
async function runNode(jobId, nodeId) {
  if (await hasCheckpoint(jobId, nodeId)) return loadCheckpoint();
  await emitACP('aivos.pipeline.stage.started', { jobId, stage: nodeId });
  const output = await executeNode(jobId, nodeId); // Policy → Prompt Compiler → Kernel
  await insertCheckpoint(jobId, nodeId, output);
  await emitACP('aivos.pipeline.stage.completed', { jobId, stage: nodeId });
}
\`\`\`

---

## 4. Node Execution Stack

Each node:

1. Load context snapshot
2. Resolve skill → agent binding (SKILL_GRAPH_SPEC)
3. Policy Engine resolve for infer tasks
4. Prompt Compiler compile for LLM nodes
5. Kernel infer / media workers
6. Persist checkpoint + timeline row

---

## 5. Tables

| Table | Role |
|-------|------|
| \`aivos_workflow_jobs\` | Graph instance; FK \`runtime_job_id\` |
| \`aivos_workflow_checkpoints\` | Per-node JSON |
| \`aivos_runtime_plans\` | Frozen DAG plan JSON |

---

## 6. Template vs Engine

| Component | Path | Role |
|-----------|------|------|
| Engine | \`runtime/executionGraph.js\` | Run any DAG |
| Template | \`pipeline/templates/videoPipelineV1.js\` | 15-node definition |

VIDEO_PIPELINE_SPEC describes template mapping — not orchestration logic.

---

## 7. Phase Exit

- [ ] Worker kill → resume mid-DAG
- [ ] Partial retry from quality node
- [ ] TEST_PLAN P01–P07

*See: VIDEO_PIPELINE_SPEC.md, CAPABILITY_DISCOVERY_SPEC.md, OBSERVABILITY_SPEC.md*
`);

OUT('SKILL_GRAPH_SPEC.md', hdr('Skill Graph Specification', '**Path:** `backend/lib/aivos/runtime/skillGraph.js` + `kernel/skillRegistry.js`\n**See:** AI_RUNTIME_SPEC.md §Skill Graph, CAPABILITY_DISCOVERY_SPEC.md\n') + `## 1. Agent vs Skill Separation

| Concept | Definition | Storage |
|---------|------------|---------|
| **Agent** | Long-lived identity, persona, default permissions | \`aivos_agent_registry\` |
| **Skill** | Executable unit: schema in/out, prompt_id, stage affinity | \`aivos_skill_registry\` |

**Rule:** Agents do not run directly — Runtime invokes **skills**. One agent may expose many skills.

---

## 2. Skill Registration

\`\`\`javascript
skillRegistry.register({
  id: 'resume-extract-profile',
  version: 1,
  agentId: 'resume-analyzer',
  capabilities: ['profile.analyze'],
  stageAffinity: ['extract', 'analyze'],
  inputSchema: { type: 'object', properties: { raw_text: { type: 'string' } } },
  outputSchema: { type: 'object', properties: { profile: { type: 'object' } } },
  promptId: 'talent-resume-draft@v2',
  taskTypes: ['structured_json']
});
\`\`\`

Plugins declare \`requiredSkills[]\` — not agent IDs.

---

## 3. Skill Graph Resolution

\`\`\`
Planner output skill IDs
  → skillGraph.resolve(skillIds)
  → validate schemas + marketplace enabled
  → bind to execution graph nodes
  → return ExecutionPlan
\`\`\`

Module: \`runtime/skillGraph.js\`

---

## 4. Resume Agent Skills (example)

| Skill ID | Agent | Stage | Reuses |
|----------|-------|-------|--------|
| resume-ocr | ocr-extractor | ocr | ai-core vision |
| resume-extract-profile | resume-analyzer | extract | talentResumeService |
| resume-normalize | data-normalizer | normalize | schema transform |
| resume-analyze | resume-analyzer | analyze | generateTalentResumeDraft |
| resume-story-beats | story-planner | story | planning prompt |
| resume-voice-script | voice-director | voice | talentVideoService |
| resume-publish | publishing-agent | publish | publishTalentResume |

---

## 5. Discovery Integration

\`skillRegistry.list({ capability, enabled: true })\` feeds CAPABILITY_DISCOVERY_SPEC.

Skills versioned via GOVERNANCE_SPEC — jobs pin skill versions in \`aivos_runtime_plans\`.

---

## 6. API

| Method | Path | Access |
|--------|------|--------|
| GET | \`/api/aivos/skills\` | SDK aqond.agent().listSkills |
| GET | \`/api/aivos/agents\` | Public metadata only |
| POST | \`/api/aivos/admin/skills\` | Admin register |

---

## 7. Phase Exit

- [ ] All resume DAG nodes map to registered skills
- [ ] Schema validation fails fast on bad intent
- [ ] TEST_PLAN S01–S05

*See: PROMPT_COMPILER_SPEC.md, EXECUTION_GRAPH_SPEC.md, PLUGIN_SDK.md*
`);

// ─── UPDATED SPECS v3.0 (10) ───────────────────────────────────────────────

OUT('AI_RUNTIME_SPEC.md', hdr('AI Runtime Specification', `**Path:** \`backend/lib/aivos/runtime/\`
**Constitution layer:** Layer 1 — AI Runtime Platform
**Prerequisites:** AI_OS_CONSTITUTION.md, AUDIT.md, all sub-specs listed §Index

`) + `## Executive Summary

The **AI Runtime Platform** is the orchestration and governance layer of AQOND AI-OS Constitution v1.0. It sits between AQOND Core and the AI Kernel. Plugins never invoke Kernel, models, or raw prompts. Runtime owns: planning, policy, prompt compilation, execution graphs, skill graphs, capability discovery, semantic memory orchestration, learning, feedback loops, human approval, cost, governance, observability, SDK surface, plugin runtime, workflow marketplace, and extension APIs.

**Stack:** AQOND CORE → **AI Runtime** → AI Kernel → Video Pipeline → Plugin Platform → Frontend

**Scale targets (no core rewrite):** 100 plugins, 100 models, 1,000 concurrent jobs, 100,000 users.

**Code paths:** \`backend/lib/aivos/runtime/\`, \`kernel/\`, \`pipeline/\`, \`sdk/\`

**Migrations:** \`259_ai_video_platform.sql\` (runtime/kernel), \`260_ai_runtime_semantic.sql\` (semantic/learning/governance/marketplace)

**Philosophy:** Architecture → Spec → Review → Implement → Test → Optimize → Production — **NO code until APPROVED.**

---

## §Index — Sub-Specifications

| # | Component | Spec document | Runtime module |
|---|-----------|---------------|----------------|
| 1 | Task Runtime | This doc §1 | \`taskRuntime.js\` |
| 2 | Execution Runtime | EXECUTION_GRAPH_SPEC.md | \`executionGraph.js\` |
| 3 | Planner | CAPABILITY_DISCOVERY_SPEC.md | \`planner.js\` |
| 4 | Skill Graph | SKILL_GRAPH_SPEC.md | \`skillGraph.js\` |
| 5 | Capability Discovery | CAPABILITY_DISCOVERY_SPEC.md | \`capabilityDiscovery.js\` |
| 6 | Semantic Memory | SEMANTIC_MEMORY_SPEC.md | via Kernel \`memoryApi.js\` |
| 7 | Learning Engine | LEARNING_ENGINE_SPEC.md | \`learningEngine.js\` |
| 8 | Feedback Loop | FEEDBACK_LOOP_SPEC.md | cross-cutting |
| 9 | Human Approval | This doc §9 | \`approvalGate.js\` |
| 10 | Cost Engine | This doc §11 | \`costDashboard.js\` |
| 11 | Governance | GOVERNANCE_SPEC.md | \`governance.js\` |
| 12 | Policy Engine | AI_POLICY_ENGINE_SPEC.md | \`policyEngine.js\` |
| 13 | Prompt Compiler | PROMPT_COMPILER_SPEC.md | \`promptCompiler.js\` |
| 14 | Observability | OBSERVABILITY_SPEC.md | \`observability.js\` |
| 15 | Runtime SDK | SDK_SPEC.md | \`sdk/\` |
| 16 | Plugin Runtime | PLUGIN_SDK.md | \`plugins/\` |
| 17 | Workflow Marketplace | WORKFLOW_MARKETPLACE_SPEC.md | \`marketplace.js\` |
| 18 | Extension API | PLUGIN_SDK.md §Extension | route mounts |
| 19 | Creative Runtime | This doc §6 | \`creativeRuntime.js\` |
| 20 | Event Bus / ACP | EVENT_BUS_SPEC.md | \`acpValidator.js\` |
| 21 | Quality integration | QUALITY_ENGINE_SPEC.md | Kernel \`qualityEngine.js\` |
| 22 | Video template | VIDEO_PIPELINE_SPEC.md | \`pipeline/templates/\` |

---

## §0 Reuse Map (AUDIT.md — do not redesign)

${REUSE}

**Explicit non-goals:** Redesign \`paymentManager.js\`, refactor \`registrationEvolution/\`.

---

## §1 Task Runtime

Entry point for every AI job.

\`\`\`
Plugin intent → Runtime.submitJob() → Planner → Policy → Prompt Compiler → Execution Graph → Kernel (infer only)
\`\`\`

| Component | Module | Responsibility |
|-----------|--------|----------------|
| Task Runtime | \`taskRuntime.js\` | Job lifecycle, queues, approval gates |
| Planner | \`planner.js\` | Intent → skill + execution DAG |
| Policy Engine | \`policyEngine.js\` | Model/budget/latency/quality — see AI_POLICY_ENGINE_SPEC |
| Prompt Compiler | \`promptCompiler.js\` | Intent → compiled prompt — see PROMPT_COMPILER_SPEC |
| Execution Graph | \`executionGraph.js\` | DAG executor — see EXECUTION_GRAPH_SPEC |

**Tables (259):** \`aivos_runtime_jobs\`, \`aivos_runtime_plans\`, \`aivos_context_snapshots\`

**API:** \`POST /api/aivos/runtime/jobs\`, \`GET /api/aivos/runtime/jobs/:id\`

**Queue:** \`aivos-runtime-jobs\` in \`queues.js\`

---

## §2 Execution Runtime

Full DAG orchestration documented in **EXECUTION_GRAPH_SPEC.md**. Runtime materializes plans from Capability Discovery + marketplace workflow templates.

15 canonical nodes: OCR → Extract → Normalize → Analyze → Story → Creative → Prompt → Image → Motion → Voice → Subtitle → Music → Render → Quality → Publish.

Checkpoint pattern: \`registrationEvolution/workflowCheckpointRuntime.js\` (**pattern copy**).

---

## §3 Planner + Capability Discovery

**CAPABILITY_DISCOVERY_SPEC.md** — plugins declare capabilities; Runtime composes DAG. No hardcoded stage lists in plugins.

**SKILL_GRAPH_SPEC.md** — resolves skills to agents and prompt bindings.

---

## §4 Semantic Memory

**SEMANTIC_MEMORY_SPEC.md** — 7 layers; L7 pgvector. Runtime calls Kernel Memory API; never direct PG from plugins.

Hermes L2/L3 reused. Migration 260: \`aivos_semantic_memory\`.

---

## §5 Learning Engine + Feedback Loop

**LEARNING_ENGINE_SPEC.md** — CTR, watch time, completion, likes, shares, quality → prompt/brand/creative updates.

**FEEDBACK_LOOP_SPEC.md** — Generate → Judge → Publish → Analytics → Learning → Prompt Update → Next Generation.

Batch queue: \`aivos-learning-batch\`. Published jobs only.

---

## §6 Creative Runtime

\`runtime/creativeRuntime.js\` — Story, Visual, Motion, Voice, Brand directors. Kernel Creative Director merges → authoritative \`style_manifest.json\`. Plugins supply intent only.

---

## §7 Governance + Policy + Prompt Compiler

| Engine | Spec | Rule |
|--------|------|------|
| Governance | GOVERNANCE_SPEC.md | Version everything; audit trail; reproduce |
| Policy | AI_POLICY_ENGINE_SPEC.md | Runtime decides models — plugins never |
| Prompt Compiler | PROMPT_COMPILER_SPEC.md | No raw plugin prompts |

---

## §8 Observability + SDK

**OBSERVABILITY_SPEC.md** — trace, timeline, metrics, logs, events, cost, OpenTelemetry alignment.

**SDK_SPEC.md** — \`aqond.runtime()\`, \`workflow()\`, \`video()\`, \`memory()\`, \`plugin()\`, \`agent()\`, \`events()\` — no internal access.

---

## §9 Human Approval

| State | Description |
|-------|-------------|
| draft → preview → approve/reject/reprompt → publish | Default after quality node |

Table: \`aivos_approval_requests\`. FCM via \`fcmService.js\`.

API: \`/api/aivos/runtime/jobs/:id/approve\`, \`reject\`, \`reprompt\`

---

## §10 Plugin Runtime + Marketplace

**PLUGIN_SDK.md** — intent, capabilities, permissions, billing, dependencies, events, 4-question checklist.

**WORKFLOW_MARKETPLACE_SPEC.md** — Install/Enable/Disable/Upgrade/Rollback/Suspend/Resume/Delete.

---

## §11 Cost Engine

\`costDashboard.js\` — aggregates \`aivos_cost_ledger\`, \`ai.inference_log\`. Policy Engine pre-flight budget gate.

API: \`GET /api/aivos/runtime/cost\`

---

## §12 Layer Diagram

${LAYERS}

---

## §13 Database Summary

### Migration 259

${MIG259}

### Migration 260

${MIG260}

---

## §14 API Surface (Runtime)

| Method | Path | Phase |
|--------|------|-------|
| POST | \`/api/aivos/runtime/jobs\` | 1 |
| GET | \`/api/aivos/runtime/jobs/:id\` | 1 |
| GET | \`/api/aivos/runtime/jobs/:id/plan\` | 1 |
| GET | \`/api/aivos/runtime/jobs/:id/trace\` | 2 |
| POST | \`/api/aivos/runtime/jobs/:id/approve\` | 1 |
| GET | \`/api/aivos/runtime/cost\` | 2 |
| GET | \`/api/aivos/marketplace/plugins\` | 2 |
| POST | \`/api/video/jobs\` | 2 (proxy) |

Legacy \`/api/growth/talent/*\` remain during migration.

---

## §15 Architecture Validation

| Dimension | Target | Strategy |
|-----------|--------|----------|
| Plugins | 100 | Registry + capability discovery |
| Models | 100 | Policy + Model Router tables |
| Concurrent jobs | 1,000 | Bull workers × N |
| Users | 100,000 | Stateless Runtime; PG replicas |

**Pre-code checklist:**

- [ ] No plugin imports \`kernel/*\`
- [ ] All inference via Policy → Kernel
- [ ] Prompt Compiler rejects raw prompts
- [ ] Governance audit on version changes
- [ ] Migrations 259/260 reviewed
- [ ] ARCHITECTURE_READINESS.md overall READY

---

## §16 Sub-Spec Quick Reference

### Policy Engine (AI_POLICY_ENGINE_SPEC.md)

Runtime resolves model, budget, latency, quality tier, premium routing, fallback **before** every Kernel infer. \`aivos_policy_rules\` + \`aivos_policy_decisions\`.

### Prompt Compiler (PROMPT_COMPILER_SPEC.md)

\`intent + skillId + promptId@version → CompiledPrompt\`. Stored in \`aivos_prompt_compilations\`. Rejects raw plugin prompt strings.

### Governance (GOVERNANCE_SPEC.md)

Version prompts, skills, workflows, models, runtime, pipeline, plugins, brand. \`governance.reproduce(jobId)\` for forensic replay.

### SDK (SDK_SPEC.md)

External surface: \`aqond.runtime()\`, \`workflow()\`, \`video()\`, \`memory()\`, \`plugin()\`, \`agent()\`, \`events()\`. No \`kernel/*\` imports.

### Workflow Marketplace (WORKFLOW_MARKETPLACE_SPEC.md)

Installable workflows + plugins. Lifecycle: Install/Enable/Disable/Upgrade/Rollback/Suspend/Resume/Delete.

### Observability (OBSERVABILITY_SPEC.md)

Trace, timeline, metrics, logs, events, cost, memory ops, model usage, workflow history. OpenTelemetry span names aligned.

### Semantic Memory (SEMANTIC_MEMORY_SPEC.md)

7 layers; L7 \`aivos_semantic_memory\` pgvector. Search stories, hooks, resumes, prompts, videos. Hermes L2/L3 reused.

### Learning Engine (LEARNING_ENGINE_SPEC.md)

CTR, watch time, completion, likes, shares, quality feedback → prompt registry, brand DNA, creative runtime weights.

### Feedback Loop (FEEDBACK_LOOP_SPEC.md)

Generate→Judge→Publish→Analytics→Learning→Prompt Update→Next Generation. Published jobs only.

### Capability Discovery (CAPABILITY_DISCOVERY_SPEC.md)

Plugin capabilities → skill match → minimal DAG. \`capability_gap\` event on missing skill.

### Execution Graph (EXECUTION_GRAPH_SPEC.md)

15-node DAG: OCR through Publish. Checkpoint/retry/resume per node. Engine in Runtime; template in Pipeline.

### Skill Graph (SKILL_GRAPH_SPEC.md)

Agent vs Skill separation. Skills registered in \`aivos_skill_registry\`; plugins declare \`requiredSkills\`.

---

## §17 Bull Queues (reuse queues.js)

| Queue name | Consumer | Phase |
|------------|----------|-------|
| \`aivos-runtime-jobs\` | Task Runtime worker | 1 |
| \`aivos-video-pipeline\` | Execution Graph executor | 3 |
| \`aivos-learning-batch\` | Learning Engine nightly | 6 |

Do **not** add parallel queue systems — extend \`queues.js\` only.

---

## Human Sign-Off

- [ ] AI Runtime spec (this document) **APPROVED**
- [ ] All 22 sub-specs cross-referenced and **APPROVED**
- [ ] Migration 259 + 260 **APPROVED**
- [ ] Phase 1 Runtime scope **APPROVED**

**Approved by:** _______________ **Date:** _______________

---

*Master index for Constitution v1.0. See AI_OS_CONSTITUTION.md, ARCHITECTURE_READINESS.md.*
`);

OUT('AI_KERNEL_SPEC.md', hdr('AI Kernel Specification', '**Path:** `backend/lib/aivos/kernel/`\n**Constitution layer:** Layer 2 — AI Kernel (inference ONLY)\n**Parent:** AI Runtime invokes Kernel — plugins **never** call Kernel\n') + `## 1. Purpose (v3.0)

The AI Kernel is **inference only**. No orchestration, no plugin-facing routes, no DAG execution. **AI Runtime** invokes Kernel via Policy Engine routing after Prompt Compiler assembly.

| Caller | Allowed |
|--------|---------|
| AI Runtime | \`kernel.infer\`, \`kernel.memory.*\`, \`kernel.quality.*\`, \`kernel.creative.*\`, \`eventBus.publish\` |
| Plugins | **None** |
| Pipeline nodes | **None** — nodes execute as Runtime DAG calling Kernel via executor |

**Factory:** \`createKernel(deps)\` — only from \`createRuntime(deps)\`.

---

## 2. Policy Engine Routing

Runtime passes **PolicyDecision** to Kernel — Kernel Model Router executes, never overrides.

\`\`\`
Runtime.policyEngine.resolve(taskType, context)
  → Kernel.modelRouter.infer(taskType, policyDecision, compiledPrompt)
  → ai-core POST /v1/chat
  → ai.inference_log + aivos_cost_ledger
\`\`\`

See **AI_POLICY_ENGINE_SPEC.md**.

---

## 3. Kernel Modules (15)

| Module | File | Responsibility |
|--------|------|----------------|
| Model Router | \`modelRouter.js\` | Execute policy slot → ai-core |
| Context Bus | \`contextBus.js\` | Kernel-internal pub/sub |
| Memory API | \`memoryApi.js\` | 7 layers — SEMANTIC_MEMORY_SPEC |
| Prompt Registry | \`promptRegistry.js\` | Versioned templates (read by Prompt Compiler) |
| Task Planner | \`taskPlanner.js\` | Skill task hints (Runtime owns compose) |
| Agent Registry | \`agentRegistry.js\` | \`aivos_agent_registry\` |
| Skill Registry | \`skillRegistry.js\` | \`aivos_skill_registry\` — SKILL_GRAPH_SPEC |
| Decision Engine | \`decisionEngine.js\` | Partial retry routing |
| Event Bus | \`eventBus.js\` | ACP transport — EVENT_BUS_SPEC |
| Quality Engine | \`qualityEngine.js\` | QUALITY_ENGINE_SPEC |
| Creative Director | \`creativeDirector.js\` | Merge Creative Runtime outputs |
| Brand DNA | \`brandDna.js\` | \`aivos_brand_dna\` CRUD |
| Cost Optimizer | \`costOptimizer.js\` | Estimate for Policy budget gate |
| Retry Manager | \`retryManager.js\` | Backoff; ai-core 429 |
| Checkpoint Manager | \`checkpointManager.js\` | Context snapshots |

---

## 4. Memory API — 7 Layers

See **SEMANTIC_MEMORY_SPEC.md**. Kernel exposes:

\`\`\`javascript
memory.get / set / appendEpisode / getBrandDna
memory.semantic.search / upsert
\`\`\`

---

## 5. Runtime Integration Matrix

| Runtime module | Kernel module |
|----------------|---------------|
| executionGraph.js | modelRouter, agentRegistry |
| promptCompiler.js | promptRegistry (read) |
| policyEngine.js | costOptimizer, modelRouter |
| learningEngine.js | promptRegistry, memoryApi |
| approvalGate.js | qualityEngine |
| capabilityDiscovery.js | skillRegistry.list |

---

## 6. Phase Exit

- [ ] \`createKernel()\` callable only from \`createRuntime()\`
- [ ] No HTTP routes mount Kernel directly
- [ ] PolicyDecision required on every infer()
- [ ] TEST_PLAN K01–K06

*See: AI_RUNTIME_SPEC.md, AI_POLICY_ENGINE_SPEC.md, PROMPT_COMPILER_SPEC.md*
`);

OUT('AI_VIDEO_PLATFORM_ARCHITECTURE.md', hdr('AQOND AI Video Platform — Architecture', '**Constitution layer:** Full 5-layer stack\n**Prerequisites:** AI_OS_CONSTITUTION.md, AI_RUNTIME_SPEC.md\n') + `## 1. Mission

Production-ready **AI Video Platform** on AQOND AI-OS Constitution v1.0. Resume AI is **Plugin #1**. All video products share Runtime → Kernel → Pipeline stack.

---

## 2. Constitution Stack (5 Layers + Core)

${LAYERS}

### Mermaid — Constitution v1.0 flow

\`\`\`mermaid
flowchart TB
  subgraph L5 [Layer 5 Frontend]
    Studio[AI Studio]
  end
  subgraph L4 [Layer 4 Plugin Platform]
    Resume[resume-ai]
  end
  subgraph L3 [Layer 3 Video Pipeline]
    Template[Execution Graph Template]
  end
  subgraph L2 [Layer 2 AI Kernel]
    Router[Model Router inference only]
    Mem[Memory 7 layers]
  end
  subgraph L1 [Layer 1 AI Runtime Platform]
    Policy[Policy Engine]
    Compiler[Prompt Compiler]
    Planner[Planner + Discovery]
    Exec[Execution Graph]
    Gov[Governance]
  end
  subgraph L0 [Layer 0 AQOND CORE]
    Core[Auth Billing Queue Media S3]
  end
  Studio --> Resume
  Resume --> Planner
  Planner --> Exec
  Policy --> Router
  Compiler --> Router
  Exec --> Template
  Exec --> Router
  Gov --> Core
\`\`\`

---

## 3. Design Principles (Constitution v1.0)

| Rule | Enforcement |
|------|-------------|
| Reuse ≥80% | AUDIT.md modules; no wallet/auth/queue replacement |
| Runtime owns orchestration | Plugin → Runtime → Kernel |
| Kernel = inference only | No DAG in Kernel |
| Policy decides models | AI_POLICY_ENGINE_SPEC |
| Prompt Compiler builds prompts | No raw plugin prompts |
| Capability discovery | No hardcoded plugin stages |
| Version everything | GOVERNANCE_SPEC |
| Event-driven ACP | EVENT_BUS_SPEC |
| Scale 100/100/1000/100k | Horizontal only |

---

## 4. Code Layout

| Path | Layer |
|------|-------|
| \`backend/lib/aivos/runtime/\` | L1 Runtime Platform |
| \`backend/lib/aivos/kernel/\` | L2 Kernel |
| \`backend/lib/aivos/pipeline/\` | L3 Pipeline templates |
| \`backend/lib/aivos/plugins/\` | L4 Plugin SDK |
| \`backend/lib/aivos/sdk/\` | External SDK |
| \`backend/db/migrations/259_*.sql\` | Runtime + kernel |
| \`backend/db/migrations/260_*.sql\` | Semantic + learning + governance + marketplace |

**Protected:** \`paymentManager.js\`, \`registrationEvolution/\`, \`talentResumeService.js\`, \`talentVideoService.js\`.

---

## 5. Specification Corpus (22 + 2 meta)

| Category | Documents |
|----------|-----------|
| Runtime index | AI_RUNTIME_SPEC.md |
| New v3.0 | AI_POLICY_ENGINE, PROMPT_COMPILER, GOVERNANCE, SDK, WORKFLOW_MARKETPLACE, OBSERVABILITY, SEMANTIC_MEMORY, LEARNING_ENGINE, FEEDBACK_LOOP, CAPABILITY_DISCOVERY, EXECUTION_GRAPH, SKILL_GRAPH |
| Updated | AI_KERNEL, VIDEO_PIPELINE, PLUGIN_SDK, EVENT_BUS, QUALITY_ENGINE, IMPLEMENTATION_PLAN, TEST_PLAN, ARCHITECTURE_REVIEW |
| Meta | AI_OS_CONSTITUTION.md, ARCHITECTURE_READINESS.md |

---

## 6. Reuse Map

${REUSE}

---

## 7. Phase Gates

| Phase | Exit |
|-------|------|
| 0 | All specs APPROVED (Constitution freeze) |
| 1 | Runtime MVP — **only after APPROVED** |
| 2–8 | IMPLEMENTATION_PLAN.md |

**Rule:** Design → Review → Implement. No code until APPROVED.

| \`aivos-learning-batch\` | Learning Engine nightly | Phase 6 |

Do **not** add parallel queue systems — extend \`queues.js\` only.

---

## Human Sign-Off

- [ ] Constitution v1.0 architecture **APPROVED**
- [ ] ARCHITECTURE_READINESS.md **READY**

*Primary reference: AI_RUNTIME_SPEC.md, AI_OS_CONSTITUTION.md*
`);

OUT('VIDEO_PIPELINE_SPEC.md', hdr('Video Pipeline Specification', '**Path:** `backend/lib/aivos/pipeline/`\n**Constitution layer:** Layer 3 — Generic Video Pipeline\n**Parent:** Execution Graph **template** — no Resume knowledge in pipeline module\n') + `## 1. Generic Pipeline (v3.0)

The Video Pipeline is a **generic Execution Graph template** — not a standalone runner. **AI Runtime** instantiates template DAGs. Pipeline module exports node definitions only; **no Resume-specific logic**.

\`\`\`
Plugin → Runtime.submitJob() → Planner → Execution Graph Engine → template nodes → Kernel per node
\`\`\`

**Path:** \`backend/lib/aivos/pipeline/templates/videoPipelineV1.js\`

---

## 2. Phase Groups (generic)

| Phase | Nodes | Purpose |
|-------|-------|---------|
| **Input** | (Runtime pre-stage) | Validate intent + artifacts |
| **Planning** | ocr, extract, normalize, analyze, story | Structure content |
| **Creative** | creative, prompt | Style + compiled prompts |
| **Media** | image, motion, voice, subtitle, music | Asset generation |
| **Rendering** | render | ffmpeg compose |
| **Quality** | quality | Rubric gate |
| **Publishing** | publish | Feed/profile placement |

Full node list: **EXECUTION_GRAPH_SPEC.md** (15 nodes).

---

## 3. No Resume Knowledge

| Concern | Location |
|---------|----------|
| Resume extract logic | Skill \`resume-extract-profile\` + talentResumeService adapter |
| Resume publish | Skill \`resume-publish\` |
| DAG structure | Generic template |
| OCR when PDF | Capability Discovery injects node |

Pipeline templates are **product-agnostic**. Product behavior = skills + plugin intent.

---

## 4. Human Approval Gates

| Gate | After node | Default |
|------|------------|---------|
| creative_review | creative | off |
| draft_review | quality | on |
| publish_confirm | approve | on |

Runtime \`approvalGate.js\` pauses graph — see AI_RUNTIME_SPEC §9.

---

## 5. Checkpoint & Resume

\`aivos_workflow_jobs\`, \`aivos_workflow_checkpoints\`, \`aivos_video_timeline\`.

Pattern: \`registrationEvolution/workflowCheckpointRuntime.js\` — immutable, checksum, resume last node.

Retry: \`POST /api/video/jobs/:id/retry?nodes=\` — Runtime Decision Engine.

---

## 6. Reuse Map (media nodes)

| Node | Existing module |
|------|-----------------|
| voice | \`talentVideoService\` TTS |
| render | \`incubationCompose.js\` |
| publish | plugin skill adapter |
| credit gate | \`growthEngine.js\` |
| queue | \`queues.js\` |

---

## 7. API (proxied via Runtime)

| Method | Path |
|--------|------|
| POST | \`/api/video/jobs\` |
| GET | \`/api/video/jobs/:id\` |
| GET | \`/api/video/jobs/:id/timeline\` |
| POST | \`/api/video/jobs/:id/retry\` |
| POST | \`/api/video/jobs/:id/publish\` |

---

## 8. Phase Exit

- [ ] Template loaded by Runtime for resume-ai
- [ ] All 15 nodes checkpointed
- [ ] No resume imports in \`pipeline/templates/*.js\`
- [ ] TEST_PLAN P01–P07

*See: EXECUTION_GRAPH_SPEC.md, CAPABILITY_DISCOVERY_SPEC.md, AI_RUNTIME_SPEC.md*
`);

OUT('PLUGIN_SDK.md', hdr('Plugin SDK Specification', '**Path:** `backend/lib/aivos/plugins/`\n**Constitution layer:** Layer 4 — Plugin Platform\n**See:** SDK_SPEC.md (external), WORKFLOW_MARKETPLACE_SPEC.md\n') + `## 1. v3.0 Principles

Plugins declare **intent, capabilities, permissions, billing, dependencies, events** — not models, prompts, or pipeline stages.

\`\`\`typescript
export interface AivosPlugin {
  id: string;
  version: string;
  capabilities: string[];
  requiredSkills: string[];
  permissions: PluginPermission[];
  billing: { creditField: string; costPerJob: number };
  dependencies?: { plugins?: string[]; workflows?: string[] };
  events?: { publishes?: string[]; subscribes?: string[] };
  approval: { autoPublish: boolean; gates: string[] };
  registerRoutes(app, deps): void;
  buildInput(raw, ctx): Promise<IntentJSON>;  // NOT prompts
}
\`\`\`

**Removed:** \`getStageGraph()\`, direct \`kernel\` access, raw prompt fields.

---

## 2. Four-Question Checklist (mandatory before new plugin)

1. **Capabilities:** What tokens? Skills in registry? Workflow in marketplace?
2. **Reuse:** Which existing services wrap (≥80%)? No duplicate tables?
3. **Billing:** \`growth_entitlements\` field? Marketplace multiplier?
4. **Approval:** Human gates? Auto-publish policy?

**Gate:** Architecture review + ARCHITECTURE_READINESS **APPROVED** — no code until then.

---

## 3. PluginDeps (v3.0)

\`\`\`typescript
interface PluginDeps {
  pool: pg.Pool;
  redis: RedisClient;
  runtime: RuntimeClient;  // SDK-backed — NOT kernel
  eventBus: EventBusSubscribeOnly;
  marketplace: MarketplaceClient;
  authenticateToken: RequestHandler;
  growthEngine: typeof growthEngine;
  s3: { uploadToS3: Function };
}
\`\`\`

---

## 4. Marketplace Lifecycle

Install → Enable → Run → Disable → Upgrade → Rollback → Suspend → Resume → Delete

See **WORKFLOW_MARKETPLACE_SPEC.md**. Tables migration 260.

---

## 5. resume-ai (Plugin #1)

| Field | Value |
|-------|-------|
| capabilities | \`video.talent_intro\`, \`profile.analyze\`, \`ocr.pdf\` |
| requiredSkills | resume-extract-profile, resume-story-beats, resume-voice-script, resume-publish |
| billing | \`ai_video_credits\` via growthEngine |
| approval | draft_review gate |
| flag | \`AIVOS_RESUME_PLUGIN=1\` |

---

## 6. Permissions & Events

OAuth-style scopes in \`aivos_plugin_permissions\`. Plugins emit events **via Runtime only** — ACP envelope.

---

## 7. Phase Exit

- [ ] resume-ai uses intent-only buildInput
- [ ] Marketplace install/enable
- [ ] TEST_PLAN R01–R05

*See: CAPABILITY_DISCOVERY_SPEC.md, SDK_SPEC.md, AI_RUNTIME_SPEC.md*
`);

OUT('EVENT_BUS_SPEC.md', hdr('Event Bus Specification', '**Path:** `backend/lib/aivos/kernel/eventBus.js` + `runtime/acpValidator.js`\n**See:** AI_RUNTIME_SPEC.md, OBSERVABILITY_SPEC.md\n') + `## 1. Agent Communication Protocol (ACP) v3.0

**Events only** — no agent-to-agent RPC. All communication via Runtime context + Memory + Event Bus.

\`\`\`json
{
  "schemaVersion": "3.0",
  "name": "aivos.pipeline.stage.completed",
  "correlationId": "uuid-runtime-job",
  "traceId": "uuid-trace",
  "contextId": "uuid-context-snapshot",
  "timestamp": "2026-06-27T12:00:00Z",
  "source": { "agentId": "voice-director", "skillId": "resume-voice-script", "runtimeJobId": "uuid" },
  "payload": { "jobId": "uuid", "stage": "voice", "checksum": "sha256..." }
}
\`\`\`

| Field | Required |
|-------|----------|
| schemaVersion | \`"3.0"\` (Constitution) |
| correlationId | Runtime job id |
| traceId | OTel trace — OBSERVABILITY_SPEC |
| contextId | Context snapshot |
| name | Dot-separated |
| source | agentId, skillId, runtimeJobId |
| payload | Schema-validated |

---

## 2. Transport

| Layer | Tech |
|-------|------|
| Publish | Redis \`aivos:events\` |
| Persist | \`aivos_events\` (259) |
| Stream | SSE \`GET /api/aivos/events?job_id=\` |

Extended columns: \`trace_id\`, \`context_id\`, \`schema_version\`.

---

## 3. Event Catalog (selected)

| Event | Emitter |
|-------|---------|
| \`aivos.runtime.job.created\` | Task Runtime |
| \`aivos.policy.resolved\` | Policy Engine |
| \`aivos.prompt.compiled\` | Prompt Compiler |
| \`aivos.pipeline.stage.*\` | Execution Graph |
| \`aivos.kernel.infer.completed\` | Model Router |
| \`aivos.quality.scored\` | Quality Engine |
| \`aivos.approval.required\` | Approval Gate |
| \`aivos.learning.updated\` | Learning Engine |
| \`aivos.governance.versioned\` | Governance |
| \`aivos.marketplace.*\` | Marketplace |

---

## 4. Subscribers

Timeline indexer, analytics (\`user_intent_events\`), FCM, memory agent, cost ledger, learning ingest — **idempotent handlers**.

---

## 5. Rules

1. Publish after DB checkpoint commit
2. No PII in payload
3. Plugins emit via Runtime only
4. SDK: \`aqond.events().subscribe(jobId)\`

---

## 6. Phase Exit

- [ ] schemaVersion 3.0 enforced
- [ ] trace_id on all events
- [ ] TEST_PLAN E01–E03

*See: OBSERVABILITY_SPEC.md, FEEDBACK_LOOP_SPEC.md*
`);

OUT('QUALITY_ENGINE_SPEC.md', hdr('Quality Engine Specification', '**Path:** `backend/lib/aivos/kernel/qualityEngine.js`\n**See:** FEEDBACK_LOOP_SPEC.md, LEARNING_ENGINE_SPEC.md\n') + `## 1. Quality Gates + Learning Input (v3.0)

Quality Engine scores draft artifacts. Outputs feed **Approval Gate**, **Decision Engine** (partial retry), and **Learning Engine** (weight 0.20).

**Loop:** Generate → **Judge** → Publish → Analytics → Learning → Prompt Update

---

## 2. Nine Dimensions (threshold 0.72)

| Dimension | Weight |
|-----------|--------|
| visual_coherence | 0.15 |
| narrative_clarity | 0.15 |
| audio_clarity | 0.12 |
| subtitle_accuracy | 0.10 |
| brand_compliance | 0.12 |
| duration_fit | 0.08 |
| technical_quality | 0.10 |
| content_safety | 0.10 |
| engagement_hook | 0.08 |

**Block publish:** content_safety < 0.5 OR technical_quality < 0.4

Table: \`aivos_quality_scores\`

---

## 3. Partial Retry

Quality returns \`retry_nodes[]\`. **Runtime Decision Engine** schedules re-execution — Quality Engine never invokes pipeline directly.

Max 2 partial retries → \`quality_exhausted\`.

Policy Engine resolves infer for quality_judge task.

Prompt Compiler supplies judge prompt from registry — not plugin.

---

## 4. Learning Integration

Dimension breakdown → \`aivos_learning_signals\` via FEEDBACK_LOOP step 2→5.

Human reject reasons enrich signal payload.

---

## 5. Events (ACP)

\`aivos.quality.scored\`, \`aivos.quality.failed\`, \`aivos.quality.retry\`

---

## 6. API

GET \`/api/aivos/quality/:jobId\` — internal at quality DAG node.

Admin aggregate: dimension trends per plugin (Phase 7).

---

## 7. Rubric Prompt Governance

Quality judge prompts live in **Prompt Registry** (\`quality-judge@v1\`) — compiled by Prompt Compiler, routed by Policy Engine task \`quality_judge\`. Plugins cannot supply rubric text.

---

## 8. Integration Checklist

| Consumer | Integration |
|----------|-------------|
| Approval Gate | Block publish if !passed |
| Decision Engine | Schedule retry_nodes |
| Learning Engine | Ingest dimension breakdown |
| Observability | Span \`aivos.quality.evaluate\` |
| Governance | Pin rubric version per job |

---

## 9. Phase Exit

- [ ] Learning ingest from quality scores
- [ ] Partial retry integration test
- [ ] TEST_PLAN Q01–Q04

*See: EXECUTION_GRAPH_SPEC.md, LEARNING_ENGINE_SPEC.md*
`);

OUT('IMPLEMENTATION_PLAN.md', hdr('AI Video Platform — Implementation Plan', `**Code root:** \`backend/lib/aivos/runtime/\`, \`kernel/\`, \`pipeline/\`, \`sdk/\`
**Migrations:** 259, 260
**Rule:** Design → Review → Implement — **NO code until APPROVED**

`) + `## Phase 0 — Constitution Freeze (current)

| Item | Deliverable |
|------|-------------|
| Specs | 22 mandatory + AI_OS_CONSTITUTION + ARCHITECTURE_READINESS |
| Generator | \`scripts/generate-constitution-specs.mjs\` |
| Reviews | ARCHITECTURE_REVIEW.md — 8 reviews |
| Gate | ARCHITECTURE_READINESS **READY** + human **APPROVED** |

**Status:** Specs generated — pending APPROVED

---

## Phase 1 — AI Runtime Platform (**only after APPROVED**)

| Item | Deliverable |
|------|-------------|
| Runtime scaffold | taskRuntime, policyEngine, promptCompiler, planner |
| Governance | audit trail MVP |
| ACP v3.0 | acpValidator + event persist |
| DB | Migration 259 |
| SDK stub | aqond.runtime() HTTP client |
| Tests | R01–R06, P01–P04, G01–G03 |

**Gate:** Job created → policy decision → prompt compilation logged → ACP event

---

## Phase 2 — AI Kernel + Semantic

| Item | Deliverable |
|------|-------------|
| Kernel | 15 modules; Runtime-only access |
| Memory L7 | pgvector semantic search |
| DB | Migration 260 |
| Tests | K01–K06, M01–M05 |

---

## Phase 3 — Execution Graph + Pipeline Template

| Item | Deliverable |
|------|-------------|
| executionGraph.js | 15-node DAG |
| videoPipelineV1 template | Generic — no resume in template |
| Checkpoints | Resume/retry |
| Tests | P01–P07, C01–C05 |

---

## Phase 4 — Resume Plugin + Marketplace

| Item | Deliverable |
|------|-------------|
| resume-ai adapter | Intent-only; capabilities model |
| Marketplace | install/enable resume-ai + workflow |
| Parity | Legacy vs Runtime |
| Tests | R01–R05 |

---

## Phase 5 — AI Studio Frontend

Mobile + storefront \`/m/studio/\`, SSE, approval UX. Tests F01–F04.

---

## Phase 6 — E2E + Feedback Loop

Full loop test E06. Governance + learning batch. Tests E01–E06, L01–L05.

---

## Phase 7 — Performance + Observability

1000 job design validation, OTel export, Kong routes. Tests PF01–PF02, O01–O05.

---

## Phase 8 — Production

OpenAPI, runbooks, on-call. SDK published.

---

## Dependency Graph

\`\`\`
Phase 0 APPROVED → Phase 1 Runtime → Phase 2 Kernel → Phase 3 Pipeline
                                              ↓
                                    Phase 4 Plugin → Phase 5 Studio
                                              ↓
                                    Phase 6 E2E → Phase 7 Perf → Phase 8 Prod
\`\`\`

**Out of scope:** paymentManager redesign, registrationEvolution refactor.

*See: TEST_PLAN.md, ARCHITECTURE_REVIEW.md, ARCHITECTURE_READINESS.md*
`);

OUT('TEST_PLAN.md', hdr('AI-OS Test Plan', '**Path:** `backend/lib/aivos/__tests__/`\n**Rule:** Tests per phase; no implementation tests until Phase 1 APPROVED\n') + `## Phase 0 — Spec Validation

| ID | Test | Pass criteria |
|----|------|---------------|
| S0-01 | All 24 docs exist | generate-constitution-specs.mjs exit 0 |
| S0-02 | Cross-ref matrix | ARCHITECTURE_READINESS complete |
| S0-03 | Size gate | Each spec ≥2KB except meta checklist |

---

## Phase 1 — Runtime + Policy + Prompt + Governance

| ID | Area | Description |
|----|------|-------------|
| R01 | Task Runtime | submitJob creates runtime_job |
| R02 | Policy | resolve returns audit row; plugin model rejected |
| R03 | Prompt Compiler | raw prompt rejected; hash reproducible |
| R04 | ACP | envelope v3.0 validated |
| R05 | Approval | state machine transitions |
| R06 | SDK | no kernel import in plugin test harness |
| P01–P04 | Policy Engine | rules priority, budget gate, fallback |
| G01–G05 | Governance | audit append, version pin, reproduce diff |

---

## Phase 2 — Kernel + Semantic Memory

| ID | Area |
|----|------|
| K01–K06 | Kernel infer, memory layers, Runtime-only access |
| M01–M05 | Semantic search, Hermes L2 append, pgvector |

---

## Phase 3 — Execution Graph + Discovery

| ID | Area |
|----|------|
| P01–P07 | DAG checkpoint, resume, partial retry |
| C01–C05 | Capability discovery, PDF OCR inject, capability_gap |
| S01–S05 | Skill schema validation, graph resolution |

---

## Phase 4 — Resume Plugin + Marketplace

| ID | Area |
|----|------|
| R01–R05 | Parity vs legacy, intent-only input |
| MK01–MK04 | Install/enable/rollback lifecycle |

---

## Phase 5 — Frontend

F01–F04: AI Studio wizard, SSE, approval UI.

---

## Phase 6 — E2E + Feedback + Learning

| ID | Area |
|----|------|
| E01–E05 | Full pipeline E2E |
| E06 | Feedback loop closed |
| L01–L05 | Learning batch, prompt evolution approve |
| F01–F05 | Feedback loop unit tests |
| Q01–Q04 | Quality → learning ingest |

---

## Phase 7 — Performance + Observability

PF01–PF02: 50 concurrent jobs, p95 latency.
O01–O05: trace API, span correlation, cost dashboard.
SDK01–SDK05: SDK contract tests.

---

## CI

Jest in \`backend/lib/aivos/__tests__/\`. Phase 0: script + markdown lint only.

*See: IMPLEMENTATION_PLAN.md, ARCHITECTURE_REVIEW.md*
`);

OUT('ARCHITECTURE_REVIEW.md', hdr('Architecture Review — Constitution v1.0', '**Scope:** All 22 specs + meta documents\n**Prerequisites:** AI_OS_CONSTITUTION.md, ARCHITECTURE_READINESS.md\n') + `## Review Summary

| # | Review | Status | Blocker for APPROVED? |
|---|--------|--------|------------------------|
| 1 | Architecture Review | **NOT READY** | Yes — pending human sign-off |
| 2 | Gap Analysis | **NOT READY** | Yes — pgvector, image provider |
| 3 | Scalability Review | **READY** (design) | No — horizontal strategy defined |
| 4 | Security Review | **NOT READY** | Yes — prompt injection tests pending |
| 5 | Performance Review | **READY** (design) | No — Phase 7 load test gate |
| 6 | Risk Review | **NOT READY** | Yes — legacy parity risk |
| 7 | Technical Debt Review | **READY** | No — debt catalogued, non-goals set |
| 8 | Future Extension Review | **READY** | No — 100 plugin/model path clear |

**Overall:** **NOT READY** for Phase 1 code — specs complete, human APPROVED required.

---

## 1. Architecture Review

| Check | Result |
|-------|--------|
| 5-layer stack defined | Pass |
| Runtime orchestrates; Kernel infers | Pass |
| Policy Engine owns model routing | Pass |
| Prompt Compiler — no raw plugin prompts | Pass |
| 22 specs cross-referenced | Pass |
| Code paths unified under aivos/ | Pass |

**Action:** Human sign-off on AI_RUNTIME_SPEC + AI_OS_CONSTITUTION.

---

## 2. Gap Analysis

| Gap | Severity | Mitigation |
|-----|----------|------------|
| pgvector on legacy PG | Medium | Staging migration 260 first |
| Image/motion providers | High | Phase 3 mock; Phase 7 router slot |
| OCR prompt in ai-core | Medium | Add ocr-extract@v1 Phase 2 |
| Plugin code signing | Low | Admin-only install Phase 1–4 |
| Cross-DB Hermes | Medium | L2 write legacy PG first |

---

## 3. Scalability Review (100 / 100 / 1000 / 100k)

| Dimension | Target | Design status |
|-----------|--------|---------------|
| Plugins | 100 | Registry + discovery — **READY** |
| Models | 100 | Policy rules table — **READY** |
| Concurrent jobs | 1,000 | Bull + Redis cluster — **READY** |
| Users | 100,000 | Stateless runtime API — **READY** |

No monolithic if/else for plugins. No core rewrite required.

---

## 4. Security Review

| Control | Status |
|---------|--------|
| Plugin → Kernel blocked | Spec **READY**; code pending |
| Prompt injection via intent | Compiler sanitization spec **READY** |
| Policy audit trail | **READY** |
| Marketplace permission scopes | **READY** |
| PII in ACP payloads | Prohibited — **READY** |

**Action:** Security test suite in Phase 1 before prod.

---

## 5. Performance Review

| Area | Target | Phase |
|------|--------|-------|
| Resume job p95 | < 8 min (mock media) | 7 |
| Semantic search p95 | < 200ms | 2 |
| Policy resolve | < 50ms cached | 1 |
| Event SSE | 15s heartbeat | 1 |

Design **READY** — validation in IMPLEMENTATION_PLAN Phase 7.

---

## 6. Risk Review

| Risk | L×I | Mitigation |
|------|-----|------------|
| Legacy resume parity fail | M×H | Feature flag rollback |
| Bad prompt evolution | M×M | Governance approve + rollback |
| Checkpoint corruption | L×H | Immutable checksum |
| Policy misconfiguration | M×H | Admin audit + canary rules |
| Learning drift | M×M | Published-only + rate limits |

---

## 7. Technical Debt Review

| Debt | Handling |
|------|----------|
| Monolith server.js | Single registerAivosRoutes mount |
| Dual API (monolith + Kong) | Kong Phase 7 |
| Resume bypasses Hermes | Runtime writes episodic on analyze |
| Gemini + Ollama split | All Runtime infer → ai-core |

**Non-goals:** paymentManager, registrationEvolution — **do not amplify debt**.

Reuse map ≥80% — **READY**.

---

## 8. Future Extension Review

| Extension | Path |
|-----------|------|
| portfolio-ai plugin | Capabilities + marketplace workflow |
| Cloud model slots | Policy Engine premium rules |
| Multi-tenant brand | Brand DNA + governance per owner |
| Workflow marketplace third-party | Signed packages Phase 8+ |

Architecture supports extension without layer violation — **READY**.

---

## Sign-Off

- [ ] All 8 reviews acknowledged
- [ ] Gaps scheduled or accepted
- [ ] ARCHITECTURE_READINESS **READY**
- [ ] Phase 1 **APPROVED**

**Reviewer:** _______________ **Date:** _______________

*See: ARCHITECTURE_READINESS.md, IMPLEMENTATION_PLAN.md*
`);

// ─── META DOCS (2) ─────────────────────────────────────────────────────────

OUT('AI_OS_CONSTITUTION.md', `# AQOND AI-OS Constitution

**Version:** v${CONSTITUTION}
**Date:** ${DATE}
**Status:** FROZEN — pending human **APPROVED**
**Generator:** \`scripts/generate-constitution-specs.mjs\`

---

## Preamble

This Constitution defines the engineering law of AQOND AI-OS. All AI video and agent workloads MUST comply. Violations block merge and deployment.

---

## Article I — Engineering Philosophy

**Architecture → Spec → Review → Implement → Test → Optimize → Production**

No implementation code until specifications are written, cross-reviewed, and **APPROVED** by architecture sign-off.

---

## Article II — Layer Model

| Layer | Name | Responsibility |
|-------|------|----------------|
| 0 | AQOND CORE | Auth, billing, queues, media, S3, Kong — reuse AUDIT.md |
| 1 | AI Runtime Platform | Orchestration, policy, governance, SDK, marketplace |
| 2 | AI Kernel | **Inference ONLY** — memory, quality, creative merge |
| 3 | Generic Video Pipeline | Execution Graph templates — product-agnostic |
| 4 | Plugin Platform | Intent, capabilities, adapters — no models/prompts |
| 5 | Frontend | AI Studio, BFF, mobile |

**Call direction:** L5 → L4 → L1 → L2/L3 → L0

---

## Article III — Immutable Rules

1. **Plugins never call models.** Runtime Policy Engine routes all inference.
2. **Plugins never supply raw prompts.** Prompt Compiler builds from Registry + Brand DNA + context.
3. **Kernel does not orchestrate.** No DAG execution in Kernel.
4. **Version everything.** Governance audit on all artifacts.
5. **Reuse ≥80%.** Extend auth, billing, queues, ai-core, ffmpeg, S3, Hermes — do not replace.
6. **Do not redesign** \`paymentManager.js\` or \`registrationEvolution/\`.
7. **Event-driven agents.** ACP protocol only — no agent-to-agent RPC.
8. **Checkpoint all workflow nodes.** Pattern from registrationEvolution — no import.
9. **Scale without rewrite:** 100 plugins, 100 models, 1,000 concurrent jobs, 100,000 users.

---

## Article IV — Specification Corpus

22 mandatory specifications + this Constitution + ARCHITECTURE_READINESS.md.

Master index: **AI_RUNTIME_SPEC.md v3.0**

Code paths: \`backend/lib/aivos/runtime/\`, \`kernel/\`, \`pipeline/\`, \`sdk/\`

Migrations: **259** (runtime/kernel), **260** (semantic/learning/governance/marketplace)

---

## Article V — Feedback & Learning

Closed loop: Generate → Judge → Publish → Analytics → Learning → Prompt Update → Next Generation.

Learning modifies prompts and brand only through **Governance approval** (default).

---

## Article VI — Final Objective

A production AI-OS where every AQOND AI product is a **plugin + workflow** on shared Runtime, achieving enterprise governance, observability, and scale **without core architectural rewrite**.

---

## Ratification

- [ ] Constitution v1.0 **APPROVED**
- [ ] ARCHITECTURE_READINESS.md **READY**
- [ ] Phase 1 authorized

**Ratified by:** _______________ **Date:** _______________

---

*See: ARCHITECTURE_READINESS.md, AI_RUNTIME_SPEC.md, AI_VIDEO_PLATFORM_ARCHITECTURE.md*
`);

OUT('ARCHITECTURE_READINESS.md', hdr('Architecture Readiness — Master Checklist', '**Constitution:** v1.0\n**Purpose:** Gate for human **APPROVED** before Phase 1 code\n') + `## Overall Status: **NOT READY**

Specs are generated and cross-referenced. **Blockers:** human sign-off, pgvector staging proof, security test plan execution (Phase 1).

---

## 1. Mandatory Spec Existence (22 + 2 meta)

| # | Document | Required | Generated |
|---|----------|----------|-----------|
| 1 | AI_POLICY_ENGINE_SPEC.md | Yes | ✓ |
| 2 | PROMPT_COMPILER_SPEC.md | Yes | ✓ |
| 3 | GOVERNANCE_SPEC.md | Yes | ✓ |
| 4 | SDK_SPEC.md | Yes | ✓ |
| 5 | WORKFLOW_MARKETPLACE_SPEC.md | Yes | ✓ |
| 6 | OBSERVABILITY_SPEC.md | Yes | ✓ |
| 7 | SEMANTIC_MEMORY_SPEC.md | Yes | ✓ |
| 8 | LEARNING_ENGINE_SPEC.md | Yes | ✓ |
| 9 | FEEDBACK_LOOP_SPEC.md | Yes | ✓ |
| 10 | CAPABILITY_DISCOVERY_SPEC.md | Yes | ✓ |
| 11 | EXECUTION_GRAPH_SPEC.md | Yes | ✓ |
| 12 | SKILL_GRAPH_SPEC.md | Yes | ✓ |
| 13 | AI_RUNTIME_SPEC.md v3.0 | Yes | ✓ |
| 14 | AI_KERNEL_SPEC.md v3.0 | Yes | ✓ |
| 15 | AI_VIDEO_PLATFORM_ARCHITECTURE.md v3.0 | Yes | ✓ |
| 16 | VIDEO_PIPELINE_SPEC.md v3.0 | Yes | ✓ |
| 17 | PLUGIN_SDK.md v3.0 | Yes | ✓ |
| 18 | EVENT_BUS_SPEC.md v3.0 | Yes | ✓ |
| 19 | QUALITY_ENGINE_SPEC.md v3.0 | Yes | ✓ |
| 20 | IMPLEMENTATION_PLAN.md v3.0 | Yes | ✓ |
| 21 | TEST_PLAN.md v3.0 | Yes | ✓ |
| 22 | ARCHITECTURE_REVIEW.md v3.0 | Yes | ✓ |
| 23 | AI_OS_CONSTITUTION.md | Meta | ✓ |
| 24 | ARCHITECTURE_READINESS.md | Meta | ✓ |

---

## 2. Cross-Reference Matrix

| Spec | References |
|------|------------|
| AI_RUNTIME_SPEC | All 21 sub-specs (§Index) |
| AI_KERNEL_SPEC | Policy, Prompt Compiler, Semantic Memory, Skill Graph |
| AI_VIDEO_PLATFORM_ARCHITECTURE | Constitution, Runtime, all layers |
| EXECUTION_GRAPH | Video Pipeline, Capability Discovery, Observability |
| FEEDBACK_LOOP | Quality, Learning, Prompt Compiler, Governance |
| PLUGIN_SDK | SDK, Marketplace, Capability Discovery |
| ARCHITECTURE_REVIEW | Readiness, Implementation Plan, Test Plan |

---

## 3. Reuse Compliance (AUDIT.md)

| Module | Redesign forbidden | Spec compliance |
|--------|-------------------|-----------------|
| paymentManager | Yes | ✓ |
| registrationEvolution | Yes | ✓ pattern only |
| growthEngine | Extend only | ✓ |
| queues.js | Extend only | ✓ |
| ai-core | Extend only | ✓ |
| Hermes | Reuse L2/L3 | ✓ |
| incubationCompose / s3 | Reuse render | ✓ |

---

## 4. Migration Readiness

| Migration | Scope | DDL review |
|-----------|-------|------------|
| 259 | runtime, kernel, workflow, policy, governance audit, events | Pending human |
| 260 | semantic, learning, marketplace, observability spans | Pending pgvector POC |

---

## 5. What Blocks APPROVED

| Blocker | Owner | Resolution |
|---------|-------|------------|
| Human architecture sign-off | Architecture lead | Review + sign AI_OS_CONSTITUTION |
| ARCHITECTURE_REVIEW §1,2,4,6 NOT READY | Engineering | Close gaps or accept risk |
| Migration 259/260 DDL review | DBA | Staging apply |
| Phase 1 scope confirmation | PM + Eng | IMPLEMENTATION_PLAN sign-off |

---

## 6. Ready When

- [ ] All checkboxes in ARCHITECTURE_REVIEW sign-off
- [ ] AI_OS_CONSTITUTION ratified
- [ ] This document status → **READY**
- [ ] IMPLEMENTATION_PLAN Phase 1 explicitly **APPROVED**

---

## 7. Generator

\`\`\`bash
node scripts/generate-constitution-specs.mjs
\`\`\`

Regenerates all 24 files UTF-8 overwrite.

---

*See: AI_OS_CONSTITUTION.md, ARCHITECTURE_REVIEW.md, IMPLEMENTATION_PLAN.md*
`);

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n=== AQOND AI-OS Constitution v1.0 — Spec Generation Complete ===\n');
written.sort((a, b) => a.name.localeCompare(b.name));
let total = 0;
for (const { name, bytes } of written) {
  console.log(`${name.padEnd(42)} ${String(bytes).padStart(6)} bytes`);
  total += bytes;
}
console.log(`${'─'.repeat(50)}`);
console.log(`${'TOTAL'.padEnd(42)} ${String(total).padStart(6)} bytes (${written.length} files)`);
console.log('\nNext: Review ARCHITECTURE_READINESS.md → human APPROVED → Phase 1 Runtime');

