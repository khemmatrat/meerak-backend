#!/usr/bin/env node
/**
 * Runtime Architecture v2.0 — generates 9 spec documents.
 * Run: node scripts/generate-runtime-specs.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATE = '2026-06-27';

const OUT = (name, body) => {
  const p = path.join(ROOT, name);
  fs.writeFileSync(p, body.replace(/\r\n/g, '\n'), 'utf8');
  const size = fs.statSync(p).size;
  console.log(`Wrote ${name} ${size} bytes`);
  return size;
};

// ─── AI_RUNTIME_SPEC.md (~12–18 KB main doc) ───────────────────────────────

OUT('AI_RUNTIME_SPEC.md', `# AI Runtime Specification

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Status:** FROZEN — pending human sign-off before Phase 1 code
**Path:** \`backend/lib/aivos/runtime/\`
**Prerequisites:** AUDIT.md, MODULE_MAP.md, AI_OS_ROADMAP.md, AI_VIDEO_PLATFORM_ARCHITECTURE.md v2.0

---

## Executive Summary

The **AI Runtime** is the orchestration layer between AQOND Core (auth, billing, queues, media) and the AI Kernel (inference, memory, quality). Plugins never invoke the Kernel or pipeline directly. They declare **capabilities and skills**; the Runtime composes an **Execution Graph** (DAG), schedules **Skill Graph** nodes via the Kernel, manages **Semantic Memory**, enforces **Human Approval** gates, feeds the **Learning Engine**, and exposes **Observability** and **Cost** telemetry.

**Stack (v2.0):** AQOND CORE → **AI Runtime** → AI Kernel → Video Pipeline → Plugin Layer → Frontend

**Code root:** \`backend/lib/aivos/runtime/\`
**Migrations:** \`259_ai_video_platform.sql\` (runtime + kernel), \`260_ai_runtime_semantic.sql\` (semantic, learning, marketplace)

**Reuse map (existing AQOND modules — do not redesign):**

| Existing module | Path | Runtime role |
|-----------------|------|--------------|
| ai-core | \`aqond-v2/infra/ai-core/\` | Kernel Model Router inference target |
| Bull queues | \`backend/lib/queues.js\` | \`aivos-video-pipeline\`, \`aivos-runtime-jobs\` |
| Hermes memory | \`hermes_episodic_memory\`, \`hermes_procedural_rules\` | Memory API L2–L3 |
| Checkpoints | \`registrationEvolution/workflowCheckpointRuntime.js\` | **Pattern copy** for DAG resume (no import) |
| Billing | \`growthEngine.js\`, \`growth_entitlements\` | Credit gate + marketplace metering |
| FCM | \`fcmService.js\` | Approval + completion notifications |
| Inference audit | \`ai.inference_log\` | Cost dashboard + observability sink |
| Media compose | \`incubationCompose.js\`, \`s3-client.js\` | Render stage artifacts |
| Resume legacy | \`talentResumeService.js\`, \`talentVideoService.js\` | resume-ai plugin adapter |

---

## §1 Task Runtime

The Task Runtime is the entry point for every AI job. Flow:

\`\`\`
Runtime → Planner → Skill Graph → Execution Graph → Context → Memory → Router → Model
\`\`\`

| Component | Module | Responsibility |
|-----------|--------|----------------|
| **Runtime** | \`runtime/taskRuntime.js\` | Accept job requests; lifecycle; approval gates |
| **Planner** | \`runtime/planner.js\` | Decompose plugin intent → skill DAG + execution DAG |
| **Skill Graph** | \`runtime/skillGraph.js\` | Resolve registered skills → agent bindings |
| **Execution Graph** | \`runtime/executionGraph.js\` | Materialize pipeline DAG; checkpoint edges |
| **Context** | \`runtime/contextManager.js\` | Job-scoped context bus; merges plugin + brand + working |
| **Memory** | Kernel \`memoryApi.js\` (invoked by Runtime) | 7-layer semantic memory (§5) |
| **Router** | Kernel \`modelRouter.js\` | Task type → model; Runtime never names models |
| **Model** | ai-core Ollama / config-only cloud | Inference execution |

**Invocation rule:** Plugins call \`POST /api/aivos/runtime/jobs\`. Runtime calls \`kernel.infer()\`, \`kernel.memory.*\`, \`kernel.quality.*\` — plugins **never** import Kernel directly.

**Tables (migration 259):**

| Table | Purpose |
|-------|---------|
| \`aivos_runtime_jobs\` | Top-level runtime job (links workflow + context) |
| \`aivos_runtime_plans\` | Planner output: skill + execution graph JSON |
| \`aivos_context_snapshots\` | Context hash per stage (reuse from v1) |
| \`aivos_workflow_jobs\` | Execution graph instance |
| \`aivos_workflow_checkpoints\` | Per-node checkpoint payloads |

\`\`\`javascript
// Pseudocode — no implementation until APPROVED
async function submitJob(pluginId, intent, raw, ctx) {
  const plan = await planner.compose(pluginId, intent, await capabilityDiscovery.list());
  const runtimeJob = await taskRuntime.create({ pluginId, plan, ownerId: ctx.userId });
  await executionGraph.instantiate(runtimeJob.id, plan.executionGraph);
  await queues.add('aivos-runtime-jobs', { runtimeJobId: runtimeJob.id });
  return { runtime_job_id: runtimeJob.id, status: 'queued' };
}
\`\`\`

---

## §2 Execution Graph

The Execution Graph is a **full DAG** of video production nodes. Each node is checkpointed, resumable, and independently retriable. The Video Pipeline (VIDEO_PIPELINE_SPEC.md) is a **template** instantiated by Runtime.

### DAG nodes (15 stages)

| Node ID | Agent / Skill | Checkpoint key | Retry policy |
|---------|---------------|----------------|--------------|
| \`ocr\` | ocr-extractor | \`ocr.json\` | 3× exponential; skip if text provided |
| \`extract\` | resume-analyzer | \`extract.json\` | 2×; fallback rule-based extract |
| \`normalize\` | data-normalizer | \`normalize.json\` | 2× |
| \`analyze\` | resume-analyzer | \`analysis.json\` | 2× |
| \`story\` | story-planner | \`plan.json\` | 2× |
| \`creative\` | creative-director | \`style_manifest.json\` | 1×; human gate optional |
| \`prompt\` | prompt-generator | \`prompts.json\` | 2× |
| \`image\` | image-director | \`images/\` | 2× per scene |
| \`motion\` | animation-director | \`clips/\` | 2× |
| \`voice\` | voice-director | \`voice.wav\` | 3×; reuse talentVideoService TTS |
| \`subtitle\` | subtitle-director | \`subs.ass\` | 2× |
| \`music\` | music-selector | \`music.mp3\` | 1× |
| \`render\` | ffmpeg (incubationCompose) | \`draft.mp4\` | 2× |
| \`quality\` | quality-judge | \`quality.json\` | partial retry via Decision Engine |
| \`publish\` | publishing-agent | \`published_url\` | 1×; blocked until approval |

**Edges:** \`ocr → extract → normalize → analyze → story → creative → prompt → image → motion → voice → subtitle → music → render → quality → publish\`

**Parallelism:** \`image\` and \`voice\` may run in parallel after \`prompt\` / \`story\` respectively (Runtime Planner sets parallel groups).

**Checkpoint semantics:** Copied from \`registrationEvolution/workflowCheckpointRuntime.js\` — immutable append-only rows in \`aivos_workflow_checkpoints\`, SHA-256 checksum, resume from last completed node.

**Retry API:** \`POST /api/video/jobs/:id/retry?nodes=voice,subtitle\` — Runtime Decision Engine validates against quality feedback.

---

## §3 Skill Graph

**Agents** are long-lived identities (registry rows). **Skills** are executable units bound to agents. Runtime resolves skills; Kernel executes them.

| Concept | Storage | Owner |
|---------|---------|-------|
| Agent | \`aivos_agent_registry\` | Kernel Agent Registry |
| Skill | \`aivos_skill_registry\` (259) | Kernel Skill Registry |
| Binding | \`agent_id → skill_ids[]\` | Plugin declares required skills |

**Separation:**

- **Agent** = persona + default model task + permissions
- **Skill** = JSON schema in/out + prompt_id + stage affinity

**Registration / discovery:**

\`\`\`javascript
skillRegistry.register({
  id: 'resume-extract-profile',
  agentId: 'resume-analyzer',
  stageAffinity: ['extract', 'analyze'],
  inputSchema: { type: 'object', ... },
  outputSchema: { type: 'object', ... },
  promptId: 'talent-resume-draft@v2'
});
\`\`\`

**Resume Agent example skills:**

| Skill ID | Agent | Stage | Reuses |
|----------|-------|-------|--------|
| \`resume-extract-profile\` | resume-analyzer | extract, analyze | \`generateTalentResumeDraft\` |
| \`resume-story-beats\` | story-planner | story | ai-core planning prompt |
| \`resume-voice-script\` | voice-director | voice | \`talentVideoService\` |
| \`resume-publish-profile\` | publishing-agent | publish | \`publishTalentResume\` |

Plugins register **skill requirements** in \`aivos_plugin_registry.required_skills\` JSONB — not hardcoded stage lists.

---

## §4 Capability Discovery

The Kernel **auto-composes** workflow from installed plugin capabilities + enabled marketplace skills.

**Algorithm (design):**

1. Load plugin \`capabilities[]\` from registry (e.g. \`video.generate\`, \`ocr.pdf\`, \`voice.tts\`)
2. Query \`aivos_skill_registry\` for skills matching capabilities
3. Filter by marketplace \`enabled\` + permission + billing entitlement
4. Planner builds minimal DAG covering intent → output artifact type
5. If skill missing → fail fast with \`capability_gap\` event (ACP §13)

**Module:** \`runtime/capabilityDiscovery.js\`

**No plugin hardcoding:** resume-ai declares \`capabilities: ['video.talent_intro', 'ocr.optional']\`; Runtime adds OCR node only when PDF input detected.

---

## §5 Semantic Memory (7 layers)

| Layer | Name | Storage | Embeddings | TTL |
|-------|------|---------|------------|-----|
| L1 | **Working** | Redis \`aivos:wm:{jobId}\` | — | 24h |
| L2 | **Episode** | \`commerce.hermes_episodic_memory\` | optional pgvector | permanent |
| L3 | **Procedural** | \`commerce.hermes_procedural_rules\` | — | permanent |
| L4 | **Brand** | \`aivos_brand_dna\` | brand embedding col (260) | permanent |
| L5 | **Plugin** | \`aivos_context_snapshots\` | — | job lifetime |
| L6 | **Artifact** | S3 + \`aivos_video_timeline\` | clip embedding (260) | permanent |
| L7 | **Semantic** | \`aivos_semantic_memory\` (260) | pgvector \`embedding vector(768)\` | permanent |

**Semantic layer (new — migration 260):**

| Column | Type |
|--------|------|
| \`id\` | UUID PK |
| \`owner_id\` | UUID |
| \`namespace\` | TEXT (plugin_id or global) |
| \`key\` | TEXT |
| \`content\` | JSONB |
| \`embedding\` | vector(768) |
| \`source_job_id\` | UUID NULL |
| \`created_at\` | TIMESTAMPTZ |

**API (Kernel, called by Runtime):**

\`\`\`javascript
memory.semantic.search(ownerId, queryEmbedding, { limit, namespace })
memory.semantic.upsert(ownerId, key, content, embedding)
\`\`\`

Embedding model: Kernel task \`embedding\` → nomic-embed-text via Model Router. Learning Engine writes prompt/brand adjustments back to L4/L7.

---

## §6 Creative Runtime

Creative decisions are **not** delegated to plugins. **Creative Runtime** (\`runtime/creativeRuntime.js\`) orchestrates sub-directors under Kernel Creative Director authority.

| Director | Module | Output |
|----------|--------|--------|
| **Story Director** | \`creative/storyDirector.js\` | Scene beats, narrative arc |
| **Visual Director** | \`creative/visualDirector.js\` | Palette, composition rules |
| **Motion Director** | \`creative/motionDirector.js\` | Transitions, Ken Burns params |
| **Voice Director** | \`creative/voiceDirector.js\` | Tone, pace, character |
| **Brand Director** | \`creative/brandDirector.js\` | Brand DNA enforcement |

**Flow:** Runtime invokes \`creativeRuntime.produce(manifestInputs)\` → Kernel \`creativeDirector.js\` merges sub-director outputs → authoritative \`style_manifest.json\`.

Plugins supply **intent + raw data** only. Override attempts are rejected at validation.

---

## §7 Learning Engine

**Module:** \`runtime/learningEngine.js\`
**Tables (260):** \`aivos_learning_signals\`, \`aivos_prompt_evolution\`

| Signal | Source | Weight | Action |
|--------|--------|--------|--------|
| CTR | feed analytics | 0.20 | Adjust hook prompts |
| Watch time | video player events | 0.25 | Duration/scene pacing |
| Completion rate | player | 0.20 | Story beat count |
| Likes / shares | social graph | 0.15 | Engagement tone |
| Quality feedback | Quality Engine + human reject | 0.20 | Creative + brand DNA |

**Outputs:** Updated \`aivos_prompt_registry\` versions, \`aivos_brand_dna\` suggestions (human approve), \`aivos_semantic_memory\` entries.

**Batch job:** Bull queue \`aivos-learning-batch\` (nightly); does not block pipeline.

---

## §8 Feedback Loop

\`\`\`
Generate → Judge → Publish → Analytics → Learning → Prompt Update
\`\`\`

| Step | Component | Event |
|------|-----------|-------|
| Generate | Execution Graph | \`aivos.pipeline.completed\` |
| Judge | Quality Engine | \`aivos.quality.scored\` |
| Publish | publishing-agent + Human Approval | \`aivos.publish.completed\` |
| Analytics | analytics-agent, \`user_intent_events\` | \`aivos.analytics.ingested\` |
| Learning | Learning Engine | \`aivos.learning.updated\` |
| Prompt Update | Prompt Registry | \`aivos.prompt.versioned\` |

Closed loop requires **published** jobs only; drafts excluded from learning to avoid bias.

---

## §9 Human Approval

**Module:** \`runtime/approvalGate.js\`
**Table (259):** \`aivos_approval_requests\`

| State | Description | Next states |
|-------|-------------|-------------|
| \`draft\` | Job complete, awaiting preview | preview |
| \`preview\` | User viewing draft MP4 | approve, reject, reprompt |
| \`approve\` | Human signed off | publish, auto_publish |
| \`reject\` | User rejected | reprompt, cancel |
| \`reprompt\` | User edited intent | replan from story node |
| \`publish\` | Publishing in progress | — |
| \`auto_publish\` | Plugin policy skips gate | publish (quality must pass) |

**Gates:** Default gate after \`quality\` node; optional gate after \`creative\` for enterprise brand plugins.

**Notifications:** \`fcmService.js\` on \`approval.required\`.

**API:**

| Method | Path |
|--------|------|
| GET | \`/api/aivos/runtime/jobs/:id/approval\` |
| POST | \`/api/aivos/runtime/jobs/:id/approve\` |
| POST | \`/api/aivos/runtime/jobs/:id/reject\` |
| POST | \`/api/aivos/runtime/jobs/:id/reprompt\` |

---

## §10 AI Marketplace

**Module:** \`runtime/marketplace.js\`
**Tables (260):** \`aivos_marketplace_plugins\`, \`aivos_marketplace_versions\`, \`aivos_plugin_permissions\`

| Operation | Description |
|-----------|-------------|
| **Install** | Record version; dependency check |
| **Enable** | Set \`enabled=true\`; register skills |
| **Disable** | Stop new jobs; in-flight completes |
| **Version** | Semver; pin or float |
| **Permission** | OAuth-style scopes per plugin |
| **Billing** | \`growthEngine\` credit multiplier per plugin |
| **Dependency** | Plugin requires other plugins/skills |
| **Lifecycle** | See §14 Plugin Lifecycle |

**Does not replace:** \`paymentManager.js\`, wallet, PaySo — marketplace debits via existing \`growth_entitlements\`.

---

## §11 AI Cost Dashboard

**Module:** \`runtime/costDashboard.js\`
**Tables (259/260):** \`aivos_cost_ledger\`, aggregates from \`ai.inference_log\`

| Dimension | Metrics |
|-----------|---------|
| Model | tokens, calls, latency p50/p95 |
| Job | credits, wall time, stage breakdown |
| Plugin | jobs/day, avg cost |
| User | monthly spend, quota headroom |
| Infra | CPU, GPU queue depth, Redis memory |

**Sources:** \`ai.inference_log\`, Bull queue stats, \`aivos_cost_ledger\` (written on each \`kernel.infer\`).

**API:** \`GET /api/aivos/runtime/cost?scope=user|plugin|job&id=\`

Admin-only aggregate endpoints reuse nexus-admin auth pattern.

---

## §12 Observability

| Signal | Implementation | Reuse |
|--------|----------------|-------|
| **Telemetry** | OpenTelemetry spans on Runtime → Kernel | New export; log to Winston |
| **Tracing** | \`traceId\` per job (ACP §13) | Correlate inference_log |
| **Metrics** | Prometheus counters: jobs, stage latency | Optional Phase 7 |
| **Logs** | Structured JSON; \`runtime_job_id\` | \`logger.js\` |
| **Workflow timeline** | \`aivos_video_timeline\` | Existing table |
| **AI timeline** | \`aivos_events\` + SSE | EVENT_BUS_SPEC.md |

**Dashboard views:** Job drill-down (stages), AI call drill-down (model, tokens), approval history.

---

## §13 Agent Communication Protocol (ACP)

**Events only** — no direct agent-to-agent RPC. All inter-agent data flows through Runtime context + Memory + Event Bus.

### Envelope (JSON)

\`\`\`json
{
  "schemaVersion": "2.0",
  "name": "aivos.pipeline.stage.completed",
  "correlationId": "uuid-runtime-job",
  "traceId": "uuid-trace",
  "contextId": "uuid-context-snapshot",
  "timestamp": "2026-06-27T12:00:00Z",
  "source": { "agentId": "voice-director", "skillId": "resume-voice-script" },
  "payload": { "jobId": "uuid", "stage": "voice", "checksum": "sha256..." }
}
\`\`\`

| Field | Required | Purpose |
|-------|----------|---------|
| \`schemaVersion\` | yes | ACP compatibility |
| \`correlationId\` | yes | Runtime job id |
| \`traceId\` | yes | Distributed trace |
| \`contextId\` | yes | Context snapshot hash |
| \`name\` | yes | Event name (dot-separated) |
| \`payload\` | yes | Schema-validated body |

**Validation:** \`runtime/acpValidator.js\` rejects malformed events before Redis publish.

**Storage:** \`aivos_events\` (259) — extend columns: \`trace_id\`, \`context_id\`, \`schema_version\`.

See EVENT_BUS_SPEC.md v2.0 for transport details.

---

## §14 Plugin Lifecycle

\`\`\`
Install → Register → Load → Run → Suspend → Resume → Upgrade → Rollback → Uninstall
\`\`\`

| Phase | Runtime action |
|-------|----------------|
| Install | Insert marketplace row; verify signature (future) |
| Register | Upsert \`aivos_plugin_registry\`; index skills |
| Load | \`registerAivosRoutes\` calls \`plugin.registerRoutes\` |
| Run | Accept jobs if \`enabled\` |
| Suspend | \`enabled=false\`; drain queue |
| Resume | Re-enable; capability discovery refresh |
| Upgrade | Atomic version swap; migration hook |
| Rollback | Pin previous version from \`aivos_marketplace_versions\` |
| Uninstall | Disable; archive jobs; optional data retention policy |

**Out of scope:** Changing \`registrationEvolution\` signup workflow lifecycle.

---

## §15 Architecture Validation

Target scale **without core architecture change** (horizontal scale only):

| Dimension | Target | Strategy |
|-----------|--------|----------|
| Plugins | 100 | Registry + capability discovery; no monolith if/else |
| Models | 100 | Model Router table-driven; ai-core plugin slots |
| Concurrent jobs | 1,000 | Bull workers × N; Redis cluster |
| Users | 100,000 | Stateless Runtime API; PG read replicas |

**Validation checklist (pre-Phase 1 code):**

- [ ] No plugin imports \`kernel/*\` directly
- [ ] All inference via Runtime → Kernel
- [ ] DAG nodes independently checkpointed
- [ ] ACP envelope on every event
- [ ] Migration 259/260 reviewed
- [ ] Reuse map audited against AUDIT.md

**Load test gate (Phase 7):** 50 concurrent resume jobs, p95 < 8 min with mocked image/motion.

---

## Database Summary

### Migration 259 (\`259_ai_video_platform.sql\`)

| Table | Section |
|-------|---------|
| \`aivos_runtime_jobs\` | §1 |
| \`aivos_runtime_plans\` | §1 |
| \`aivos_plugin_registry\` | §3, §10 |
| \`aivos_agent_registry\` | §3 |
| \`aivos_skill_registry\` | §3 |
| \`aivos_prompt_registry\` | §7, §8 |
| \`aivos_brand_dna\` | §5, §6 |
| \`aivos_workflow_jobs\` | §2 |
| \`aivos_workflow_checkpoints\` | §2 |
| \`aivos_quality_scores\` | §8 |
| \`aivos_events\` | §12, §13 |
| \`aivos_video_timeline\` | §2, §12 |
| \`aivos_context_snapshots\` | §1, §5 |
| \`aivos_approval_requests\` | §9 |
| \`aivos_cost_ledger\` | §11 |

### Migration 260 (\`260_ai_runtime_semantic.sql\`)

| Table | Section |
|-------|---------|
| \`aivos_semantic_memory\` | §5 |
| \`aivos_learning_signals\` | §7 |
| \`aivos_prompt_evolution\` | §7, §8 |
| \`aivos_marketplace_plugins\` | §10 |
| \`aivos_marketplace_versions\` | §10, §14 |
| \`aivos_plugin_permissions\` | §10 |

---

## API Surface (Runtime)

| Method | Path | Phase |
|--------|------|-------|
| POST | \`/api/aivos/runtime/jobs\` | 1 |
| GET | \`/api/aivos/runtime/jobs/:id\` | 1 |
| GET | \`/api/aivos/runtime/jobs/:id/plan\` | 1 |
| POST | \`/api/aivos/runtime/jobs/:id/approve\` | 1 |
| GET | \`/api/aivos/runtime/cost\` | 2 |
| GET | \`/api/aivos/marketplace/plugins\` | 2 |

Legacy \`/api/video/jobs\` routes proxy to Runtime in Phase 2.

---

## Human Sign-Off

- [ ] AI Runtime spec (this document) approved
- [ ] Migration 259 + 260 schema approved
- [ ] ACP envelope v2.0 approved
- [ ] Phase 1 scope approved

**Approved by:** _______________ **Date:** _______________

---

*See also: AI_KERNEL_SPEC.md v2.0, VIDEO_PIPELINE_SPEC.md v2.0, EVENT_BUS_SPEC.md v2.0, ARCHITECTURE_REVIEW.md*
`);

// ─── AI_KERNEL_SPEC.md v2.0 ───────────────────────────────────────────────

OUT('AI_KERNEL_SPEC.md', `# AI Kernel Specification

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Path:** \`backend/lib/aivos/kernel/\`
**Status:** FROZEN — pending human sign-off
**Parent:** AI Runtime invokes Kernel — plugins **never** call Kernel directly
**See:** AI_RUNTIME_SPEC.md

---

## 1. Purpose (v2.0 change)

The AI Kernel is the **inference and intelligence sub-plane** invoked exclusively by **AI Runtime** (\`backend/lib/aivos/runtime/\`). It is not mounted for direct plugin access.

| Caller | Allowed APIs |
|--------|--------------|
| AI Runtime | \`kernel.infer\`, \`kernel.memory.*\`, \`kernel.quality.*\`, \`kernel.creative.*\`, \`eventBus.publish\` |
| Plugins | **None** — use Runtime HTTP APIs only |
| Pipeline stages | **None** — stages execute as Runtime DAG nodes calling Kernel via Runtime executor |

**Factory:** \`createKernel(deps)\` — deps injected by \`createRuntime(deps)\` which passes \`{ pool, redis, aiCoreUrl, logger }\`.

---

## 2. Runtime Integration Points

| Runtime module | Kernel module | Call pattern |
|----------------|---------------|--------------|
| \`taskRuntime.js\` | \`checkpointManager.js\` | Save/load context snapshots |
| \`planner.js\` | \`taskPlanner.js\`, \`skillRegistry.js\` | Resolve skills → tasks |
| \`executionGraph.js\` | \`agentRegistry.js\`, \`modelRouter.js\` | Execute node → infer |
| \`creativeRuntime.js\` | \`creativeDirector.js\`, \`brandDna.js\` | Style manifest |
| \`capabilityDiscovery.js\` | \`skillRegistry.js\` | List enabled skills |
| \`approvalGate.js\` | \`qualityEngine.js\` | Pre-approval quality gate |
| \`learningEngine.js\` | \`promptRegistry.js\`, \`memoryApi.js\` | Prompt evolution, semantic upsert |
| \`costDashboard.js\` | \`modelRouter.js\` (hooks) | Token/credit ledger |

\`\`\`javascript
// Runtime owns the lifecycle — Kernel is stateless per call
const kernel = createKernel(deps);
const runtime = createRuntime({ ...deps, kernel });
// server.js: registerAivosRoutes(app, { runtime, kernel: runtime.kernel });
\`\`\`

---

## 3. Kernel Modules (15)

| # | Module | File | Responsibility |
|---|--------|------|----------------|
| 1 | Model Router | \`modelRouter.js\` | Task → model; logs \`ai.inference_log\` |
| 2 | Context Bus | \`contextBus.js\` | In-process pub/sub (Kernel internal only) |
| 3 | Memory API | \`memoryApi.js\` | **7 layers** incl. Semantic (L7) |
| 4 | Prompt Registry | \`promptRegistry.js\` | Versioned prompts; wraps ai-core/lib/prompts |
| 5 | Task Planner | \`taskPlanner.js\` | Skill task DAG (called by Runtime planner) |
| 6 | Agent Registry | \`agentRegistry.js\` | \`aivos_agent_registry\` |
| 7 | Skill Registry | \`skillRegistry.js\` | \`aivos_skill_registry\` |
| 8 | Decision Engine | \`decisionEngine.js\` | Partial retry routing (Quality input) |
| 9 | Event Bus | \`eventBus.js\` | ACP envelope publish — see EVENT_BUS_SPEC.md |
| 10 | Quality Engine | \`qualityEngine.js\` | Rubric scoring — see QUALITY_ENGINE_SPEC.md |
| 11 | Creative Director | \`creativeDirector.js\` | **Delegates to Creative Runtime sub-directors** |
| 12 | Brand DNA | \`brandDna.js\` | \`aivos_brand_dna\` CRUD |
| 13 | Cost Optimizer | \`costOptimizer.js\` | Token/credit budget |
| 14 | Retry Manager | \`retryManager.js\` | Backoff; ai-core 429 |
| 15 | Checkpoint Manager | \`checkpointManager.js\` | Kernel context snapshots |

---

## 4. Creative Director → Creative Runtime (v2.0)

Creative Director no longer monolithically generates style. Runtime **Creative Runtime** (\`runtime/creativeRuntime.js\`) calls sub-directors, then Kernel \`creativeDirector.js\` **merges and authorizes** the manifest:

\`\`\`
Story Director ──┐
Visual Director ─┼→ creativeDirector.merge() → style_manifest.json
Motion Director ─┤
Voice Director ──┤
Brand Director ──┘
\`\`\`

Plugins cannot override merged manifest. Brand Director reads \`aivos_brand_dna\` + semantic search (L7).

---

## 5. Memory API — 7 Layers (v2.0)

| Layer | Name | Storage |
|-------|------|---------|
| L1 | Working | Redis \`aivos:wm:{jobId}\` |
| L2 | Episode | \`commerce.hermes_episodic_memory\` |
| L3 | Procedural | \`commerce.hermes_procedural_rules\` |
| L4 | Brand | \`aivos_brand_dna\` |
| L5 | Plugin | \`aivos_context_snapshots\` |
| L6 | Artifact | S3 + \`aivos_video_timeline\` |
| L7 | **Semantic** | \`aivos_semantic_memory\` (migration 260, pgvector) |

\`\`\`javascript
memory.get(jobId, layer, key)
memory.set(jobId, layer, key, value, { ttlSec })
memory.semantic.search(ownerId, query, { limit, namespace })  // NEW v2.0
memory.semantic.upsert(ownerId, key, content, embedding)       // NEW v2.0
memory.appendEpisode(userId, { type, payload })
memory.getBrandDna(ownerId)
\`\`\`

---

## 6. Model Router (unchanged task map)

| Task type | Primary model | Fallback |
|-----------|---------------|----------|
| \`reasoning\` | hermes3:3b | rule-based |
| \`writing\` | qwen2.5:7b-instruct | rule-based prose |
| \`vision\` | moondream | skip step |
| \`structured_json\` | qwen2.5:7b-instruct | schema reject + retry |
| \`quality_judge\` | hermes3:3b | weighted heuristic |
| \`embedding\` | nomic-embed-text | keyword hash |

**Inference:** Runtime POST → Kernel \`infer()\` → \`\${AI_CORE_URL}/v1/chat\`. Logged to \`ai.inference_log\` with \`metadata.runtime_job_id\`.

---

## 7. Phase Exit (shifted — Runtime Phase 1)

Kernel MVP ships **with** Runtime Phase 1, not standalone:

- [ ] \`createKernel()\` callable only from \`createRuntime()\`
- [ ] Memory L1–L3 + L7 read path
- [ ] Model Router → ai-core integration test
- [ ] ACP events emitted on infer complete
- [ ] Migration 259 applied

---

*See: AI_RUNTIME_SPEC.md, EVENT_BUS_SPEC.md, QUALITY_ENGINE_SPEC.md*
`);

// ─── VIDEO_PIPELINE_SPEC.md v2.0 ──────────────────────────────────────────

OUT('VIDEO_PIPELINE_SPEC.md', `# Video Pipeline Specification

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Path:** \`backend/lib/aivos/pipeline/\`
**Status:** FROZEN
**Parent:** Pipeline is an **Execution Graph template** instantiated by AI Runtime
**See:** AI_RUNTIME_SPEC.md §2, §9

---

## 1. Pipeline as Execution Graph Template (v2.0)

The Video Pipeline is **not** invoked directly by plugins. AI Runtime:

1. Loads plugin capabilities via Capability Discovery
2. Instantiates \`video-pipeline-v1\` template DAG (or subset)
3. Maps template nodes → Execution Graph nodes (§2 AI_RUNTIME_SPEC)
4. Runs DAG via \`executionGraph.js\` with checkpoint/retry semantics

\`\`\`
Plugin → Runtime.submitJob() → Planner → Execution Graph (this template) → Kernel per node
\`\`\`

**Path:** \`backend/lib/aivos/pipeline/templates/videoPipelineV1.js\` exports node definitions only — no standalone runner.

---

## 2. Stage → DAG Node Map

| Pipeline stage (v1) | Execution Graph node | Human gate |
|---------------------|----------------------|------------|
| input | (Runtime pre-stage) | — |
| ocr (new) | ocr | — |
| analyze | extract + normalize + analyze | — |
| planning | story | — |
| storyboard | story (merged) | — |
| creative_direction | creative | optional |
| prompt_generation | prompt | — |
| image_generation | image | — |
| animation_generation | motion | — |
| voice_generation | voice | — |
| subtitle_generation | subtitle | — |
| music | music | — |
| render | render | — |
| quality_check | quality | — |
| publish | publish | **required** unless auto_publish |

---

## 3. Stage Graph (15 nodes)

| # | Node ID | Agent | Output artifact |
|---|---------|-------|-----------------|
| 1 | ocr | ocr-extractor | \`ocr.json\` |
| 2 | extract | resume-analyzer | \`extract.json\` |
| 3 | normalize | data-normalizer | \`normalize.json\` |
| 4 | analyze | resume-analyzer | \`analysis.json\` |
| 5 | story | story-planner | \`plan.json\` |
| 6 | creative | creative-director | \`style_manifest.json\` |
| 7 | prompt | prompt-generator | \`prompts.json\` |
| 8 | image | image-director | \`images/\` |
| 9 | motion | animation-director | \`clips/\` |
| 10 | voice | voice-director | \`voice.wav\` |
| 11 | subtitle | subtitle-director | \`subs.ass\` |
| 12 | music | music-selector | \`music.mp3\` |
| 13 | render | ffmpeg | \`draft.mp4\` |
| 14 | quality | quality-judge | \`quality.json\` |
| 15 | publish | publishing-agent | \`published_url\` |

Stages 8–9 may be mocked in Phase 3. Stage 13 **must** produce real MP4 via \`incubationCompose.js\`.

---

## 4. Human Approval Gates (v2.0)

| Gate | After node | Default |
|------|------------|---------|
| \`creative_review\` | creative | off |
| \`draft_review\` | quality | **on** |
| \`publish_confirm\` | approve action | on |

Runtime \`approvalGate.js\` pauses Execution Graph until state transitions. SSE events: \`aivos.approval.required\`, \`aivos.approval.approved\`.

---

## 5. Checkpoint & Resume

Identical semantics to AI_RUNTIME_SPEC §2 — persisted in \`aivos_workflow_checkpoints\`. Pattern from \`registrationEvolution/workflowCheckpointRuntime.js\` (hash + immutable, **no import**).

\`\`\`javascript
// Executed by Runtime executionGraph.js — not pipeline module
async function runNode(jobId, nodeId) {
  if (await hasCheckpoint(jobId, nodeId)) return;
  await runtime.emitACP('aivos.pipeline.stage.started', { jobId, stage: nodeId });
  const output = await runtime.executeNode(jobId, nodeId); // calls Kernel
  await insertCheckpoint(jobId, nodeId, output);
  await runtime.emitACP('aivos.pipeline.stage.completed', { jobId, stage: nodeId });
}
\`\`\`

**Retry:** \`POST /api/video/jobs/:id/retry?nodes=voice,subtitle\` — Runtime Decision Engine + Quality Engine mapping.

---

## 6. Database (migration 259)

Tables unchanged from v1: \`aivos_workflow_jobs\`, \`aivos_workflow_checkpoints\`, \`aivos_video_timeline\`. Added link:

| Column | Table | Notes |
|--------|-------|-------|
| \`runtime_job_id\` | \`aivos_workflow_jobs\` | FK → \`aivos_runtime_jobs\` |

---

## 7. Reuse Map

| Node(s) | Existing module |
|---------|-----------------|
| extract, analyze | \`talentResumeService.generateTalentResumeDraft\` |
| voice | \`talentVideoService\` AI Studio TTS |
| render | \`incubationCompose.composeIncubationOverlay\` |
| publish | \`publishTalentResume\` |
| credit gate | \`growthEngine.getTalentVideoEntitlement\` |
| queue | \`queues.js\` → \`aivos-runtime-jobs\` processor |

---

## 8. HTTP API (proxied via Runtime)

| Method | Path | Notes |
|--------|------|-------|
| POST | \`/api/video/jobs\` | Proxies to \`/api/aivos/runtime/jobs\` Phase 2+ |
| GET | \`/api/video/jobs/:id\` | Includes approval state |
| POST | \`/api/video/jobs/:id/retry\` | Partial node retry |
| POST | \`/api/video/jobs/:id/publish\` | Requires approval + quality pass |

---

## 9. Phase Exit (Phase 3 in IMPLEMENTATION_PLAN v2.0)

- [ ] Template instantiated by Runtime for resume-ai
- [ ] All 15 nodes registered; image/motion mocked OK
- [ ] Human approval gate functional
- [ ] Checkpoint resume after worker kill

---

*See: AI_RUNTIME_SPEC.md, PLUGIN_SDK.md, QUALITY_ENGINE_SPEC.md*
`);

// ─── PLUGIN_SDK.md v2.0 ───────────────────────────────────────────────────

OUT('PLUGIN_SDK.md', `# Plugin SDK Specification

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Path:** \`backend/lib/aivos/plugins/\`
**Status:** FROZEN
**See:** AI_RUNTIME_SPEC.md §3, §4, §10, §14

---

## 1. v2.0 Principle: Capabilities, Not Stages

Plugins declare **capabilities and skills** — not hardcoded pipeline stages. Runtime Capability Discovery composes the Execution Graph.

\`\`\`typescript
export interface AivosPlugin {
  id: string;
  version: string;
  displayName: string;

  /** Capability tokens for discovery — NOT stage IDs */
  capabilities: string[];  // e.g. ['video.talent_intro', 'ocr.pdf']

  /** Required skills (must exist in skill registry) */
  requiredSkills: string[];

  /** Optional skill preferences */
  preferredSkills?: Partial<Record<string, string>>;

  registerRoutes(app: Express, deps: PluginDeps): void;

  /** Map wizard/API input → runtime job payload */
  buildInput(raw: unknown, ctx: PluginContext): Promise<RuntimeJobInput>;

  billing: {
    creditField: 'ai_video_credits';
    costPerJob: number;
  };

  /** Approval policy */
  approval: {
    autoPublish: boolean;
    gates: ('creative_review' | 'draft_review')[];
  };

  permissions: PluginPermission[];
}
\`\`\`

**Removed in v2.0:** \`getStageGraph()\`, \`agents\` override map — replaced by capabilities + marketplace skills.

---

## 2. Four-Question Checklist (before new plugin)

Every new plugin proposal must answer:

1. **Capabilities:** What \`capability.*\` tokens does it declare? Do skills exist in registry?
2. **Reuse:** Which existing services wrap (≥80%)? No duplicate tables?
3. **Billing:** Which \`growth_entitlements\` field? Marketplace price tier?
4. **Approval:** Default human gates? Auto-publish allowed for this product?

**Gate:** Architecture review sign-off required — no code until APPROVED.

---

## 3. PluginDeps (v2.0)

\`\`\`typescript
export interface PluginDeps {
  pool: pg.Pool;
  redis: RedisClient;
  runtime: Runtime;       // NOT kernel — use runtime.submitJob()
  eventBus: EventBus;     // read-only subscribe for plugin routes
  authenticateToken: RequestHandler;
  growthEngine: typeof import('../../growthEngine.js');
  s3: { uploadToS3: Function };
  marketplace: MarketplaceClient;
  flags: { resumePlugin: boolean };
}
\`\`\`

---

## 4. Marketplace Lifecycle (v2.0)

| State | Plugin behavior |
|-------|-----------------|
| installed | Visible in admin; not runnable |
| enabled | Capability discovery active |
| disabled | No new jobs |
| suspended | Runtime drains in-flight |

Tables: \`aivos_marketplace_plugins\`, \`aivos_marketplace_versions\` (migration 260).

\`\`\`javascript
await marketplace.install('portfolio-ai', { version: '1.0.0' });
await marketplace.enable('portfolio-ai');
\`\`\`

---

## 5. resume-ai Adapter (Plugin #1)

| Method | Existing code |
|--------|---------------|
| capabilities | \`['video.talent_intro', 'profile.analyze']\` |
| requiredSkills | resume-extract-profile, resume-story-beats, resume-voice-script, resume-publish-profile |
| buildInput | \`buildTalentProfileContext\` |
| billing | \`getTalentVideoEntitlement\` |
| approval | \`{ autoPublish: false, gates: ['draft_review'] }\` |

Flag: \`AIVOS_RESUME_PLUGIN=1\` → \`runtime.submitJob('resume-ai', ...)\`.

---

## 6. Future Plugins

| Plugin ID | Capabilities | Priority |
|-----------|--------------|----------|
| portfolio-ai | video.portfolio, image.gallery | Phase 5+ |
| product-ads-ai | video.product_ad, brand.merchant | Phase 5+ |
| marketplace-ai | video.listing_promo | Phase 6+ |

Each adds **adapter only** — skills registered in marketplace.

---

## 7. Permissions

Unchanged from v1 — enforced via JWT + admin TOTP. Marketplace adds \`aivos_plugin_permissions\` scopes.

---

## 8. Phase Exit (Phase 4)

- [ ] resume-ai uses capabilities model
- [ ] No direct kernel imports in plugin code
- [ ] Marketplace install/enable for resume-ai
- [ ] Four-question checklist documented for portfolio-ai

---

*See: AI_RUNTIME_SPEC.md, VIDEO_PIPELINE_SPEC.md*
`);

