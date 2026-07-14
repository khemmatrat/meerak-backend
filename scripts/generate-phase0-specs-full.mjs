#!/usr/bin/env node
/**
 * Phase 0: Architecture Freeze — generates 8 FULL spec documents.
 * Run: node scripts/generate-phase0-specs-full.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const written = [];

function OUT(name, body, { skipIfBytesGte } = {}) {
  const p = path.join(ROOT, name);
  if (skipIfBytesGte != null && fs.existsSync(p)) {
    const size = fs.statSync(p).size;
    if (size >= skipIfBytesGte) {
      console.log('Skipped (existing)', name, size, 'bytes');
      written.push({ name, bytes: size, skipped: true });
      return;
    }
  }
  fs.writeFileSync(p, body.replace(/\r\n/g, '\n'), 'utf8');
  const bytes = fs.statSync(p).size;
  console.log('Wrote', name, bytes, 'bytes');
  written.push({ name, bytes, skipped: false });
}

// ─── 1. Architecture (skip if already ≥9KB) ────────────────────────────────

OUT(
  'AI_VIDEO_PLATFORM_ARCHITECTURE.md',
  `# AQOND AI Video Platform — Architecture

**Version:** 1.0 (Phase 0 Freeze)
**Date:** 2026-06-27
**Status:** FROZEN — pending human sign-off before Phase 1 code
**Prerequisites:** AUDIT.md, MODULE_MAP.md, AI_OS_ROADMAP.md

---

## 1. Mission

Build a **production-ready AI Video Platform** on top of AQOND AI-OS. This is **not** a Resume Video Generator. Resume AI is **Plugin #1**. Every future AQOND service (Portfolio, Product Ads, Marketplace, Service, Interview, Course) generates video through the **same reusable stack**.

---

## 2. Design Principles

| Rule | Enforcement |
|------|-------------|
| Reuse ≥80% | Extend existing modules; never replace wallet, auth, queues, ai-core, ffmpeg, S3 |
| No duplicate tables | Keep \`talent_video_jobs\`, \`growth_entitlements\`; add only net-new tables |
| No direct AI-to-AI calls | All inference via **AI Kernel** Model Router |
| No plugin creativity | **Creative Director** owns style; plugins supply intent + data |
| Every stage JSON + resumable | Checkpoints in DB + Redis working memory |
| Event-driven coupling | **Event Bus** only between pipeline stages |
| Model names in Kernel only | Plugins never hardcode hermes/qwen/moondream |
| Do not redesign payments | \`paymentManager.js\`, \`registrationEvolution/\` are off-limits |

---

## 3. Layered Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│  Frontend: AI Studio (mobile + storefront BFF)              │
├─────────────────────────────────────────────────────────────┤
│  Plugins: resume-ai │ portfolio-ai │ product-ads-ai │ …     │
├─────────────────────────────────────────────────────────────┤
│  Video Pipeline (generic stages, checkpointed)              │
├─────────────────────────────────────────────────────────────┤
│  AI Kernel (router, memory, prompts, agents, quality, bus)  │
├─────────────────────────────────────────────────────────────┤
│  AQOND CORE (reuse): Auth, Billing, Queue, Scheduler,       │
│    Media Engine, Storage, Notification, Analytics, Kong     │
└─────────────────────────────────────────────────────────────┘
\`\`\`

### Mermaid — runtime flow

\`\`\`mermaid
flowchart TB
  subgraph fe [Frontend]
    Studio[AI Studio Wizard]
  end
  subgraph plugins [Plugins]
    Resume[resume-ai Plugin]
  end
  subgraph pipeline [Video Pipeline]
    Stages[14 Generic Stages]
  end
  subgraph kernel [AI Kernel]
    Router[Model Router]
    Ctx[Context Bus]
    Mem[Memory API]
    CD[Creative Director]
    QE[Quality Engine]
    EB[Event Bus]
  end
  subgraph core [AQOND CORE - existing]
    Auth[Auth JWT/Firebase]
    Bill[growthEngine + wallet]
    Q[Bull queues.js]
    Media[s3 + ffmpeg]
    AICore[ai-core Ollama]
  end
  Studio --> Resume
  Resume --> Stages
  Stages --> EB
  EB --> kernel
  Router --> AICore
  Stages --> Media
  Stages --> Bill
  Resume --> Auth
\`\`\`

---

## 4. Code Layout (new files only)

| Path | Role | Reuses |
|------|------|--------|
| \`backend/lib/aivos/\` | AI Video OS package root | — |
| \`backend/lib/aivos/kernel/\` | AI Kernel modules | ai-core client, Hermes memory |
| \`backend/lib/aivos/pipeline/\` | Generic video pipeline orchestrator | registrationEvolution checkpoint pattern |
| \`backend/lib/aivos/plugins/\` | Plugin SDK + adapters | attach*Routes pattern |
| \`backend/lib/aivos/plugins/resume-ai/\` | Plugin #1 adapter | talentResumeService, talentVideoService, incubationCompose |
| \`backend/lib/aivos/routes/\` | \`/api/video/*\`, \`/api/aivos/*\` | server.js mount only |
| \`backend/db/migrations/259_ai_video_platform.sql\` | Net-new tables only | — |
| \`aqond-v2/infra/ai-core/\` | **Extended**, not replaced | Model Router backend |
| \`mobile/pages/AIStudio.tsx\` | AI Studio shell (Phase 4) | AIResumeVideoWizard patterns |
| \`aqond-v2/apps/storefront/app/m/studio/\` | Storefront AI Studio route | BFF proxy |

**Do not move or delete:** \`talentResumeService.js\`, \`talentVideoService.js\`, \`incubationCompose.js\`, \`growthEngine.js\`, \`queues.js\`, \`registrationEvolution/\`, \`paymentManager.js\`.

---

## 5. Reuse Map (existing → platform role)

| Existing module | Path | Platform role |
|-----------------|------|---------------|
| Authentication | \`server.js\`, \`verifyFirebaseIdTokenPublic.js\` | Core — all APIs use \`authenticateToken\` |
| Billing / credits | \`growthEngine.js\`, \`growth_entitlements\` | Plugin metering via \`ai_video_credits\` |
| Wallet | \`paymentManager.js\` | Subscription 799, future per-render billing |
| Bull Queue | \`queues.js\` | New queue \`aivos-video-pipeline\`; keep existing queues |
| Workflow checkpoints | \`registrationEvolution/workflowCheckpointRuntime.js\` | **Pattern copy** for pipeline checkpoints (no import from signup) |
| Prompt engine | \`ai-core/lib/prompts/\` | Prompt Registry backend |
| Ollama ai-core | \`aqond-v2/infra/ai-core/server.js\` | Model Router inference target |
| Hermes memory | PG \`hermes_episodic_memory\`, Redis working | Memory API layers 2–3 |
| Media / ffmpeg | \`s3-client.js\`, \`incubationCompose.js\`, \`videoWatermark.js\` | Render + overlay stages |
| Storage | S3 / MinIO | Artifact URLs per checkpoint |
| Analytics | \`user_intent_events\`, \`ai.inference_log\` | Event Bus sink + quality metrics |
| Notification | \`fcmService.js\` | \`video.completed\`, \`quality.failed\` handlers |
| Kong | \`aqond-v2/gateway/kong.yml\` | Route \`/api/video/*\` in Phase 6 |
| Resume AI (legacy) | \`talentResumeService.js\`, \`talentVideoService.js\` | Wrapped by resume-ai plugin adapter |
| Scheduler | \`scripts/*-cron.js\`, Bull delayed jobs | Scheduled video generation |

---

## 6. New Components (net-new)

| Component | Spec doc |
|-----------|----------|
| AI Kernel | AI_KERNEL_SPEC.md |
| Video Pipeline | VIDEO_PIPELINE_SPEC.md |
| Plugin SDK | PLUGIN_SDK.md |
| Event Bus | EVENT_BUS_SPEC.md |
| Quality Engine | QUALITY_ENGINE_SPEC.md |
| Brand DNA | AI_KERNEL_SPEC.md § Brand DNA |
| Creative Director | AI_KERNEL_SPEC.md § Creative Director |

---

## 7. Database Strategy

**Reuse (no schema change):**
- \`talent_video_jobs\` — legacy job rows; plugin adapter writes compat fields
- \`growth_entitlements\` — credit checks via \`getGrowthStatus\`
- \`users\` — profile context
- \`ai.inference_log\` — model call audit
- \`commerce.hermes_episodic_memory\` / \`hermes_procedural_rules\`

**New tables only** (migration 259):
- \`aivos_plugin_registry\`
- \`aivos_agent_registry\`
- \`aivos_prompt_registry\`
- \`aivos_brand_dna\`
- \`aivos_workflow_jobs\` (generic pipeline job)
- \`aivos_workflow_checkpoints\` (per-stage JSON)
- \`aivos_quality_scores\`
- \`aivos_events\` (event store)
- \`aivos_video_timeline\` (artifact index)
- \`aivos_context_snapshots\` (kernel context per job)

See VIDEO_PIPELINE_SPEC.md for checkpoint JSON schemas.

---

## 8. API Surface (frozen)

| Method | Path | Phase |
|--------|------|-------|
| POST | \`/api/video/jobs\` | 2 |
| GET | \`/api/video/jobs/:id\` | 2 |
| GET | \`/api/video/jobs/:id/timeline\` | 2 |
| POST | \`/api/video/jobs/:id/retry\` | 2 |
| POST | \`/api/video/jobs/:id/publish\` | 3 |
| GET | \`/api/aivos/plugins\` | 1 |
| GET | \`/api/aivos/agents\` | 1 |
| GET | \`/api/aivos/brand/:ownerId\` | 1 |
| PUT | \`/api/aivos/brand/:ownerId\` | 1 |
| GET | \`/api/aivos/quality/:jobId\` | 2 |
| GET | \`/api/aivos/events\` (SSE) | 2 |
| POST | \`/api/aivos/schedule\` | 2 |
| POST | \`/api/aivos/kernel/infer\` | 1 |

Legacy routes **remain** during migration:
- \`/api/growth/talent/resume/*\`
- \`/api/growth/talent/video/*\`

---

## 9. Agent Model (frozen)

Agents are **Kernel-registered skills**, not monolithic bots. Each agent = one pipeline stage responsibility.

| Agent ID | Stage | Skill |
|----------|-------|-------|
| \`resume-analyzer\` | analyze | Extract structured profile intent |
| \`story-planner\` | planning | Scene list + beats |
| \`creative-director\` | creative_direction | Style manifest (authoritative) |
| \`prompt-generator\` | prompt_generation | Per-scene prompts |
| \`image-director\` | image_generation | Scene stills |
| \`animation-director\` | animation_generation | Motion specs |
| \`voice-director\` | voice_generation | TTS script + character |
| \`subtitle-director\` | subtitle_generation | SRT/ASS |
| \`music-selector\` | music | Track selection |
| \`quality-judge\` | quality_check | Scored rubric |
| \`publishing-agent\` | publish | Feed/profile placement |
| \`analytics-agent\` | post-publish | Metrics enrichment |
| \`memory-agent\` | all | Read/write Memory API |

Plugins **register** which agents run; Kernel **schedules** them.

---

## 10. Phase Gate Criteria

| Phase | Exit criteria |
|-------|---------------|
| **0** | All 8 spec docs approved (this freeze) |
| **1** | Kernel unit tests pass; Model Router + Memory API + Event Bus MVP |
| **2** | End-to-end pipeline job with mock media; checkpoints resumable |
| **3** | Resume plugin produces same output as legacy path (parity test) |
| **4** | AI Studio 8-step wizard with live SSE progress |
| **5** | Full E2E test suite green |
| **6** | p95 job latency + concurrency targets met |
| **7** | OpenAPI docs + runbooks + production checklist |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking legacy Resume AI | Adapter + feature flag \`AIVOS_RESUME_PLUGIN=1\` |
| Monolith mount complexity | Single \`registerAivosRoutes(app, deps)\` |
| Dual DB (legacy + v2) | Memory API writes legacy PG; Hermes sync optional Phase 3 |
| ffmpeg Windows paths | Reuse \`incubationCompose.js\` staging pattern |
| Model downtime | Rule fallbacks in ai-core (existing) + retry manager |
| Payment gateway regression | No changes to paymentManager or registrationEvolution |

---

## 12. Human Sign-Off

- [ ] Architecture approved
- [ ] DB migration 259 schema approved
- [ ] API surface approved
- [ ] Phase 1 scope approved

**Approved by:** _______________ **Date:** _______________

---

*See also: AI_KERNEL_SPEC.md, VIDEO_PIPELINE_SPEC.md, PLUGIN_SDK.md, EVENT_BUS_SPEC.md, QUALITY_ENGINE_SPEC.md, IMPLEMENTATION_PLAN.md, TEST_PLAN.md*
`,
  { skipIfBytesGte: 9000 },
);

// ─── 2. AI Kernel ──────────────────────────────────────────────────────────

OUT('AI_KERNEL_SPEC.md', `# AI Kernel Specification

**Version:** 1.0 (Phase 0 Freeze)
**Path:** \`backend/lib/aivos/kernel/\`
**Status:** FROZEN

Single AI control plane for the AQOND AI Video Platform. Plugins and pipeline stages **never** call Ollama, Gemini, or external LLMs directly. All inference flows through the Kernel Model Router → \`aqond-v2/infra/ai-core\`.

---

## 1. Purpose

The AI Kernel consolidates 15 modules into one factory (\`createKernel(deps)\`) mounted from \`backend/lib/aivos/index.js\`. It reuses:

- \`AI_CORE_URL\` + \`x-ai-core-api-key\` (existing ai-core auth)
- \`ai.inference_log\` (audit trail)
- Hermes episodic/procedural tables (Memory API layers 2–3)
- Redis working memory (layer 1)
- Rule-based fallbacks in ai-core prompts (existing pattern)

---

## 2. Kernel Modules (15)

| # | Module | File | Responsibility |
|---|--------|------|----------------|
| 1 | **Model Router** | \`modelRouter.js\` | Task → model mapping; single \`/kernel/infer\` entry |
| 2 | **Context Bus** | \`contextBus.js\` | In-process pub/sub for kernel subsystems |
| 3 | **Memory API** | \`memoryApi.js\` | 6-layer read/write facade |
| 4 | **Prompt Registry** | \`promptRegistry.js\` | Versioned prompts; wraps ai-core/lib/prompts |
| 5 | **Task Planner** | \`taskPlanner.js\` | Decomposes plugin intent → agent task DAG |
| 6 | **Agent Registry** | \`agentRegistry.js\` | CRUD for \`aivos_agent_registry\` |
| 7 | **Skill Registry** | \`skillRegistry.js\` | Agent skill definitions + JSON schemas |
| 8 | **Decision Engine** | \`decisionEngine.js\` | Rule + LLM hybrid routing for edge cases |
| 9 | **Event Bus** | \`eventBus.js\` | See EVENT_BUS_SPEC.md |
| 10 | **Quality Engine** | \`qualityEngine.js\` | See QUALITY_ENGINE_SPEC.md |
| 11 | **Creative Director** | \`creativeDirector.js\` | Authoritative style manifest |
| 12 | **Brand DNA** | \`brandDna.js\` | User/merchant brand profile CRUD |
| 13 | **Cost Optimizer** | \`costOptimizer.js\` | Token/credit budget enforcement |
| 14 | **Retry Manager** | \`retryManager.js\` | Exponential backoff; ai-core 429 handling |
| 15 | **Checkpoint Manager** | \`checkpointManager.js\` | Kernel context snapshots per job stage |

---

## 3. Model Router (frozen)

All model names live here. Plugins reference **task types** only.

| Task type | Primary model | Env override | Fallback |
|-----------|---------------|--------------|----------|
| \`reasoning\` | hermes3:3b | \`OLLAMA_MODEL_CHAT\` | rule-based (per prompt) |
| \`writing\` | qwen2.5:7b-instruct | \`OLLAMA_MODEL_PROSE\` | rule-based prose |
| \`vision\` | moondream | \`OLLAMA_MODEL_VISION\` | skip vision step |
| \`structured_json\` | qwen2.5:7b-instruct | \`OLLAMA_MODEL_PROSE\` | schema validator reject + retry |
| \`quality_judge\` | hermes3:3b | \`OLLAMA_MODEL_CHAT\` | weighted heuristic |
| \`embedding\` | nomic-embed-text | \`OLLAMA_MODEL_EMBED\` | keyword hash |
| \`claude\` | — | \`ANTHROPIC_MODEL\` | config-only Phase 1 |
| \`gpt\` | — | \`OPENAI_MODEL\` | config-only Phase 1 |

**Inference contract:**

\`\`\`http
POST /api/aivos/kernel/infer
Authorization: Bearer <firebase-jwt>
Content-Type: application/json

{
  "task": "writing",
  "prompt_id": "talent-resume-draft@v2",
  "variables": { "talent_name": "..." },
  "job_id": "uuid",
  "max_tokens": 2048
}
\`\`\`

Router forwards to \`\${AI_CORE_URL}/v1/chat\` or task-specific ai-core routes. Every call logs to \`ai.inference_log\` with \`metadata.aivos_job_id\`.

---

## 4. Memory API — 6 Layers

| Layer | Name | Storage | TTL | Read | Write |
|-------|------|---------|-----|------|-------|
| L1 | **Working** | Redis \`aivos:wm:{jobId}\` | 24h | All stages | Current stage only |
| L2 | **Episodic** | \`commerce.hermes_episodic_memory\` | Permanent | memory-agent | memory-agent |
| L3 | **Procedural** | \`commerce.hermes_procedural_rules\` | Permanent | Kernel | Admin only |
| L4 | **Brand** | \`aivos_brand_dna\` | Permanent | Creative Director | User PUT |
| L5 | **Plugin** | \`aivos_context_snapshots\` | Job lifetime | Plugin adapter | Plugin adapter |
| L6 | **Artifact** | S3 + \`aivos_video_timeline\` | Permanent | Pipeline | Media stages |

**API surface (internal):**

\`\`\`javascript
memory.get(jobId, layer, key)
memory.set(jobId, layer, key, value, { ttlSec })
memory.appendEpisode(userId, { type, payload })
memory.getBrandDna(ownerId)
\`\`\`

Layer 2 reuses existing Hermes schema — no new episodic table. Resume plugin writes profile-analysis episodes on \`analyze\` stage completion.

---

## 5. Creative Director — Style Manifest Schema

Creative Director output is **authoritative**. Plugins cannot override \`palette\`, \`typography\`, or \`motion_profile\`.

\`\`\`json
{
  "manifest_version": "cd_v1",
  "job_id": "uuid",
  "plugin_id": "resume-ai",
  "style_id": "professional_th_v2",
  "palette": {
    "primary": "#1A73E8",
    "secondary": "#FFFFFF",
    "accent": "#FFB300",
    "background": "#0D1117"
  },
  "typography": {
    "headline_font": "NotoSansThai-Bold",
    "body_font": "NotoSansThai-Regular",
    "subtitle_safe_zone": "bottom_20pct"
  },
  "motion_profile": {
    "pace": "medium",
    "transition": "crossfade_400ms",
    "ken_burns_intensity": 0.3
  },
  "audio_profile": {
    "voice_character": "man_warm",
    "music_mood": "uplifting_corporate",
    "ducking_db": -12
  },
  "overlay_template": "incubation_v4",
  "constraints": {
    "max_duration_sec": 60,
    "aspect_ratio": "9:16",
    "watermark": true
  },
  "director_notes": "Professional Thai talent intro; warm tone."
}
\`\`\`

Stored in checkpoint \`creative_direction\` and Memory L1 \`style_manifest\`.

---

## 6. Brand DNA Table

\`aivos_brand_dna\` (migration 259):

| Column | Type | Description |
|--------|------|-------------|
| \`owner_id\` | UUID PK | User or merchant ID |
| \`owner_type\` | TEXT | \`user\` \| \`merchant\` |
| \`display_name\` | TEXT | Brand display name |
| \`logo_url\` | TEXT | S3 URL |
| \`primary_color\` | TEXT | Hex |
| \`secondary_color\` | TEXT | Hex |
| \`voice_preset\` | TEXT | Default TTS character |
| \`tone_keywords\` | JSONB | e.g. \`["professional","friendly"]\` |
| \`forbidden_topics\` | JSONB | Content guardrails |
| \`locale\` | TEXT | Default \`th-TH\` |
| \`created_at\` | TIMESTAMPTZ | |
| \`updated_at\` | TIMESTAMPTZ | |

Creative Director merges Brand DNA + plugin intent → manifest. Falls back to AQOND defaults if row missing.

---

## 7. Kernel HTTP APIs

| Method | Path | Phase | Auth |
|--------|------|-------|------|
| POST | \`/api/aivos/kernel/infer\` | 1 | JWT |
| GET | \`/api/aivos/agents\` | 1 | JWT |
| GET | \`/api/aivos/agents/:id\` | 1 | JWT |
| GET | \`/api/aivos/brand/:ownerId\` | 1 | JWT (owner) |
| PUT | \`/api/aivos/brand/:ownerId\` | 1 | JWT (owner) |
| GET | \`/api/aivos/plugins\` | 1 | JWT |

Mount via \`registerAivosRoutes(app, deps)\` in \`server.js\` — same \`authenticateToken\` as growth routes.

---

## 8. Dependencies (reuse, do not rewrite)

| Dep | Source |
|-----|--------|
| \`pool\` | Legacy PG pool from server.js |
| \`redis\` | Existing Redis client |
| \`aiCoreUrl\` | \`process.env.AI_CORE_URL\` |
| \`growthEngine\` | Credit checks only |
| \`s3\` | \`uploadToS3\` from s3-client.js |

**Explicitly excluded:** \`paymentManager.js\`, \`registrationEvolution/*\` imports.

---

## 9. Phase 1 Exit Criteria

- [ ] \`createKernel(deps)\` exports all 15 modules
- [ ] Migration 259 applied (kernel tables only)
- [ ] Model Router: reasoning/writing/vision tasks succeed against ai-core
- [ ] Memory API: L1 Redis + L2 Hermes read/write integration test
- [ ] Event Bus MVP: publish + SSE subscriber (see EVENT_BUS_SPEC.md)
- [ ] \`GET /api/aivos/agents\` returns seeded agent registry
- [ ] Unit tests in \`backend/lib/aivos/__tests__/kernel/\` — see TEST_PLAN.md K01–K06
- [ ] No plugin or pipeline code in Phase 1 (kernel only)

---

*Prerequisites: AI_VIDEO_PLATFORM_ARCHITECTURE.md, AUDIT.md*
`);

// ─── 3. Video Pipeline ─────────────────────────────────────────────────────

OUT('VIDEO_PIPELINE_SPEC.md', `# Video Pipeline Specification

**Version:** 1.0 (Phase 0 Freeze)
**Path:** \`backend/lib/aivos/pipeline/\`
**Status:** FROZEN

Generic 14-stage video pipeline. All plugins (starting with resume-ai) execute the same stage graph with checkpointed JSON artifacts.

---

## 1. Stage Graph (14 stages)

| # | Stage ID | Agent | Input | Output artifact |
|---|----------|-------|-------|-----------------|
| 1 | \`input\` | — | Plugin payload | \`input.json\` |
| 2 | \`analyze\` | resume-analyzer | input | \`analysis.json\` |
| 3 | \`planning\` | story-planner | analysis + brand | \`plan.json\` |
| 4 | \`storyboard\` | story-planner | plan | \`storyboard.json\` |
| 5 | \`creative_direction\` | creative-director | storyboard + brand | \`style_manifest.json\` |
| 6 | \`prompt_generation\` | prompt-generator | manifest + scenes | \`prompts.json\` |
| 7 | \`image_generation\` | image-director | prompts | \`images/\` |
| 8 | \`animation_generation\` | animation-director | images + manifest | \`clips/\` |
| 9 | \`voice_generation\` | voice-director | plan script | \`voice.wav\` |
| 10 | \`subtitle_generation\` | subtitle-director | voice + plan | \`subs.ass\` |
| 11 | \`music\` | music-selector | manifest audio_profile | \`music.mp3\` |
| 12 | \`render\` | — (ffmpeg) | clips + voice + subs + music | \`draft.mp4\` |
| 13 | \`quality_check\` | quality-judge | draft.mp4 + manifest | \`quality.json\` |
| 14 | \`publish\` | publishing-agent | draft + quality pass | \`published_url\` |

Stages 7–8 may be **mocked** in Phase 2 (static placeholder images/clips). Stage 12 **must** produce real MP4 via ffmpeg.

---

## 2. Stage JSON Schemas (checkpoint payloads)

### input
\`\`\`json
{ "plugin_id": "resume-ai", "owner_id": "uuid", "intent": "talent_intro", "raw": { "script_text": "...", "avatar_url": "https://..." } }
\`\`\`

### analysis
\`\`\`json
{ "profile": { "talent_name": "...", "skills": [], "category": "..." }, "tone": "professional", "target_duration_sec": 45 }
\`\`\`

### plan
\`\`\`json
{ "scenes": [{ "id": "s1", "beat": "intro", " narration": "...", "duration_sec": 8 }], "total_duration_sec": 45 }
\`\`\`

### storyboard
\`\`\`json
{ "frames": [{ "scene_id": "s1", "visual_hint": "portrait + name card", "text_overlay": "..." }] }
\`\`\`

### creative_direction
Full Creative Director manifest (see AI_KERNEL_SPEC.md §5).

### prompts
\`\`\`json
{ "scenes": [{ "scene_id": "s1", "image_prompt": "...", "negative_prompt": "..." }] }
\`\`\`

### render
\`\`\`json
{ "draft_url": "s3://...", "duration_sec": 44.2, "codec": "h264", "overlay_version": 4 }
\`\`\`

### quality_check
\`\`\`json
{ "overall": 0.81, "passed": true, "dimensions": { "visual_coherence": 0.85 }, "retry_stages": [] }
\`\`\`

### publish
\`\`\`json
{ "published_url": "https://...", "feed_item_id": null, "profile_field": "greeting_video_url" }
\`\`\`

---

## 3. Database Tables (migration 259)

### aivos_workflow_jobs

| Column | Type | Notes |
|--------|------|-------|
| \`id\` | UUID PK | |
| \`plugin_id\` | TEXT | e.g. resume-ai |
| \`owner_id\` | UUID | User |
| \`status\` | TEXT | queued/processing/completed/failed/cancelled |
| \`current_stage\` | TEXT | Last completed or in-progress stage |
| \`legacy_job_id\` | BIGINT NULL | FK compat → talent_video_jobs.id |
| \`credit_charged\` | BOOLEAN | growth_entitlements decrement |
| \`error_message\` | TEXT | |
| \`scheduled_at\` | TIMESTAMPTZ NULL | Scheduler |
| \`created_at\` | TIMESTAMPTZ | |
| \`completed_at\` | TIMESTAMPTZ NULL | |

### aivos_workflow_checkpoints

| Column | Type | Notes |
|--------|------|-------|
| \`id\` | UUID PK | |
| \`job_id\` | UUID FK | |
| \`stage\` | TEXT | Stage ID |
| \`payload\` | JSONB | Stage output schema above |
| \`artifact_urls\` | JSONB | S3 keys map |
| \`checksum\` | TEXT | SHA-256 of payload |
| \`created_at\` | TIMESTAMPTZ | Immutable — append only |

### aivos_video_timeline

| Column | Type | Notes |
|--------|------|-------|
| \`id\` | UUID PK | |
| \`job_id\` | UUID FK | |
| \`stage\` | TEXT | |
| \`artifact_type\` | TEXT | image/audio/video/json |
| \`url\` | TEXT | S3 HTTPS URL |
| \`meta\` | JSONB | duration, size, etc. |
| \`created_at\` | TIMESTAMPTZ | |

Index: \`(job_id, stage)\`, \`(job_id, created_at)\`.

---

## 4. Orchestrator Pseudocode

Pattern copied from \`registrationEvolution/workflowCheckpointRuntime.js\` (hash + immutable snapshots) but **persisted** to PG.

\`\`\`javascript
async function runPipeline(jobId) {
  const job = await loadJob(jobId);
  const plugin = pluginRegistry.get(job.plugin_id);
  const stages = plugin.getStageGraph(); // subset of 14

  for (const stage of stages) {
    if (await hasCheckpoint(jobId, stage)) continue;

    await updateJob(jobId, { status: 'processing', current_stage: stage });
    eventBus.publish('aivos.pipeline.stage.started', { jobId, stage });

    const input = await assembleStageInput(jobId, stage);
    const agent = agentRegistry.getForStage(stage);
    const output = await executeStage(stage, agent, input, kernel);

    const checksum = sha256(output);
    await insertCheckpoint(jobId, stage, output, checksum);
    await indexTimeline(jobId, stage, output.artifact_urls);
    memory.set(jobId, 'working', stage, output);

    eventBus.publish('aivos.pipeline.stage.completed', { jobId, stage, checksum });
  }

  await updateJob(jobId, { status: 'completed', completed_at: now() });
  eventBus.publish('aivos.pipeline.completed', { jobId });
}
\`\`\`

**Resume on failure:** \`POST /api/video/jobs/:id/retry\` → reload last checkpoint → continue from next stage.

**Queue:** Bull queue \`aivos-video-pipeline\` in \`queues.js\` (new processor, existing Redis).

---

## 5. Reuse Map (existing code)

| Stage(s) | Existing module | Wrap strategy |
|----------|-----------------|---------------|
| input, analyze | \`talentResumeService.buildTalentProfileContext\`, \`generateTalentResumeDraft\` | Adapter maps profile → analysis.json |
| voice_generation | \`talentVideoService\` + AI Studio TTS | Same STUDIO_BASE URL |
| render | \`incubationCompose.composeIncubationOverlay\` | INCUBATION_OVERLAY_VERSION=4 |
| render (upload) | \`s3-client.uploadToS3\` | Same buckets |
| publish | \`talentResumeService.publishTalentResume\` | Sets greeting_video_url |
| credit gate | \`growthEngine.getGrowthStatus\`, \`getTalentVideoEntitlement\` | Pre-stage input check |
| legacy compat | \`talent_video_jobs\` | Adapter writes parallel row via legacy_job_id |

**Do not import** from \`registrationEvolution/\` — copy checkpoint hash semantics only.

---

## 6. Scheduler

| Mechanism | Use |
|-----------|-----|
| Bull delayed job | \`scheduled_at\` on workflow job |
| \`POST /api/aivos/schedule\` | User schedules future render |
| Existing cron scripts | Unchanged; no central scheduler rewrite in Phase 2 |

Scheduled jobs enter \`aivos-video-pipeline\` queue when \`scheduled_at <= now()\`.

---

## 7. HTTP API

| Method | Path | Body / Response |
|--------|------|-----------------|
| POST | \`/api/video/jobs\` | \`{ plugin_id, intent, raw }\` → \`{ job_id, status }\` |
| GET | \`/api/video/jobs/:id\` | Job + current_stage + checkpoints summary |
| GET | \`/api/video/jobs/:id/timeline\` | Ordered timeline artifacts |
| POST | \`/api/video/jobs/:id/retry\` | Resume from last checkpoint |
| POST | \`/api/video/jobs/:id/publish\` | Force publish if quality passed |
| POST | \`/api/aivos/schedule\` | \`{ plugin_id, raw, scheduled_at }\` |

All routes: \`authenticateToken\` (reuse server.js middleware).

---

## 8. Legacy Compatibility

| Legacy | Platform bridge |
|--------|-----------------|
| \`POST /api/growth/talent/video/create\` | Unchanged until Phase 3 flag |
| \`talent_video_jobs\` | resume-ai adapter inserts compat row |
| \`AIVOS_RESUME_PLUGIN=1\` | Routes create → \`/api/video/jobs\` internally |
| \`AIVOS_RESUME_PLUGIN=0\` | Default; legacy path only (rollback) |

Parity test (Phase 3): same avatar + script → byte-similar MP4 ± watermark timing.

---

## 9. Phase 2 Exit Criteria

- [ ] All 14 stages registered; 7–8 mocked acceptable
- [ ] Real ffmpeg MP4 from render stage
- [ ] Checkpoints persisted; kill worker mid-job → retry resumes
- [ ] \`aivos_workflow_jobs\` + checkpoints + timeline populated
- [ ] Events emitted per stage (EVENT_BUS_SPEC.md)
- [ ] Queue processor registered in queues.js
- [ ] Tests P01–P07 pass (TEST_PLAN.md)

---

*See: AI_KERNEL_SPEC.md, PLUGIN_SDK.md, QUALITY_ENGINE_SPEC.md*
`);

// ─── 4. Plugin SDK ─────────────────────────────────────────────────────────

OUT('PLUGIN_SDK.md', `# Plugin SDK Specification

**Version:** 1.0 (Phase 0 Freeze)
**Path:** \`backend/lib/aivos/plugins/\`
**Status:** FROZEN

Plugins are the only extension point for new video products. Each plugin implements a TypeScript interface (JSDoc in JS until shared package exists).

---

## 1. AivosPlugin Interface

\`\`\`typescript
export interface AivosPlugin {
  /** Stable slug, e.g. "resume-ai" */
  id: string;
  version: string;
  displayName: string;

  /** Mount plugin-specific routes (optional) */
  registerRoutes(app: Express, deps: PluginDeps): void;

  /** Subset of 14 pipeline stages this plugin uses */
  getStageGraph(): PipelineStageId[];

  /** Map wizard/API input → pipeline input.json */
  buildInput(raw: unknown, ctx: PluginContext): Promise<InputPayload>;

  /** Billing: credits required per job */
  billing: {
    creditField: 'ai_video_credits'; // growth_entitlements column
    costPerJob: number;
  };

  /** Agent overrides (optional) */
  agents?: Partial<Record<PipelineStageId, string>>;

  /** Permissions required */
  permissions: PluginPermission[];
}
\`\`\`

---

## 2. PluginDeps

\`\`\`typescript
export interface PluginDeps {
  pool: pg.Pool;
  redis: RedisClient;
  kernel: Kernel;
  eventBus: EventBus;
  authenticateToken: RequestHandler;
  growthEngine: typeof import('../../growthEngine.js');
  s3: { uploadToS3: Function };
  /** Feature flags */
  flags: { resumePlugin: boolean };
}
\`\`\`

Plugins receive deps at mount time — **no global singletons**.

---

## 3. Plugin Registry

Table \`aivos_plugin_registry\` (migration 259):

| Column | Type |
|--------|------|
| \`id\` | TEXT PK |
| \`version\` | TEXT |
| \`enabled\` | BOOLEAN |
| \`stage_graph\` | JSONB |
| \`config\` | JSONB |
| \`registered_at\` | TIMESTAMPTZ |

\`\`\`javascript
// backend/lib/aivos/plugins/registry.js
export function registerPlugin(plugin) { /* upsert */ }
export function getPlugin(id) { /* load */ }
export function listPlugins() { /* GET /api/aivos/plugins */ }
\`\`\`

Boot sequence in \`registerAivosRoutes\`:
1. Load registry from DB
2. \`registerPlugin(resumeAiPlugin)\` if flag enabled
3. Call \`plugin.registerRoutes\` for each enabled plugin

---

## 4. resume-ai Adapter (Plugin #1)

Wraps existing services — **no rewrites**.

| Plugin method | Existing code | Notes |
|---------------|---------------|-------|
| \`buildInput\` | \`buildTalentProfileContext\` | Maps users row → input.json |
| analyze stage | \`generateTalentResumeDraft\` | ai-core /v1/talent/resume-draft |
| voice stage | \`talentVideoService\` AI Studio call | character, speed params |
| render stage | \`incubationCompose.composeIncubationOverlay\` | v4 overlay |
| publish stage | \`publishTalentResume\` + profile video URL | greeting_video_url |
| billing | \`getTalentVideoEntitlement\` | 403 AI_VIDEO_LOCKED |
| legacy job | \`createTalentVideoJob\` insert pattern | legacy_job_id link |

Feature flag: \`AIVOS_RESUME_PLUGIN=1\` routes new jobs through pipeline; \`0\` keeps legacy HTTP handlers.

---

## 5. Future Plugins (registered, not implemented Phase 0–3)

| Plugin ID | Product | Stage subset | Priority |
|-----------|---------|--------------|----------|
| \`portfolio-ai\` | Portfolio showcase | all 14 | P4 |
| \`product-ads-ai\` | Merchant product ads | 1–14 minus storyboard | P4 |
| \`marketplace-ai\` | Listing promo | 1–12 | P5 |
| \`service-ai\` | Service provider intro | same as resume-ai | P5 |
| \`interview-ai\` | Mock interview clips | 1–10 + quality | P5 |
| \`course-ai\` | Course teaser | 1–14 | P6 |

Each plugin adds **adapter only** — no new kernel modules.

---

## 6. Permissions

| Permission | Description | Default roles |
|------------|-------------|---------------|
| \`aivos:job:create\` | Create pipeline job | authenticated user |
| \`aivos:job:read\` | Read own jobs | owner |
| \`aivos:brand:write\` | Update brand DNA | owner |
| \`aivos:plugin:admin\` | Enable/disable plugins | admin TOTP |
| \`aivos:publish\` | Publish to public feed | owner + quality pass |

Enforced in route handlers via existing JWT \`sub\` + admin role checks — same as growth routes.

---

## 7. Phase 3 Exit Criteria

- [ ] \`resume-ai\` plugin registered and enabled via flag
- [ ] Parity test: legacy vs plugin output equivalent
- [ ] \`growth_entitlements.ai_video_credits\` decremented once per job
- [ ] Legacy routes still work with flag OFF
- [ ] Tests R01–R05 pass (TEST_PLAN.md)
- [ ] No changes to paymentManager or registrationEvolution

---

*See: VIDEO_PIPELINE_SPEC.md, AI_KERNEL_SPEC.md*
`);

