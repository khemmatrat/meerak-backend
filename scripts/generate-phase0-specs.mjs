#!/usr/bin/env node
/**
 * Phase 0: Architecture Freeze — generates 8 spec documents.
 * Run: node scripts/generate-phase0-specs.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = (name, body) => {
  const p = path.join(ROOT, name);
  fs.writeFileSync(p, body.replace(/\r\n/g, '\n'), 'utf8');
  console.log('Wrote', name, fs.statSync(p).size, 'bytes');
};

OUT('AI_VIDEO_PLATFORM_ARCHITECTURE.md', `# AQOND AI Video Platform — Architecture

**Version:** 1.0 (Phase 0 Freeze)  
**Date:** 2026-06-23  
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

**Do not move or delete:** \`talentResumeService.js\`, \`talentVideoService.js\`, \`incubationCompose.js\`, \`growthEngine.js\`, \`queues.js\`, \`registrationEvolution/\`.

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
- \`growth_entitlements\` — credit checks
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

---

## 12. Human Sign-Off

- [ ] Architecture approved
- [ ] DB migration 259 schema approved
- [ ] API surface approved
- [ ] Phase 1 scope approved

**Approved by:** _______________ **Date:** _______________

---

*Next: IMPLEMENTATION_PLAN.md, AI_KERNEL_SPEC.md, VIDEO_PIPELINE_SPEC.md*
`);

OUT('AI_KERNEL_SPEC.md', `# AI Kernel Specification

**Version:** 1.0 (Phase 0 Freeze) | **Path:** backend/lib/aivos/kernel/

Single AI control plane. Plugins never call Ollama/Gemini directly.

## Modules
Model Router, Context Bus, Memory API, Prompt Registry, Task Planner, Agent Registry, Skill Registry, Decision Engine, Event Bus, Quality Engine, Creative Director, Brand DNA, Cost Optimizer, Retry Manager, Checkpoint Manager.

## Model Router (frozen)
reasoning→Hermes, writing→Qwen, vision→Moondream. Claude/GPT config-only. POST /api/aivos/kernel/infer → AI_CORE_URL.

## Memory API
Working Redis, Episode hermes_episodic_memory, Brand aivos_brand_dna, Plugin aivos_memory_plugin.

## Phase 1 Exit
createKernel(), migration 259, unit tests, GET /api/aivos/agents
`);

OUT('VIDEO_PIPELINE_SPEC.md', `# Video Pipeline Specification

14 stages: input→analyze→planning→storyboard→creative_direction→prompt_generation→image_generation→animation_generation→voice_generation→subtitle_generation→music→render→quality_check→publish

Reuse: talentResumeService, talentVideoService, incubationCompose, queues.js, s3-client.

Tables: aivos_workflow_jobs, aivos_workflow_checkpoints. API: /api/video/jobs.

Phase 2: all stages, checkpoint resume, ffmpeg MP4.
`);

OUT('PLUGIN_SDK.md', `# Plugin SDK

Interface: id, registerRoutes, tasks, billing, buildInput. resume-ai wraps existing services. Flag AIVOS_RESUME_PLUGIN=1.
`);

OUT('EVENT_BUS_SPEC.md', `# Event Bus

Redis + aivos_events + SSE /api/aivos/events. Naming: pluginId.domain.action. Subscribers: timeline, analytics, FCM, memory, billing.
`);

OUT('QUALITY_ENGINE_SPEC.md', `# Quality Engine

9 weighted dimensions, threshold 0.72, partial stage retry. Table aivos_quality_scores. Agent quality-judge.
`);

OUT('IMPLEMENTATION_PLAN.md', `# Implementation Plan

Phase 0: Freeze. Phase 1: Kernel. Phase 2: Pipeline. Phase 3: Resume plugin. Phase 4: AI Studio. Phase 5: E2E tests. Phase 6: Perf. Phase 7: Docs. Sequential gates.
`);

OUT('TEST_PLAN.md', `# Test Plan

K01-K06 Kernel. P01-P07 Pipeline. R01-R05 Resume. F01-F04 Studio. E01-E05 E2E. PF01-PF02 Perf. Jest in backend/lib/aivos/__tests__/.
`);

console.log('Phase 0 complete: 8 spec files written');