// ─── EVENT_BUS_SPEC.md v2.0 ───────────────────────────────────────────────

OUT('EVENT_BUS_SPEC.md', `# Event Bus Specification

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Path:** \`backend/lib/aivos/kernel/eventBus.js\` (transport); \`backend/lib/aivos/runtime/acpValidator.js\` (envelope)
**Status:** FROZEN
**See:** AI_RUNTIME_SPEC.md §13 Agent Communication Protocol (ACP)

---

## 1. v2.0: Agent Communication Protocol (ACP)

All events use the **ACP envelope**. No direct agent-to-agent calls — events only.

\`\`\`json
{
  "schemaVersion": "2.0",
  "name": "aivos.pipeline.stage.completed",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "contextId": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": "2026-06-27T12:00:00Z",
  "source": {
    "agentId": "voice-director",
    "skillId": "resume-voice-script",
    "runtimeJobId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "payload": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "stage": "voice",
    "checksum": "abc123..."
  }
}
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`schemaVersion\` | string | yes | \`"2.0"\` |
| \`correlationId\` | UUID | yes | Runtime job id (primary correlation) |
| \`traceId\` | UUID | yes | Distributed trace across Kernel infer calls |
| \`contextId\` | UUID | yes | \`aivos_context_snapshots\` id at emit time |
| \`name\` | string | yes | Dot-separated event name |
| \`timestamp\` | ISO8601 | yes | Emit time |
| \`source\` | object | yes | agentId, skillId, runtimeJobId |
| \`payload\` | object | yes | Event-specific schema |

**Validation:** Runtime validates before publish; invalid events → log + metric, never crash pipeline.

---

## 2. Transport Stack

| Layer | Technology |
|-------|------------|
| Publish | Redis Pub/Sub \`aivos:events\` |
| Persist | \`aivos_events\` PG table |
| Stream | SSE \`GET /api/aivos/events?job_id=\` |

### aivos_events (migration 259 — extended v2.0)

| Column | Type |
|--------|------|
| \`id\` | UUID PK |
| \`name\` | TEXT |
| \`correlation_id\` | UUID |
| \`trace_id\` | UUID |
| \`context_id\` | UUID |
| \`schema_version\` | TEXT DEFAULT '2.0' |
| \`payload\` | JSONB |
| \`created_at\` | TIMESTAMPTZ |

Index: \`(correlation_id, created_at)\`, \`(trace_id)\`, \`(name, created_at DESC)\`.

---

## 3. Event Naming

Pattern: \`aivos.<domain>.<action>\`

| Event | Emitter |
|-------|---------|
| \`aivos.runtime.job.created\` | Task Runtime |
| \`aivos.pipeline.stage.started\` | Execution Graph |
| \`aivos.pipeline.stage.completed\` | Execution Graph |
| \`aivos.pipeline.completed\` | Execution Graph |
| \`aivos.kernel.infer.completed\` | Model Router |
| \`aivos.quality.scored\` | Quality Engine |
| \`aivos.approval.required\` | Approval Gate |
| \`aivos.learning.updated\` | Learning Engine |
| \`aivos.marketplace.plugin.enabled\` | Marketplace |

---

## 4. SSE API

\`\`\`http
GET /api/aivos/events?job_id=<correlationId>
Authorization: Bearer <firebase-jwt>
Accept: text/event-stream
\`\`\`

- Filters: \`correlation_id = job_id\`
- Replays last 20 events from \`aivos_events\`
- Heartbeat every 15s
- AI Studio wizard consumes this endpoint

---

## 5. Subscribers (in-process)

| Subscriber | Events | Action |
|------------|--------|--------|
| Timeline indexer | stage.completed | \`aivos_video_timeline\` |
| Analytics | all | \`user_intent_events\` |
| FCM | completed, quality.failed, approval.required | \`fcmService.js\` |
| Memory agent | stage.completed | Hermes episodic append |
| Cost ledger | infer.completed | \`aivos_cost_ledger\` |
| Learning | publish.completed | Signal ingest |

Handlers **must be idempotent** (at-least-once delivery).

---

## 6. Rules

1. Publish **after** DB checkpoint commit
2. No PII in payload — user_id references only
3. Fail open on subscriber errors
4. Plugins emit **only** via Runtime → Event Bus
5. All envelopes **must** include correlationId, traceId, contextId

---

## 7. Phase Exit

**Phase 1 (Runtime):** ACP validation + Redis + PG persist + \`kernel.infer.completed\`
**Phase 3 (Pipeline):** All pipeline events + SSE + approval events

---

*See: AI_RUNTIME_SPEC.md §13, AI_KERNEL_SPEC.md*
`);