// ─── 5. Event Bus ──────────────────────────────────────────────────────────

OUT('EVENT_BUS_SPEC.md', `# Event Bus Specification

**Version:** 1.0 (Phase 0 Freeze)
**Path:** \`backend/lib/aivos/kernel/eventBus.js\`
**Status:** FROZEN

Loose coupling between pipeline stages, kernel modules, and subscribers. No direct function calls across stage boundaries except through orchestrator.

---

## 1. Event Envelope

\`\`\`json
{
  "id": "evt_uuid",
  "name": "resume-ai.pipeline.stage.completed",
  "version": "1",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "source": "aivos-pipeline",
  "correlation_id": "job_uuid",
  "payload": { "job_id": "...", "stage": "render", "checksum": "abc..." }
}
\`\`\`

| Field | Rule |
|-------|------|
| \`id\` | UUID v4, unique |
| \`name\` | See naming convention §2 |
| \`correlation_id\` | Always \`job_id\` for pipeline events |
| \`payload\` | JSON ≤ 32KB; large artifacts referenced by URL |

---

## 2. Naming Convention

\`{pluginId}.{domain}.{action}\`

| Segment | Examples |
|---------|----------|
| pluginId | \`aivos\`, \`resume-ai\`, \`kernel\` |
| domain | \`pipeline\`, \`quality\`, \`memory\`, \`billing\` |
| action | \`started\`, \`completed\`, \`failed\`, \`retry\` |

Examples: \`aivos.pipeline.completed\`, \`resume-ai.quality.failed\`, \`kernel.infer.completed\`.

---

## 3. Core Events Table

| Event name | Emitter | Payload keys | Phase |
|------------|---------|--------------|-------|
| \`aivos.pipeline.job.created\` | orchestrator | job_id, plugin_id | 2 |
| \`aivos.pipeline.stage.started\` | orchestrator | job_id, stage | 2 |
| \`aivos.pipeline.stage.completed\` | orchestrator | job_id, stage, checksum | 2 |
| \`aivos.pipeline.stage.failed\` | orchestrator | job_id, stage, error | 2 |
| \`aivos.pipeline.completed\` | orchestrator | job_id, published_url? | 2 |
| \`aivos.quality.scored\` | quality engine | job_id, overall, passed | 2 |
| \`aivos.quality.failed\` | quality engine | job_id, retry_stages | 2 |
| \`kernel.infer.completed\` | model router | job_id, task, latency_ms | 1 |
| \`resume-ai.billing.credit.debited\` | plugin adapter | user_id, job_id | 3 |
| \`aivos.schedule.enqueued\` | scheduler | job_id, scheduled_at | 2 |

---

## 4. Transport & Storage

| Layer | Technology |
|-------|------------|
| Hot path | Redis Pub/Sub channel \`aivos:events\` |
| Durable store | \`aivos_events\` table |
| Client stream | SSE \`GET /api/aivos/events\` |

### aivos_events table

| Column | Type |
|--------|------|
| \`id\` | UUID PK |
| \`name\` | TEXT |
| \`correlation_id\` | UUID |
| \`payload\` | JSONB |
| \`created_at\` | TIMESTAMPTZ |

Index: \`(correlation_id, created_at)\`, \`(name, created_at DESC)\`.

Retention: 90 days (cron purge, reuse existing scripts pattern).

---

## 5. SSE API

\`\`\`http
GET /api/aivos/events?job_id=<uuid>
Authorization: Bearer <firebase-jwt>
Accept: text/event-stream
\`\`\`

- Filters events where \`correlation_id = job_id\`
- Sends heartbeat every 15s
- Replays last 20 events from \`aivos_events\` on connect
- AI Studio wizard (Phase 4) consumes this endpoint

---

## 6. Subscribers (in-process)

| Subscriber | Events listened | Action |
|------------|-----------------|--------|
| Timeline indexer | stage.completed | Insert aivos_video_timeline |
| Analytics sink | all | Insert user_intent_events / v2 analytics |
| FCM notifier | pipeline.completed, quality.failed | fcmService push |
| Memory agent | stage.completed | Append episodic memory |
| Billing auditor | billing.credit.debited | Log only (no ledger change) |

Subscribers register via \`eventBus.subscribe(pattern, handler)\`. Wildcard: \`aivos.pipeline.*\`.

---

## 7. Rules

1. **At-least-once delivery** — handlers must be idempotent (check checkpoint exists).
2. **No PII in payload** — use user_id reference only.
3. **Fail open on subscriber error** — log + continue; never block pipeline.
4. **Publish after DB commit** — checkpoint row inserted first, then event.
5. **Plugins emit only via Event Bus** — no custom WebSocket channels.

---

## 8. Phase Exit Criteria

**Phase 1:**
- [ ] Envelope validation + Redis publish
- [ ] Persist to aivos_events
- [ ] kernel.infer.completed emitted

**Phase 2:**
- [ ] All pipeline events in §3 emitted
- [ ] SSE endpoint with job_id filter
- [ ] Timeline + analytics subscribers wired

---

*See: VIDEO_PIPELINE_SPEC.md, AI_KERNEL_SPEC.md*
`);

