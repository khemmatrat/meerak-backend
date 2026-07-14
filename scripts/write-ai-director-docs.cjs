#!/usr/bin/env node
/** Write AI Director planning docs to docs/aqond-os/products/brain/ */
const fs = require('fs');
const path = require('path');

const BRAIN = path.join(__dirname, '..', 'docs', 'aqond-os', 'products', 'brain');
fs.mkdirSync(BRAIN, { recursive: true });

const files = {
  'AI_DIRECTOR_ARCHITECTURE.md': `# AI Director Architecture

**Product:** AQOND Merchant AI Director  
**Status:** Planning (approval pending)  
**Last Updated:** 2026-06-30

---

## Vision

Transform Merchant Ad Studio into **Merchant AI Director**: merchant taps one button; Director orchestrates style, script, shots, voice, subtitles, video, and publish.

\`\`\`
Merchant → AI Director → Style → Script → Shots → Voice → Subtitle → Video → Publish
\`\`\`

**Principle:** Reuse AIVOS merchant-ad, storefront publish, aqond-brain Grok. Add orchestration — do not duplicate.

---

## Current Baseline

| Layer | Location |
|-------|----------|
| UI | storefront MerchantAdStudioClient.tsx |
| Brief | backend briefEngine.js + ai-core merchant-ad-video.js |
| Video | videoEngine.js + grokVideoBridge.js |
| Grok | aqond-brain merchant_ad_shot.py |
| Publish | merchantAdPublishRunner.ts + merchantAdPublish.ts |

---

## Target Components

### AI Director (Orchestrator)
New: \`backend/lib/aivos/merchant-ad/director/\` — accepts DirectorRequest, selects format, runs engines, stores director_plan on job.

### Engines
| Engine | Doc | Reuse |
|--------|-----|-------|
| Script | UGC_SCRIPT_ENGINE.md | New template-first |
| Prompt | UGC_PROMPT_LIBRARY.md | New libraries |
| Style | UGC_STYLE_LIBRARY.md | Extends AD_STYLE_PRESETS |
| Shot | briefEngine OR ugc single | Existing + new |
| Voice | grok_tts_api.py | Phase 5 |
| Subtitle | ffmpeg drawtext | Phase 6 |
| Video | Grok + Ken Burns | Existing + UGCProvider |
| Publish | publish runner | **Existing — no change** |

### Video Provider Interface (future)
\`\`\`ts
interface VideoProvider {
  id: string;
  supports(format: AdFormat): boolean;
  generate(ctx: VideoGenContext): Promise<VideoGenResult>;
}
\`\`\`

Providers: Grok (now), Veo, Runway, Kling (adapters later).

---

## Integration

- Storefront :3003 → proxy → backend :3001 AIVOS merchant-ad
- Director calls ai-core for optional AI gap-fill only
- Grok via aqond-brain spawn (existing pattern)
- Publish via existing background job (Priority 2 complete)

### Planned APIs
- POST /api/aivos/merchant-ad/director/run (one-tap)
- POST /api/aivos/merchant-ad/director/plan (preview)
- Existing generate/publish unchanged (backward compatible)

---

## director_plan (job extension)

\`\`\`json
{
  "format": "ugc_lipsync",
  "style_id": "friendly_seller",
  "category_id": "food",
  "script": { "hook", "pain", "solution", "offer", "cta", "full_text_th" },
  "prompt": { "video": "...", "model": "grok-imagine-video-1.5" },
  "auto_publish": true
}
\`\`\`

Jobs without director_plan = legacy TVC behavior.

---

## Related
- UGC_LIPSYNC_ARCHITECTURE.md
- UGC_PROMPT_LIBRARY.md
- UGC_STYLE_LIBRARY.md
- UGC_SCRIPT_ENGINE.md
- AI_DIRECTOR_ROADMAP.md
`,

  'UGC_LIPSYNC_ARCHITECTURE.md': `# UGC Lip Sync Architecture

**Format:** ugc_lipsync | **Model:** grok-imagine-video-1.5 | **Status:** Planning

---

## Input

| Field | Required |
|-------|----------|
| merchant_id, product_title, category_id, style_id | ✓ |
| portrait_image_url OR product_image_url | ✓ (one) |
| price_thb, promo_text, target_audience | optional |
| auto_publish | optional |

## Output

- output_video_url — 9:16 720p ~10s MP4
- output_poster_url — first frame
- director_plan.script + prompt
- video_engine: grok_ugc_lipsync
- publish.post_id if auto_publish

---

## Prompt Flow

1. Category template (UGC_PROMPT_LIBRARY)
2. Style modifier (UGC_STYLE_LIBRARY)
3. Script Engine → full_text_th
4. Motion: handheld selfie, walk to camera, lip sync
5. GLOBAL_UGC_REQUIREMENTS suffix
6. grok_video_api.generate_video_clip()

---

## API Flow

\`\`\`
POST director/run → createJob → runUGCPipeline (async) → optional publish
GET jobs/:id — unchanged polling
\`\`\`

Interim: POST generate with guide.format=ugc_lipsync

---

## Grok Flow

\`\`\`mermaid
sequenceDiagram
  participant DIR as AI Director
  participant SE as Script Engine
  participant GB as grokVideoBridge
  participant GVA as grok_video_api
  participant XAI as xAI API
  DIR->>SE: BusinessContext
  SE-->>DIR: full_text_th
  DIR->>GB: prompt + portrait 10s
  GB->>GVA: generate_video_clip
  GVA->>XAI: video.generate 9:16 720p
  XAI-->>GVA: mp4 URL
  GVA-->>DIR: normalized mp4
\`\`\`

Params: model grok-imagine-video-1.5, duration 10, aspect 9:16, resolution 720p.

Fallback: Grok no-lipsync → Ken Burns + TTS (Phase 5) → failed.

---

## Publish Flow

Reuse Priority 2: runPublishInBackground → publishMerchantAdToStudioFeed → attachAdVideoToProduct.

---

## End-to-End

\`\`\`mermaid
sequenceDiagram
  actor M as Merchant
  participant UI as Ad Studio
  participant DIR as Director
  participant GROK as xAI
  participant PUB as Publish
  M->>UI: สร้างโฆษณาอัตโนมัติ
  UI->>DIR: DirectorRequest
  DIR->>GROK: UGC lip sync clip
  GROK-->>DIR: completed
  DIR->>PUB: auto_publish
  PUB-->>M: notification
\`\`\`

---

## TVC Coexistence

| | TVC | UGC |
|---|-----|-----|
| Shots | 10 | 1 |
| Duration | ~25s | ~10s |
| Best for | Premium product | Food, services, personal sell |

Director auto-selects by category; merchant can override.

**No production code until approved.**
`,

  'UGC_PROMPT_LIBRARY.md': `# UGC Prompt Library

**Purpose:** Reusable Thai prompt templates — AI fills slots only, not full rewrite every run.  
**Status:** Planning | **Last Updated:** 2026-06-30

---

## Usage

\`\`\`
prompt = TEMPLATE[category].opening
  + slot(product_title, price, promo)
  + TEMPLATE[category].motion
  + script.full_text_th
  + STYLE[style_id].tone_directive
\`\`\`

Slots: \`{product}\` \`{price}\` \`{promo}\` \`{shop}\` \`{benefit}\` \`{cta}\`

---

## หมวดอาหาร (food / restaurant)

**Scene context:**
> ครัวร้านอาหารไทย แสงอุ่น บรรยากาศเป็นกันเอง คนขายยิ้มแย้ม ถือจานอาหาร

**Opening templates:**
- สวัสดีค่ะ วันนี้ร้าน{shop} มี{product} พิเศษมาแนะนำค่ะ
- ใครหิวอยู่ ต้องลอง{product} ของเรานะคะ อร่อยมาก
- แวะทานที่ร้านหรือสั่งเดลิเวอรี่ได้เลยค่ะ

**Script skeleton:**
\`\`\`
{opening} ราคาเพียง {price} บาท {promo}
{benefit: สดใหม่ ปรุงสด รสชาติเข้มข้น}
{cta: สั่งเลยวันนี้ กดสั่งในแอป AQOND}
\`\`\`

**Motion:** handheld selfie, walk toward camera, show dish close-up, natural smile

---

## หมวดร้านเสริมสวย (beauty)

**Scene:** สตูดิโอความงาม แสงนุ่ม กระจก เครื่องสำอาง

**Opening:**
- สวัสดีค่ะ วันนี้มาแนะนำ{product} ที่ร้าน{shop} ค่ะ
- ผิวสวยไม่ต้องแพง ลอง{product} ตัวนี้เลยค่ะ

**Skeleton:**
\`\`\`
{opening} เหมาะกับ{benefit: ผิวแห้ง ผิวแพ้ง่าย}
ราคา {price} บาท {promo}
{cta: ทักแชทสั่งได้เลย หรือกดซื้อในร้าน}
\`\`\`

---

## หมวดช่าง (home_services / technician)

**Scene:** หน้างานบ้านลูกค้า ชุดช่าง อุปกรณ์ครบ

**Opening:**
- สวัสดีครับ ช่าง{shop} รับงาน{product} ทั่วกรุงเทพครับ
- มีปัญหา{benefit: น้ำรั่ว ไฟดับ แอร์ไม่เย็น} ทักมาได้เลยครับ

**Skeleton:**
\`\`\`
{opening} ประเมินหน้างานฟรี ราคาเริ่ม {price} บาท
{promo} งานจบ รับประกัน{benefit}
{cta: โทรหรือกดจองช่างในแอป}
\`\`\`

---

## หมวดบริการ (services)

**Scene:** ออฟฟิศ / ร้านบริการ สะอาด เป็นมืออาชีพ

**Opening:**
- สวัสดีค่ะ {shop} เปิดให้บริการ{product} แล้วนะคะ
- ไม่มีเวลา? ให้เราดูแล{product} แทนคุณได้ค่ะ

---

## หมวดอสังหา (real_estate)

**Scene:** หน้าทาวน์โฮม/คอนโด แสงธรรมชาติ

**Opening:**
- สวัสดีครับ วันนี้มี{product} ทำเลดี ราคาพิเศษ
- อยากมีบ้านในฝัน เริ่มต้นเพียง {price} ล้าน

**CTA:** นัดชมโครงการฟรี ทักไลน์หรือกดดูในแอป

---

## หมวดรถยนต์ (automotive)

**Scene:** โชว์รูม / ลานรถ กลางแจ้ง

**Opening:**
- สวัสดีครับ วันนี้แนะนำ{product} สภาพสวย ไมล์น้อย
- ผ่อนเริ่ม {price} บาท/เดือน {promo}

---

## หมวดแฟชั่น (fashion / marketplace)

**Scene:** หน้าร้าน / สตูดิโอถ่ายแฟชั่น

**Opening:**
- สวัสดีค่ะ ของใหม่มาแล้ว {product} ใส่แล้วดูดีทันที
- ราคา {price} บาท {promo} มีไซส์ครบ

---

## หมวดสุขภาพ (healthcare)

**Scene:** คลินิก / ร้านยา สะอาด น่าเชื่อถือ

**Opening:**
- สวัสดีค่ะ ดูแลสุขภาพด้วย{product} ที่{shop}
- ปรึกษาเภสัชกรฟรี สั่งออนไลน์ได้ค่ะ

**Note:** หลีกเลี่ยงคำ claim รักษาโรค — ใช้ "ช่วยดูแล" "สนับสนุน"

---

## Marketplace (general)

**Opening:**
- สวัสดีค่ะ วันนี้ร้าน{shop} ลดราคา{product}
- ของดีราคาถูก {price} บาท ส่งฟรี {promo}

---

## Recruitment (จ้างงาน)

**Opening:**
- สวัสดีครับ {shop} รับสมัคร{product} หลายอัตรา
- เงินเดือนเริ่ม {price} บาท {promo: โบนัส ประกันสังคม}

---

## CTA Bank (reuse)

| id | Thai |
|----|------|
| order_now | สั่งเลยวันนี้ กดสั่งในแอป AQOND |
| dm | ทักแชทสอบถามได้เลยค่ะ |
| visit | แวะมาที่ร้านได้ทุกวัน |
| book | กดจองคิวในแอปได้เลย |
| call | โทรหาเราได้ตลอด 24 ชม. |

---

## Rules

1. Max spoken length: **80 words** (~10s lip sync)
2. No medical/legal guarantees
3. Price must match catalog when provided
4. Templates are versioned; changes go through DECISIONS.md
`,

  'UGC_STYLE_LIBRARY.md': `# UGC Style Library

**Purpose:** Reusable director presets — motion, tone, camera, persona.  
**Status:** Planning | **Last Updated:** 2026-06-30

---

## Preset Schema

\`\`\`json
{
  "id": "friendly_seller",
  "label_th": "คนขายเป็นกันเอง",
  "emoji": "😊",
  "motion_prefix": "handheld selfie, slight walk toward camera",
  "tone_directive": "warm, friendly, casual Thai",
  "camera": "phone selfie, natural shake",
  "persona": "local shop owner",
  "default_format": "ugc_lipsync",
  "voice_hint": "female_warm"
}
\`\`\`

---

## Preset 01 — Friendly Seller

| Field | Value |
|-------|-------|
| id | friendly_seller |
| label | คนขายเป็นกันเอง |
| Motion | handheld selfie, smile, show product at chest level |
| Tone | อบอุ่น เป็นกันเอง ลงท้าย "นะคะ/ครับ" |
| Best categories | food, marketplace, general |

---

## Preset 02 — TikTok Creator

| Field | Value |
|-------|-------|
| id | tiktok_creator |
| Motion | fast energy, quick zoom, trend-style cuts feel in one take |
| Tone | สดใส ตื่นเต้น ใช้คำฮิต "ปังมาก" "ต้องลอง" |
| Best categories | fashion, beauty, marketplace |

---

## Preset 03 — Luxury Brand

| Field | Value |
|-------|-------|
| id | luxury_brand |
| Motion | slow dolly, soft lighting, minimal gesture |
| Tone | สุภาพ หรูหรา ประโยคสั้น |
| default_format | tvc_multi_shot (prefer TVC over UGC) |
| Best categories | fashion, skincare, electronics |

---

## Preset 04 — Restaurant Owner

| Field | Value |
|-------|-------|
| id | restaurant_owner |
| Motion | kitchen background, hold plate toward camera, steam visible |
| Tone | ภูมิใจในสูตรอาหาร ชวนทานที่ร้าน |
| Best categories | food |

---

## Preset 05 — Beauty Influencer

| Field | Value |
|-------|-------|
| id | beauty_influencer |
| Motion | ring-light look, apply/show product near face |
| Tone | แนะนำเพื่อน บอกผลลัพธ์ที่เห็นจริง |
| Best categories | beauty, healthcare |

---

## Preset 06 — Professional Consultant

| Field | Value |
|-------|-------|
| id | professional_consultant |
| Motion | stable framing, office or site background, confident posture |
| Tone | น่าเชื่อถือ เป็นมืออาชีพ ไม่โอ้อวด |
| Best categories | services, real_estate, automotive, technician |

---

## Director Selection Matrix

| category_id | default_style | fallback_format |
|-------------|---------------|-----------------|
| food | restaurant_owner | ugc_lipsync |
| beauty | beauty_influencer | ugc_lipsync |
| fashion | tiktok_creator | ugc_lipsync |
| services | professional_consultant | ugc_lipsync |
| real_estate | professional_consultant | ugc_lipsync |
| automotive | professional_consultant | ugc_lipsync |
| healthcare | professional_consultant | ugc_lipsync |
| marketplace | friendly_seller | ugc_lipsync |
| general | friendly_seller | ugc_lipsync |

Merchant override: UI style chip → style_id

---

## Mapping from Current AD_STYLE_PRESETS

| Current (TVC mood) | Maps to UGC style |
|--------------------|-------------------|
| premium | luxury_brand |
| energetic | tiktok_creator |
| discount | friendly_seller |
| natural | restaurant_owner / friendly_seller |
| new | tiktok_creator |

---

## Future Presets (reserved IDs)

- flash_sale_host
- live_commerce_host
- corporate_spokesperson
- korean_beauty_style

Add via JSON file: \`backend/lib/aivos/merchant-ad/data/ugc-styles.json\`
`,

  'UGC_SCRIPT_ENGINE.md': `# UGC Script Engine

**Purpose:** Deterministic Thai ad scripts from business inputs — Hook → Pain → Solution → Offer → CTA.  
**Status:** Planning | **Last Updated:** 2026-06-30

---

## Pipeline

\`\`\`
Input (product, price, promo, category, audience, style)
    ↓
Business Context Resolver
    ↓
Category Template (UGC_PROMPT_LIBRARY)
    ↓
Style Modifier (UGC_STYLE_LIBRARY)
    ↓
Hook Generator (template slot)
    ↓
Pain Point (category default or audience rule)
    ↓
Solution (product + benefit)
    ↓
Offer (price + promo)
    ↓
Call To Action (CTA bank)
    ↓
Final Script (full_text_th) + segments JSON
\`\`\`

---

## Input Schema

\`\`\`typescript
interface ScriptEngineInput {
  product_title: string;
  price_thb?: number;
  promo_text?: string;
  category_id: string;
  style_id: string;
  target_audience?: 'all' | 'women' | 'men' | 'office' | 'family' | 'students';
  shop_name?: string;
  benefits?: string[];      // from product draft or merchant
  pain_override?: string;   // optional merchant edit
  hook_override?: string;
}
\`\`\`

---

## Output Schema

\`\`\`typescript
interface ScriptEngineOutput {
  hook: string;
  pain: string;
  solution: string;
  offer: string;
  cta: string;
  full_text_th: string;     // spoken script for lip sync
  word_count: number;
  estimated_sec: number;    // ~10
  segments: { id: string; text: string; order: number }[];
  source: 'template' | 'template+ai' | 'ai';
}
\`\`\`

---

## Segment Rules

| Segment | Max words | Template source |
|---------|-----------|-----------------|
| hook | 15 | category.opening[hash(product)%n] |
| pain | 12 | PAIN_BANK[category][audience] |
| solution | 15 | product_title + benefits[0] |
| offer | 10 | price + promo |
| cta | 8 | CTA_BANK[style or category] |

**full_text_th** = join segments with natural Thai connectors (\"เลยค่ะ\", \"และ\", \"วันนี้\")

---

## Pain Point Bank (examples)

| category | audience | pain |
|----------|----------|------|
| food | office | ทำงานหนักไม่มีเวลาทำอาหาร |
| food | family | อยากทานอร่อยแต่ไม่อยากออกไปข้างนอก |
| beauty | women | ผิวหมองคล้ำ แต่งหน้าไม่ติด |
| services | all | หาช่างไว้ใจได้ยาก |
| real_estate | family | อยากมีบ้านแต่งบจำกัด |
| automotive | all | อยากได้รถดีในราคาที่จับต้องได้ |
| fashion | students | อยากแต่งตัวสวยในงบน้อย |
| healthcare | all | อยากดูแลสุขภาพแต่ไม่รู้จะเริ่มยังไง |

---

## AI Role (minimal)

AI **only** when:
- benefits[] empty → ai-core fill one benefit (optional)
- pain_override missing AND no PAIN_BANK hit

Default: **source = template** (no LLM call = faster, cheaper, consistent)

Endpoint (planned): POST ai-core /v1/merchant/ad-script

---

## Example Output (food)

**Input:** ข้าวมันไก่พิเศษ, 89฿, ลด10%, food, restaurant_owner

\`\`\`json
{
  "hook": "สวัสดีค่ะ วันนี้ร้านเรามีข้าวมันไก่พิเศษมาแนะนำค่ะ",
  "pain": "ทำงานหนักไม่มีเวลาทำอาหาร",
  "solution": "ข้าวมันไก่หอมๆ เนื้อนุ่ม น้ำจิ้มร้านทำเอง",
  "offer": "ราคาเพียง 89 บาท ลด 10% วันนี้",
  "cta": "สั่งเลยวันนี้ กดสั่งในแอป AQOND",
  "full_text_th": "สวัสดีค่ะ วันนี้ร้านเรามีข้าวมันไก่พิเศษมาแนะนำค่ะ ทำงานหนักไม่มีเวลาทำอาหาร ข้าวมันไก่หอมๆ เนื้อนุ่ม น้ำจิ้มร้านทำเอง ราคาเพียง 89 บาท ลด 10% วันนี้ สั่งเลยวันนี้ กดสั่งในแอป AQOND",
  "word_count": 42,
  "estimated_sec": 10,
  "source": "template"
}
\`\`\`

---

## Validation

- word_count ≤ 80 (reject or trim)
- price matches input when provided
- no banned words (medical cure claims)
- Thai ending particles match style (ครับ/ค่ะ)

---

## Implementation Location (future)

\`backend/lib/aivos/merchant-ad/scriptEngine.js\`  
Data: \`data/ugc-prompts.json\`, \`data/ugc-pains.json\`, \`data/ugc-ctas.json\`
`,

  'AI_DIRECTOR_ROADMAP.md': `# AI Director Roadmap

**Status:** Planning | **Last Updated:** 2026-06-30  
**Prerequisite:** Architecture docs approved — no production code until sign-off

---

## Phase Overview

| Phase | Title | Complexity | Depends on |
|-------|-------|------------|------------|
| 1 | Architecture | Done (this session) | — |
| 2 | Prompt Engine | Medium | Phase 1 |
| 3 | Script Engine | Medium | Phase 2 |
| 4 | UGC Lip Sync | High | Phase 2–3 |
| 5 | Voice | Medium | Phase 4 |
| 6 | Subtitle | Medium | Phase 4–5 |
| 7 | Publishing | Low | Phase 4 (reuse existing) |
| 8 | Optimization | Ongoing | All |

---

## Phase 1 — Architecture ✓

**Deliverables:** AI_DIRECTOR_ARCHITECTURE, UGC_LIPSYNC_ARCHITECTURE, libraries, SCRIPT_ENGINE, ROADMAP

**Risks:** Scope creep into multi-provider too early  
**Mitigation:** Grok-only MVP for UGC

---

## Phase 2 — Prompt Engine

**Goal:** Load versioned JSON libraries; compose Grok prompt from category + style + slots.

**Tasks:**
- Create data/ugc-prompts.json, ugc-styles.json
- promptEngine.js composePrompt()
- Unit tests: snapshot prompts per category

**Deliverables:** Working prompt composition, no video yet  
**Complexity:** M (3–5 days)  
**Risks:** Prompt drift — use golden files in tests

---

## Phase 3 — Script Engine

**Goal:** Template-first script generation; optional ai-core gap fill.

**Tasks:**
- scriptEngine.js + pain/cta banks
- ai-core POST /v1/merchant/ad-script (optional)
- Wire to director_plan.script

**Deliverables:** API returns script JSON from merchant inputs  
**Complexity:** M (3–5 days)  
**Risks:** Thai particle gender — derive from style or merchant profile

---

## Phase 4 — UGC Lip Sync Video

**Goal:** Single-clip Grok generation end-to-end.

**Tasks:**
- ugcEngine.js + merchant_ad_ugc.py (10s duration)
- grok_video_api model 1.5 flag
- videoEngine format switch ugc_lipsync vs tvc
- Director orchestrator MVP
- UI: one-tap button + progress stages

**Deliverables:** mad-* job with grok_ugc_lipsync engine  
**Complexity:** H (7–10 days)  
**Risks:** xAI latency/cost; lip sync quality  
**Mitigation:** 1 retry, Ken Burns fallback flag

---

## Phase 5 — Voice

**Goal:** TTS when lip sync insufficient; voice selection in Director.

**Tasks:**
- Integrate grok_tts_api.py or platform TTS
- voiceEngine.js adapter
- Director step: pick voice by style.voice_hint

**Deliverables:** Fallback audio track muxed with ffmpeg  
**Complexity:** M (4–6 days)  
**Depends:** Phase 4

---

## Phase 6 — Subtitle

**Goal:** Burn-in Thai subtitles from script segments.

**Tasks:**
- subtitleEngine.js — segment timing by word count
- ffmpeg ass/drawtext filter
- Optional WebVTT sidecar

**Deliverables:** Subtitled MP4 variant  
**Complexity:** M (3–5 days)

---

## Phase 7 — Publishing

**Goal:** Wire Director auto_publish to existing pipeline.

**Tasks:**
- director auto_publish flag
- Product auto-create from script (reuse merchantAdProductDraft)
- E2E: generate → publish → PDP video

**Deliverables:** One-tap to live feed  
**Complexity:** L (2–3 days) — **mostly done (Priority 2)**  
**Reuse:** merchantAdPublishRunner.ts 100%

---

## Phase 8 — Optimization

- A/B script variants
- Provider adapters (Veo, Runway, Kling)
- Analytics on director_plan → conversion
- Credit budgeting per merchant tier
- Caching templates per category

**Complexity:** Ongoing

---

## Recommended Implementation Order

1. Phase 2 Prompt Engine (libraries in JSON)
2. Phase 3 Script Engine (deterministic Thai)
3. Phase 4 UGC Lip Sync (Grok single clip)
4. Phase 7 Publishing integration (auto_publish)
5. Phase 5 Voice (fallback)
6. Phase 6 Subtitle
7. Phase 8 Optimization + extra providers

---

## Reuse Summary

| Existing | Use for |
|----------|---------|
| grokVideoBridge.js | Spawn pattern |
| merchantAdPublishRunner.ts | Auto publish |
| briefEngine.js | TVC path unchanged |
| tokenEngine.js | Billing |
| MerchantAdJobBanner | Director progress |
| ai-core merchant-ad-video.js | Extend not replace |

---

## Approval Gate

Before Phase 2 code:
- [ ] User approves architecture
- [ ] UGC vs TVC default matrix confirmed
- [ ] xAI budget per clip agreed (~$0.10–0.50)
`,
};

for (const [name, content] of Object.entries(files)) {
  const p = path.join(BRAIN, name);
  fs.writeFileSync(p, content, 'utf8');
  console.log('wrote:', name);
}

console.log('done:', BRAIN);