// ─── QUALITY_ENGINE_SPEC.md v2.0 ────────────────────────────────────────────

OUT('QUALITY_ENGINE_SPEC.md', `# Quality Engine Specification

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Path:** \`backend/lib/aivos/kernel/qualityEngine.js\`
**Status:** FROZEN
**See:** AI_RUNTIME_SPEC.md §7, §8; invoked by Runtime after \`quality\` DAG node

---

## 1. v2.0: Quality as Learning Engine Input

Quality scores feed **Learning Engine** (\`runtime/learningEngine.js\`) — not just publish gate.

| Output | Consumer |
|--------|----------|
| \`aivos_quality_scores\` | Approval Gate, publish |
| Dimension breakdown | Learning Engine signal (weight 0.20) |
| \`retry_stages\` | Runtime Decision Engine |

**Feedback loop:** Generate → **Judge** → Publish → Analytics → Learning → Prompt Update

---

## 2. Nine Dimensions (weights = 1.0)

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

**Pass threshold:** \`overall >= 0.72\`
**Block publish:** \`content_safety < 0.5\` OR \`technical_quality < 0.4\`

---

## 3. Partial Retry via Runtime Decision Engine (v2.0)

Quality Engine returns \`retry_nodes[]\` (DAG node IDs). **Runtime Decision Engine** schedules partial re-execution — Quality Engine does not invoke pipeline directly.

| Dimension < 0.6 | Retry nodes |
|-----------------|-------------|
| visual_coherence | prompt, image |
| narrative_clarity | story, prompt |
| audio_clarity | voice |
| subtitle_accuracy | subtitle, voice |
| brand_compliance | creative, render |
| duration_fit | story, render |
| technical_quality | render |
| content_safety | story, creative (block if repeat fail) |
| engagement_hook | story, motion |

Max **2** partial retries per runtime job → \`quality_exhausted\`.

\`\`\`javascript
// Runtime orchestrates — not Quality Engine
const score = await kernel.quality.evaluate(jobId, draftArtifact);
if (!score.passed) {
  await runtime.decisionEngine.schedulePartialRetry(jobId, score.retry_nodes);
}
\`\`\`

---

## 4. quality-judge Skill

| Field | Value |
|-------|-------|
| Agent | quality-judge |
| Node | quality |
| Model task | quality_judge → hermes3:3b |
| Fallback | Weighted heuristic |

---

## 5. Events (ACP)

| Event | When |
|-------|------|
| \`aivos.quality.scored\` | Evaluation complete |
| \`aivos.quality.failed\` | below threshold |
| \`aivos.quality.retry\` | Partial retry scheduled |

---

## 6. API

| Method | Path |
|--------|------|
| GET | \`/api/aivos/quality/:jobId\` |

Internal: called by Runtime executor at quality node.

---

*See: AI_RUNTIME_SPEC.md, VIDEO_PIPELINE_SPEC.md*
`);