// ─── 6. Quality Engine ─────────────────────────────────────────────────────

OUT('QUALITY_ENGINE_SPEC.md', `# Quality Engine Specification

**Version:** 1.0 (Phase 0 Freeze)
**Path:** \`backend/lib/aivos/kernel/qualityEngine.js\`
**Status:** FROZEN

Automated rubric scoring before publish. Reuses ai-core rule fallbacks when LLM judge unavailable.

---

## 1. Nine Quality Dimensions (weights sum = 1.0)

| Dimension | Weight | Description |
|-----------|--------|-------------|
| \`visual_coherence\` | 0.15 | Scene style matches Creative Director manifest |
| \`narrative_clarity\` | 0.15 | Story beats understandable |
| \`audio_clarity\` | 0.12 | Voice intelligibility, levels |
| \`subtitle_accuracy\` | 0.10 | Subs match narration |
| \`brand_compliance\` | 0.12 | Colors, logo, tone match Brand DNA |
| \`duration_fit\` | 0.08 | Within max_duration_sec ±10% |
| \`technical_quality\` | 0.10 | Resolution, codec, no glitches |
| \`content_safety\` | 0.10 | No forbidden_topics violations |
| \`engagement_hook\` | 0.08 | First 3s captures attention |

**Pass threshold:** \`overall >= 0.72\`
**Block publish if:** \`content_safety < 0.5\` OR \`technical_quality < 0.4\`

---

## 2. Output Schema

\`\`\`json
{
  "job_id": "uuid",
  "overall": 0.81,
  "passed": true,
  "threshold": 0.72,
  "dimensions": {
    "visual_coherence": 0.85,
    "narrative_clarity": 0.80,
    "audio_clarity": 0.78,
    "subtitle_accuracy": 0.75,
    "brand_compliance": 0.82,
    "duration_fit": 0.90,
    "technical_quality": 0.88,
    "content_safety": 0.95,
    "engagement_hook": 0.70
  },
  "retry_stages": [],
  "judge_model": "hermes3:3b",
  "judged_at": "2026-06-27T12:00:00Z",
  "notes": "Minor hook weakness; acceptable for publish."
}
\`\`\`

Stored in checkpoint \`quality_check\` and \`aivos_quality_scores\`.

---

## 3. Partial Retry Mapping

When \`overall < 0.72\`, map weak dimensions → pipeline stages to re-run:

| Dimension(s) below 0.6 | Retry stages |
|------------------------|--------------|
| visual_coherence | prompt_generation, image_generation |
| narrative_clarity | planning, prompt_generation |
| audio_clarity | voice_generation |
| subtitle_accuracy | subtitle_generation, voice_generation |
| brand_compliance | creative_direction, render |
| duration_fit | planning, render |
| technical_quality | render |
| content_safety | planning, creative_direction (block if still fail) |
| engagement_hook | planning, animation_generation |

Max **2** partial retries per job; then mark \`failed\` with \`quality_exhausted\`.

Orchestrator: \`POST /api/video/jobs/:id/retry?stages=voice_generation,subtitle_generation\`

---

## 4. quality-judge Agent

| Field | Value |
|-------|-------|
| Agent ID | \`quality-judge\` |
| Stage | \`quality_check\` |
| Model task | \`quality_judge\` → hermes3:3b |
| Inputs | draft.mp4 URL, style_manifest, plan.json, brand DNA |
| Fallback | Weighted heuristic on metadata (duration, file size, manifest match) |

Prompt registered in \`aivos_prompt_registry\` as \`quality-judge@v1\`.

---

## 5. aivos_quality_scores Table

| Column | Type |
|--------|------|
| \`id\` | UUID PK |
| \`job_id\` | UUID FK UNIQUE |
| \`overall\` | NUMERIC(4,3) |
| \`passed\` | BOOLEAN |
| \`dimensions\` | JSONB |
| \`retry_count\` | INT DEFAULT 0 |
| \`judge_model\` | TEXT |
| \`created_at\` | TIMESTAMPTZ |

---

## 6. API

| Method | Path | Response |
|--------|------|----------|
| GET | \`/api/aivos/quality/:jobId\` | Latest quality score + retry history |

Internal: \`qualityEngine.evaluate(jobId, draftArtifact)\` called by orchestrator at stage 13.

---

## 7. Events Emitted

| Event | When |
|-------|------|
| \`aivos.quality.scored\` | After successful evaluation |
| \`aivos.quality.failed\` | overall < threshold |
| \`aivos.quality.retry\` | Partial retry scheduled |

FCM handler sends user notification on \`quality.failed\` with retry CTA.

---

*See: VIDEO_PIPELINE_SPEC.md, AI_KERNEL_SPEC.md, EVENT_BUS_SPEC.md*
`);