// ─── IMPLEMENTATION_PLAN.md v2.0 ──────────────────────────────────────────

OUT('IMPLEMENTATION_PLAN.md', `# AI Video Platform — Implementation Plan

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Code root:** \`backend/lib/aivos/runtime/\` + \`kernel/\` + \`pipeline/\`
**Migrations:** \`259_ai_video_platform.sql\`, \`260_ai_runtime_semantic.sql\`
**Rule:** Design → Review → Implement. **No code until APPROVED.**

Builds on AUDIT.md. **Out of scope:** payment gateway redesign, registrationEvolution refactors.

---

## Phase 0 — Architecture Freeze (DONE pending review)

| Item | Deliverable |
|------|-------------|
| Specs | AI_RUNTIME_SPEC.md + 8 updated docs + ARCHITECTURE_REVIEW.md |
| Generator | \`scripts/generate-runtime-specs.mjs\` |
| Sign-off | Human approval checklist |

**Status:** DONE pending review
**Gate:** All v2.0 specs approved → Phase 1

---

## Phase 1 — AI Runtime

| Item | Deliverable |
|------|-------------|
| Runtime scaffold | \`backend/lib/aivos/runtime/*\` |
| Kernel integration | \`createRuntime({ kernel })\` — Kernel not plugin-facing |
| DB | Migration 259 (runtime + kernel tables) |
| ACP | Envelope validator + event persist |
| APIs | \`/api/aivos/runtime/jobs\`, approval stubs |
| Tests | R01–R06 Runtime unit tests |

**Estimate:** 3 weeks
**Gate:** Runtime job created → plan stored → ACP event emitted
**Rollback:** Remove route mount; drop empty 259 tables

---

## Phase 2 — AI Kernel

| Item | Deliverable |
|------|-------------|
| Kernel modules | 15 modules callable from Runtime only |
| Memory | L1–L3 + L7 semantic read path |
| Infer | Model Router → ai-core; \`ai.inference_log\` |
| DB | Migration 260 (semantic, learning, marketplace) |
| Tests | K01–K06 |

**Estimate:** 2 weeks (overlap with Phase 1 tail)
**Gate:** Runtime → Kernel infer E2E
**Rollback:** Runtime mock kernel adapter

---

## Phase 3 — Video Pipeline

| Item | Deliverable |
|------|-------------|
| Template | \`videoPipelineV1\` Execution Graph template |
| Executor | Runtime \`executionGraph.js\` runs 15 nodes |
| Checkpoints | Resume/retry per node |
| Queue | \`aivos-runtime-jobs\` in queues.js |
| APIs | \`/api/video/jobs/*\` proxy |

**Estimate:** 3 weeks
**Gate:** P01–P07; worker kill → resume
**Rollback:** Disable queue processor

---

## Phase 4 — Resume Plugin

| Item | Deliverable |
|------|-------------|
| Plugin | capabilities-based resume-ai adapter |
| Flag | \`AIVOS_RESUME_PLUGIN=1\` |
| Parity | Legacy vs Runtime path |
| Marketplace | install/enable resume-ai |

**Estimate:** 2 weeks
**Gate:** R01–R05 parity tests
**Rollback:** Flag OFF → talentVideoService

---

## Phase 5 — AI Studio

| Item | Deliverable |
|------|-------------|
| Mobile | AI Studio wizard |
| Storefront | \`/m/studio/\` BFF |
| UX | SSE + approval UI |

**Estimate:** 2 weeks
**Gate:** F01–F04 wizard E2E

---

## Phase 6 — E2E Testing

| Item | Deliverable |
|------|-------------|
| Suite | E01–E05 + approval flows |
| CI | Jest in backend pipeline |

**Estimate:** 1 week
**Gate:** All E tests green

---

## Phase 7 — Performance

| Item | Deliverable |
|------|-------------|
| Targets | 1000 concurrent jobs design validation |
| p95 | < 8 min resume job (mock media) |
| Kong | \`/api/video/*\`, \`/api/aivos/*\` |

**Estimate:** 1.5 weeks
**Gate:** PF01–PF02

---

## Phase 8 — Production / Docs

| Item | Deliverable |
|------|-------------|
| OpenAPI | Runtime + Video APIs |
| Runbooks | Deploy, rollback, model outage |
| Checklist | Production sign-off |

**Estimate:** 1 week
**Gate:** On-call briefed

---

## Dependency Graph

\`\`\`
Phase 0 → Phase 1 (Runtime) → Phase 2 (Kernel) → Phase 3 (Pipeline)
                                      ↓
                              Phase 4 (Resume Plugin)
                                      ↓
                              Phase 5 (AI Studio)
                                      ↓
                              Phase 6 (E2E) → Phase 7 (Perf) → Phase 8 (Prod)
\`\`\`

**Total:** ~16 engineering-weeks sequential; Phase 5 can start after Phase 4 gate.

---

*See: ARCHITECTURE_REVIEW.md, TEST_PLAN.md, AI_VIDEO_PLATFORM_ARCHITECTURE.md v2.0*
`);

// ─── ARCHITECTURE_REVIEW.md (NEW) ───────────────────────────────────────────

OUT('ARCHITECTURE_REVIEW.md', `# Architecture Review — AI Runtime v2.0

**Date:** ${DATE}
**Reviewer:** Architecture freeze (pending human)
**Scope:** AI_RUNTIME_SPEC.md and v2.0 stack
**Prerequisites:** AUDIT.md, AI_VIDEO_PLATFORM_ARCHITECTURE.md v2.0

---

## 1. Incomplete Architecture Points

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| OCR node skill not yet in ai-core prompts | Medium | Add \`ocr-extract@v1\` prompt in Phase 2 |
| pgvector extension availability on legacy PG | Medium | Verify migration 260 on staging; fallback keyword search |
| Image/motion generation providers undefined | High | Phase 3 mock OK; Phase 7 select provider (SD/API) via Model Router slot |
| Plugin code signing for marketplace | Low | Defer to Phase 8; admin-only install initially |
| Cross-DB Hermes (legacy PG vs v2 PG) | Medium | Memory L2/L3 write to legacy PG first; sync job optional |
| Unified notification hub | Low | FCM sufficient Phase 1–5; v2 notify service later |
| Semantic embedding dimension lock (768) | Low | Confirm nomic-embed-text output dim in ai-core |

---

## 2. Technical Debt (existing — do not amplify)

| Debt | Location | v2.0 handling |
|------|----------|---------------|
| Monolith 37k-line server.js | backend/server.js | Single \`registerAivosRoutes\` mount |
| Dual API entry (monolith + Kong) | AUDIT.md | Kong routes Phase 7 only |
| Resume AI bypasses Hermes | talentResumeService | Runtime writes episodic on analyze |
| Gemini + Ollama split | chatService vs ai-core | Kernel routes all Runtime inference to ai-core |
| No ORM / raw SQL | migrations | Continue raw pg pattern |
| Email queue stub | queues.js | Out of scope |
| Growth UI duplicated | mobile + storefront | AI Studio Phase 5 consolidation |

**Explicit non-goals:** Redesign \`paymentManager\`, \`registrationEvolution\`.

---

## 3. Future Bottlenecks

| Bottleneck | At scale | Mitigation |
|------------|----------|------------|
| Single Redis | 1000 concurrent jobs | Redis Cluster; separate pub/sub |
| PG write rate on checkpoints | High job volume | Batch timeline writes; read replicas |
| ffmpeg render | CPU bound | Dedicated render workers; queue concurrency limits |
| ai-core Ollama | Model count × load | ai-core horizontal scale; cloud fallback slots |
| \`aivos_events\` table size | 90-day retention | Partition by month; cron purge (existing pattern) |
| Semantic search latency | 100k users | pgvector IVFFlat index; namespace partition |

---

## 4. What to Change Before Code

1. **Human sign-off** on AI_RUNTIME_SPEC.md + migrations 259/260 DDL review
2. **Confirm pgvector** on production legacy PG or plan v2 PG cutover for L7 only
3. **Freeze ACP schemaVersion 2.0** — no field renames after Phase 1 start
4. **Define mock strategy** for image/motion nodes (Phase 3 gate)
5. **Feature flag matrix** documented: \`AIVOS_RESUME_PLUGIN\`, \`AIVOS_RUNTIME_ENABLED\`
6. **Remove any Phase 0 assumption** that plugins call Kernel — audit imports in scaffold PR

---

## 5. What Can Scale (without core change)

| Component | Scale method |
|-----------|--------------|
| Runtime API | Stateless horizontal pods |
| Bull workers | Increase concurrency per queue |
| Plugin registry | Table-driven; 100 plugins |
| Model Router | Config rows; 100 models |
| Event Bus | Redis sharding |
| Cost ledger | Async write batch |
| Marketplace | Read-heavy cache |

Architecture validation target (§15 AI_RUNTIME_SPEC): 100 plugins, 100 models, 1000 jobs, 100k users.

---

## 6. What Must Refactor (eventually — not Phase 0–3)

| Module | Refactor | When |
|--------|----------|------|
| talentVideoService | Full adapter behind resume-ai | Phase 4 |
| Growth routes | Proxy to Runtime APIs | Phase 4 |
| Mobile Resume wizard | AI Studio shell | Phase 5 |
| ai-core | Plugin slot registry for image/motion | Phase 7 |
| Analytics | Unified pipeline metrics dashboard | Phase 8 |

**Not refactor:** registrationEvolution, paymentManager, wallet ledger.

---

## 7. What Can Reuse (≥80% target)

| Module | Path | Reuse |
|--------|------|-------|
| ai-core | aqond-v2/infra/ai-core/ | Model Router backend |
| queues.js | backend/lib/queues.js | Job queues |
| Hermes memory | hermes_* tables | L2, L3 |
| registrationEvolution | workflowCheckpointRuntime.js | Checkpoint **pattern** |
| growthEngine | growthEngine.js | Billing, entitlements |
| fcmService | fcmService.js | Notifications |
| inference_log | ai.inference_log | Cost, observability |
| incubationCompose | incubationCompose.js | Render node |
| talentVideoService | talentVideoService.js | Voice node |
| talentResumeService | talentResumeService.js | Extract/analyze/publish |
| s3-client | s3-client.js | Artifacts |
| logger | logger.js | Structured logs |

---

## 8. Risk per Module

| Module | Risk | Likelihood | Impact | Mitigation |
|--------|------|------------|--------|------------|
| AI Runtime | New orchestration layer bugs | Medium | High | Phase 1 unit tests; feature flag |
| AI Kernel | Runtime coupling too tight | Low | Medium | Kernel interface contract tests |
| Execution Graph | Checkpoint corruption | Low | High | Immutable append + checksum |
| Semantic memory | pgvector ops unfamiliar | Medium | Medium | Staging migration 260 first |
| Learning Engine | Bad prompt drift | Medium | Medium | Human approve prompt evolution |
| Marketplace | Permission escalation | Low | High | Admin-only install Phase 1–4 |
| Approval gate | UX friction | Medium | Low | auto_publish for trusted plugins |
| Quality Engine | False reject | Medium | Medium | 2 retry limit; human override |
| Legacy Resume | Parity failure | Medium | High | Flag rollback; dual-write period |
| Cost dashboard | inference_log gap | Low | Low | Kernel hook mandatory |
| Event Bus | Subscriber storm | Low | Medium | Fail open; idempotent handlers |
| ffmpeg render | Windows path issues | Medium | Medium | Reuse incubationCompose staging |

---

## Sign-Off

- [ ] Review complete
- [ ] Gaps accepted or scheduled
- [ ] Phase 1 approved to start

**Reviewer:** _______________ **Date:** _______________

---

*See: AI_RUNTIME_SPEC.md, IMPLEMENTATION_PLAN.md v2.0*
`);