// ─── 7. Implementation Plan ────────────────────────────────────────────────

OUT('IMPLEMENTATION_PLAN.md', `# AI Video Platform — Implementation Plan

**Version:** 1.0 (Phase 0 Freeze)
**Date:** 2026-06-27
**Code root:** \`backend/lib/aivos/\`
**Migration:** \`259_ai_video_platform.sql\` (new tables only)

Builds on AUDIT.md existing systems. **Out of scope:** payment gateway, registrationEvolution refactors.

---

## Phase 0 — Architecture Freeze (current)

| Item | Deliverable |
|------|-------------|
| Specs | 8 markdown files (this generator) |
| Sign-off | Human approval checklist |

**Estimate:** 2 days (review)
**Gate:** All specs approved → Phase 1 start
**Rollback:** N/A (docs only)

---

## Phase 1 — AI Kernel

| Item | Deliverable |
|------|-------------|
| Package scaffold | \`backend/lib/aivos/kernel/*\` 15 modules |
| DB | Migration 259 (kernel + event tables) |
| APIs | \`/api/aivos/kernel/infer\`, \`/agents\`, \`/brand/*\`, \`/plugins\` |
| Tests | K01–K06 unit tests |
| Integration | Model Router → ai-core; Memory L1/L2 |

**Estimate:** 2 weeks (1 engineer)
**Dependencies:** Phase 0 sign-off, ai-core running
**Gate:** TEST_PLAN K01–K06 green; inference logged
**Rollback:** Remove \`registerAivosRoutes\` mount; drop migration 259 tables if empty

---

## Phase 2 — Video Pipeline

| Item | Deliverable |
|------|-------------|
| Orchestrator | 14-stage runner + checkpoints |
| Queue | \`aivos-video-pipeline\` in queues.js |
| APIs | \`/api/video/jobs/*\`, SSE events |
| Media | ffmpeg render via incubationCompose |
| Mocks | Stages 7–8 placeholder assets OK |

**Estimate:** 3 weeks
**Dependencies:** Phase 1 kernel, Redis, S3
**Gate:** P01–P07; job resumes after worker kill
**Rollback:** Disable queue processor; flag off new job creation

---

## Phase 3 — Resume Plugin

| Item | Deliverable |
|------|-------------|
| Plugin | \`plugins/resume-ai/\` adapter |
| Flag | \`AIVOS_RESUME_PLUGIN=1\` |
| Parity | Legacy vs plugin output test |
| Compat | talent_video_jobs dual-write |

**Estimate:** 2 weeks
**Dependencies:** Phase 2 pipeline, growth_entitlements
**Gate:** R01–R05; legacy routes work with flag OFF
**Rollback:** \`AIVOS_RESUME_PLUGIN=0\` → talentVideoService path

---

## Phase 4 — AI Studio Frontend

| Item | Deliverable |
|------|-------------|
| Mobile | AI Studio 8-step wizard shell |
| Storefront | \`/m/studio/\` BFF proxy |
| UX | Live SSE progress from events API |

**Estimate:** 2 weeks
**Dependencies:** Phase 3 plugin, Phase 2 SSE
**Gate:** F01–F04; wizard completes job E2E
**Rollback:** Hide studio route; deep-link to legacy wizard

---

## Phase 5 — E2E Test Suite

| Item | Deliverable |
|------|-------------|
| Tests | E01–E05 automated suite |
| CI | Jest job in backend pipeline |
| Fixtures | Mock ai-core + ffmpeg stub mode |

**Estimate:** 1 week
**Dependencies:** Phases 1–4
**Gate:** All E tests green on CI
**Rollback:** N/A (tests don't affect prod)

---

## Phase 6 — Performance & Gateway

| Item | Deliverable |
|------|-------------|
| Perf | p95 job latency < 5 min (mock media) |
| Concurrency | 10 parallel jobs stable |
| Kong | Route \`/api/video/*\` |

**Estimate:** 1.5 weeks
**Dependencies:** Phase 5
**Gate:** PF01–PF02 targets met
**Rollback:** Revert Kong route; monolith direct

---

## Phase 7 — Documentation & Production

| Item | Deliverable |
|------|-------------|
| OpenAPI | \`/api/video\`, \`/api/aivos\` specs |
| Runbooks | Deploy, rollback, model outage |
| Checklist | Production readiness sign-off |

**Estimate:** 1 week
**Dependencies:** Phase 6
**Gate:** Runbook reviewed; on-call briefed
**Rollback:** N/A

---

## Dependency Graph

\`\`\`
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
                ↘ Event Bus MVP (Phase 1) ──→ SSE (Phase 2) ──→ Studio (Phase 4)
\`\`\`

## Total Estimate

~14.5 engineering-weeks sequential; Phases 4+5 can overlap partially after Phase 3 gate.

---

*See: TEST_PLAN.md, AI_VIDEO_PLATFORM_ARCHITECTURE.md*
`);