// ─── AI_VIDEO_PLATFORM_ARCHITECTURE.md v2.0 ─────────────────────────────────

OUT('AI_VIDEO_PLATFORM_ARCHITECTURE.md', `# AQOND AI Video Platform — Architecture

**Version:** 2.0 (Runtime Architecture Freeze)
**Date:** ${DATE}
**Status:** FROZEN — pending human sign-off before Phase 1 code
**Prerequisites:** AUDIT.md, MODULE_MAP.md, AI_OS_ROADMAP.md, **AI_RUNTIME_SPEC.md**

---

## 1. Mission

Build a **production-ready AI Video Platform** on AQOND AI-OS. Resume AI is **Plugin #1**. All future video products share the same stack orchestrated by **AI Runtime**.

---

## 2. Design Principles (v2.0)

| Rule | Enforcement |
|------|-------------|
| Reuse ≥80% | Extend existing modules; never replace wallet, auth, queues, ai-core, ffmpeg, S3 |
| No duplicate tables | Keep \`talent_video_jobs\`, \`growth_entitlements\`; add 259/260 only |
| Runtime owns orchestration | Plugins → Runtime → Kernel (never Plugin → Kernel) |
| Capability discovery | Plugins declare capabilities; Runtime composes DAG |
| No plugin creativity | Creative Runtime + Creative Director own style |
| Every node JSON + resumable | Checkpoints in DB + Redis working memory |
| Event-driven (ACP) | Agent Communication Protocol §13 |
| Model names in Kernel only | Runtime passes task types |

---

## 3. Layered Architecture (v2.0 stack)

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│  Frontend: AI Studio (mobile + storefront BFF)              │
├─────────────────────────────────────────────────────────────┤
│  Plugin Layer: resume-ai │ portfolio-ai │ product-ads-ai …  │
├─────────────────────────────────────────────────────────────┤
│  Video Pipeline (Execution Graph template — 15 DAG nodes)   │
├─────────────────────────────────────────────────────────────┤
│  AI Kernel (router, memory, prompts, quality, creative)     │
├─────────────────────────────────────────────────────────────┤
│  AI Runtime (planner, skill graph, approval, learning, bus) │
├─────────────────────────────────────────────────────────────┤
│  AQOND CORE: Auth, Billing, Queue, Scheduler, Media, S3,    │
│    Notification, Analytics, Kong                            │
└─────────────────────────────────────────────────────────────┘
\`\`\`

**Call direction:** Frontend → Plugin → **Runtime** → Kernel / Pipeline template → AQOND CORE

### Mermaid — v2.0 runtime flow

\`\`\`mermaid
flowchart TB
  subgraph fe [Frontend]
    Studio[AI Studio Wizard]
  end
  subgraph plugins [Plugin Layer]
    Resume[resume-ai]
  end
  subgraph pipeline [Video Pipeline Template]
    DAG[15-node Execution Graph]
  end
  subgraph runtime [AI Runtime]
    Planner[Planner + Capability Discovery]
    ExecGraph[Execution Graph Executor]
    Approval[Human Approval]
    Learning[Learning Engine]
    ACP[ACP Event Envelope]
  end
  subgraph kernel [AI Kernel]
    Router[Model Router]
    Mem[Memory API 7 layers]
    CD[Creative Director]
    QE[Quality Engine]
    EB[Event Bus Transport]
  end
  subgraph core [AQOND CORE]
    Auth[Auth JWT/Firebase]
    Bill[growthEngine + wallet]
    Q[queues.js]
    Media[s3 + ffmpeg]
    AICore[ai-core Ollama]
  end
  Studio --> Resume
  Resume --> Planner
  Planner --> ExecGraph
  ExecGraph --> DAG
  ExecGraph --> Approval
  ExecGraph --> kernel
  CD --> CreativeRuntime[Creative Runtime sub-directors]
  Router --> AICore
  ExecGraph --> Media
  ExecGraph --> Bill
  ACP --> EB
  Learning --> Mem
  Resume --> Auth
\`\`\`

---

## 4. Code Layout

| Path | Role |
|------|------|
| \`backend/lib/aivos/runtime/\` | **AI Runtime** (NEW v2.0) |
| \`backend/lib/aivos/kernel/\` | AI Kernel (Runtime-invoked only) |
| \`backend/lib/aivos/pipeline/\` | Execution Graph templates |
| \`backend/lib/aivos/plugins/\` | Plugin SDK + adapters |
| \`backend/lib/aivos/routes/\` | API mounts |
| \`backend/db/migrations/259_ai_video_platform.sql\` | Runtime + kernel tables |
| \`backend/db/migrations/260_ai_runtime_semantic.sql\` | Semantic, learning, marketplace |

**Do not move or delete:** \`talentResumeService.js\`, \`talentVideoService.js\`, \`incubationCompose.js\`, \`growthEngine.js\`, \`queues.js\`, \`registrationEvolution/\`, \`paymentManager.js\`.

---

## 5. Reuse Map

| Existing module | Path | Platform role |
|-----------------|------|---------------|
| ai-core | aqond-v2/infra/ai-core/ | Kernel Model Router target |
| queues.js | backend/lib/queues.js | Runtime job queues |
| Hermes memory | hermes_* tables | Memory L2–L3 |
| registrationEvolution | workflowCheckpointRuntime.js | Checkpoint pattern |
| growthEngine | growthEngine.js | Billing + marketplace credits |
| fcmService | fcmService.js | Approval + completion push |
| inference_log | ai.inference_log | Cost + observability |
| incubationCompose | incubationCompose.js | Render node |
| talentVideoService | talentVideoService.js | Voice node |
| talentResumeService | talentResumeService.js | Resume plugin adapter |

Full detail: AI_RUNTIME_SPEC.md reuse table.

---

## 6. Spec Documents (v2.0)

| Document | Role |
|----------|------|
| **AI_RUNTIME_SPEC.md** | Primary — 15 sections |
| AI_KERNEL_SPEC.md | Kernel modules; Runtime integration |
| VIDEO_PIPELINE_SPEC.md | Execution Graph template |
| PLUGIN_SDK.md | Capabilities + marketplace |
| EVENT_BUS_SPEC.md | ACP envelope |
| QUALITY_ENGINE_SPEC.md | Learning input + partial retry |
| IMPLEMENTATION_PLAN.md | Phases 0–8 |
| ARCHITECTURE_REVIEW.md | Gaps, risks, reuse |
| TEST_PLAN.md | Test IDs (unchanged) |

---

## 7. Database Strategy

**Reuse:** \`talent_video_jobs\`, \`growth_entitlements\`, \`users\`, \`ai.inference_log\`, Hermes tables

**Migration 259:** runtime, kernel, workflow, events, approval, cost
**Migration 260:** semantic memory, learning, marketplace

See AI_RUNTIME_SPEC.md database summary.

---

## 8. Phase Gate Criteria (v2.0)

| Phase | Exit criteria |
|-------|---------------|
| **0** | All v2.0 specs approved (DONE pending review) |
| **1** | AI Runtime MVP + ACP events |
| **2** | Kernel integrated; semantic memory read |
| **3** | Execution Graph template E2E |
| **4** | Resume plugin parity |
| **5** | AI Studio + approval UX |
| **6** | E2E suite green |
| **7** | Performance targets |
| **8** | Production docs + runbooks |

**Rule:** Design → Review → Implement. No code until APPROVED.

---

## 9. Human Sign-Off

- [ ] v2.0 architecture approved
- [ ] AI_RUNTIME_SPEC.md approved
- [ ] Migrations 259 + 260 approved
- [ ] Phase 1 scope approved

**Approved by:** _______________ **Date:** _______________

---

*Primary reference: AI_RUNTIME_SPEC.md*
`);

console.log('\nRuntime v2.0 complete: 9 spec files written');