// ─── 8. Test Plan ──────────────────────────────────────────────────────────

OUT('TEST_PLAN.md', `# AI Video Platform — Test Plan

**Version:** 1.0 (Phase 0 Freeze)
**Runner:** Jest (\`backend/lib/aivos/__tests__/\`)
**CI:** Backend pipeline (Phase 5+)

---

## Phase 1 — Kernel Tests (K)

| ID | Test | Pass criteria |
|----|------|---------------|
| K01 | Model Router reasoning task | Returns JSON; logs to ai.inference_log |
| K02 | Model Router writing task | qwen task succeeds or rule fallback |
| K03 | Model Router vision task | moondream describe or graceful skip |
| K04 | Memory L1 working | Redis set/get with TTL |
| K05 | Memory L2 episodic | Write/read hermes_episodic_memory row |
| K06 | Event Bus publish | Event in aivos_events + Redis pub |

---

## Phase 2 — Pipeline Tests (P)

| ID | Test | Pass criteria |
|----|------|---------------|
| P01 | Create job | POST /api/video/jobs → queued status |
| P02 | Stage checkpoints | 14 checkpoints after full run (7–8 mocked OK) |
| P03 | Resume after failure | Kill at stage 6 → retry completes |
| P04 | Render output | draft.mp4 exists on S3; valid h264 |
| P05 | Timeline API | GET timeline returns ordered artifacts |
| P06 | SSE stream | Client receives stage.completed events |
| P07 | Quality gate | Job blocked when overall < 0.72 |

---

## Phase 3 — Resume Plugin Tests (R)

| ID | Test | Pass criteria |
|----|------|---------------|
| R01 | Plugin registration | resume-ai in aivos_plugin_registry |
| R02 | Credit gate | 403 when ai_video_credits = 0 |
| R03 | Legacy parity | Same script+avatar → equivalent MP4 metadata |
| R04 | Dual-write | talent_video_jobs.legacy_job_id linked |
| R05 | Flag rollback | AIVOS_RESUME_PLUGIN=0 uses legacy handler |

---

## Phase 4 — Frontend / Studio Tests (F)

| ID | Test | Pass criteria |
|----|------|---------------|
| F01 | Wizard step flow | 8 steps render without error |
| F02 | SSE progress bar | Updates on stage.completed |
| F03 | Job creation | Wizard POST creates job |
| F04 | Error display | quality.failed shows retry UI |

---

## Phase 5 — End-to-End Tests (E)

| ID | Test | Pass criteria |
|----|------|---------------|
| E01 | Full resume job | Input → published_url on profile |
| E02 | Scheduled job | scheduled_at future → runs at time |
| E03 | Brand DNA | Custom colors appear in manifest |
| E04 | Partial retry | Low audio score → voice regen → pass |
| E05 | Auth rejection | 401 without JWT on all /api/video/* |

---

## Phase 6 — Performance Tests (PF)

| ID | Test | Pass criteria |
|----|------|---------------|
| PF01 | p95 latency | < 5 min with mock media stages |
| PF02 | Concurrency | 10 parallel jobs; 0 deadlocks; all complete |

---

## Test Infrastructure

| Component | Approach |
|-----------|----------|
| ai-core | Mock HTTP server or TEST_AI_CORE_URL |
| ffmpeg | Stub mode env \`AIVOS_FFMPEG_STUB=1\` for unit tests |
| S3 | Local MinIO or mock upload returning fake URL |
| DB | Transaction rollback per test or dedicated test schema |
| Redis | DB 15 test instance |

## Coverage Targets

| Phase | Minimum coverage |
|-------|------------------|
| 1 | kernel/ 80% lines |
| 2 | pipeline/ 75% lines |
| 3 | plugins/resume-ai/ 70% lines |
| 5 | Critical paths E2E 100% pass rate |

---

*See: IMPLEMENTATION_PLAN.md, AI_KERNEL_SPEC.md, VIDEO_PIPELINE_SPEC.md*
`);

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n--- Summary ---');
for (const { name, bytes, skipped } of written) {
  console.log(`${skipped ? 'SKIP' : 'WROTE'}\t${name}\t${bytes} bytes`);
}
console.log(`\nPhase 0 complete: ${written.length} spec files processed`);
