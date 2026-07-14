import express from "express";
import crypto from "crypto";
import pg from "pg";
import { chat, generate, ollamaHealth } from "./lib/ollama-client.js";
import { visionPrompt, structuredPrompt } from "./lib/prompts/onboard-product.js";
import { slaJudgePrompt, ruleBasedSlaVerdict } from "./lib/prompts/sla-judge.js";
import { liveCloserPrompt, ruleBasedLiveCloser } from "./lib/prompts/live-closer.js";
import { crewRerankPrompt, rulesCrewRerank } from "./lib/prompts/crew-rerank.js";
import { addressParsePrompt, ruleBasedAddressParse } from "./lib/prompts/address-parse.js";
import { ocrSlipPrompt, ruleBasedOcrSlip } from "./lib/prompts/ocr-slip.js";
import { liveFaqPrompt, ruleBasedLiveFaq } from "./lib/prompts/live-faq.js";
import { jarvisConciergePrompt, ruleBasedJarvis } from "./lib/prompts/jarvis-concierge.js";
import { incubationBriefPrompt, ruleBasedIncubationBrief } from "./lib/prompts/incubation-brief.js";
import {
  talentResumeHermesPrompt,
  talentResumeQwenPrompt,
  ruleBasedResumeDraft,
} from "./lib/prompts/talent-resume-draft.js";
import { merchantAdBriefPrompt, ruleBasedAdBrief } from "./lib/prompts/merchant-ad-video.js";
import { validateProductOnboard, validateSlaJudge, validateLiveCloser, validateCrewRerank, parseJsonFromLlm, normalizeProductOnboard } from "./lib/schema-validator.js";
import { assertProdSecrets } from "./lib/prod-guard.js";

const app = express();
app.use(express.json({ limit: "15mb" }));

const PORT = Number(process.env.PORT || 8100);
const API_KEY = process.env.AI_CORE_API_KEY || "";

assertProdSecrets([{ name: "AI_CORE_API_KEY", value: API_KEY }]);
const OLLAMA_MODEL_CHAT = process.env.OLLAMA_MODEL_CHAT || "hermes3:3b";
const OLLAMA_MODEL_PROSE = process.env.OLLAMA_MODEL_PROSE || process.env.OLLAMA_MODEL_QWEN || "qwen2.5:7b-instruct";
const OLLAMA_MODEL_VISION = process.env.OLLAMA_MODEL_VISION || "moondream";

const pool = new pg.Pool({
  host: process.env.PGHOST || "aqond-db",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "ai",
});

let activeInferences = 0;
const MAX_CONCURRENT = Number(process.env.AI_MAX_CONCURRENT || 1);

function auth(req, res, next) {
  const key = req.headers["x-ai-core-api-key"] || "";
  if (!API_KEY || key === API_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

async function logInference({ task, model, promptHash, latencyMs, success, errorMsg, metadata }) {
  try {
    await pool.query(
      `INSERT INTO ai.inference_log (task, model, prompt_hash, latency_ms, success, error_msg, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [task, model, promptHash, latencyMs, success, errorMsg || null, JSON.stringify(metadata || {})],
    );
  } catch (e) {
    console.warn("[ai-core] audit log failed:", e.message);
  }
}

app.get("/health", async (_req, res) => {
  const ollama = await ollamaHealth();
  res.json({
    ok: true,
    service: "ai-core",
    ollama,
    models: { chat: OLLAMA_MODEL_CHAT, prose: OLLAMA_MODEL_PROSE, vision: OLLAMA_MODEL_VISION },
    queue: { active: activeInferences, max: MAX_CONCURRENT },
  });
});

/** POST /v1/vision/describe — vision only (lighter, for visual search) */
app.post("/v1/vision/describe", auth, async (req, res) => {
  if (activeInferences >= MAX_CONCURRENT) {
    return res.status(429).json({ error: "queue_full", message: "Retry in 30-120s." });
  }

  const { image_base64, merchant_hint = "" } = req.body || {};
  if (!image_base64) {
    return res.status(400).json({ error: "image_base64 required" });
  }

  activeInferences += 1;
  const started = Date.now();
  try {
    const visionText = await chat({
      model: OLLAMA_MODEL_VISION,
      messages: [{ role: "user", content: visionPrompt(merchant_hint) }],
      images: [String(image_base64).replace(/^data:image\/\w+;base64,/, "")],
      keepAlive: "0",
    });
    res.json({
      ok: true,
      vision_description: visionText,
      model: OLLAMA_MODEL_VISION,
      latency_ms: Date.now() - started,
    });
  } catch (e) {
    console.error("[ai-core] vision/describe error:", e);
    res.status(502).json({ error: "inference_failed", detail: e.message });
  } finally {
    activeInferences -= 1;
  }
});

/** POST /v1/onboard/product — vision + Hermes structured JSON */
app.post("/v1/onboard/product", auth, async (req, res) => {
  if (activeInferences >= MAX_CONCURRENT) {
    return res.status(429).json({
      error: "queue_full",
      message: "CPU PoC: max concurrent inferences reached. Retry in 30-120s.",
    });
  }

  const { image_base64, image_url, merchant_hint = "", llm_output } = req.body || {};

  // Rules-only path for Hermes / smoke tests when vision input is omitted
  if (llm_output && typeof llm_output === "object" && !image_base64 && !image_url) {
    const title = String(llm_output.title || merchant_hint || "สินค้าใหม่").slice(0, 120);
    const product = normalizeProductOnboard({
      title,
      category: llm_output.category || "general",
      price_thb: Number(llm_output.price_thb || 99),
      inventory: Number(llm_output.inventory || 1),
      description: llm_output.description || `${title} — สินค้าคุณภาพ จัดส่งเร็ว`,
      tags: Array.isArray(llm_output.tags) ? llm_output.tags : ["th", "marketplace"],
    });
    const check = validateProductOnboard(product);
    if (!check.valid) {
      return res.status(422).json({ error: "llm_validation_failed", detail: check.errors.join("; ") });
    }
    return res.json({
      ok: true,
      product: { ...product, price: product.price_thb, image_uris: [] },
      source: "rules",
      latency_ms: 0,
    });
  }

  let imageB64 = image_base64;

  if (!imageB64 && image_url) {
    try {
      const imgRes = await fetch(image_url);
      if (!imgRes.ok) return res.status(400).json({ error: "image_fetch_failed" });
      const buf = Buffer.from(await imgRes.arrayBuffer());
      imageB64 = buf.toString("base64");
    } catch (e) {
      return res.status(400).json({ error: "image_fetch_failed", detail: e.message });
    }
  }

  if (!imageB64) {
    return res.status(400).json({ error: "image_base64 or image_url required" });
  }

  activeInferences += 1;
  const started = Date.now();
  const promptHash = crypto.createHash("sha256").update(String(merchant_hint)).digest("hex").slice(0, 16);

  try {
    const visionStart = Date.now();
    const visionText = await chat({
      model: OLLAMA_MODEL_VISION,
      messages: [
        { role: "user", content: visionPrompt(merchant_hint) },
      ],
      images: [imageB64.replace(/^data:image\/\w+;base64,/, "")],
      keepAlive: "0",
    });
    const visionMs = Date.now() - visionStart;

    let product = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await generate({
          model: OLLAMA_MODEL_CHAT,
          prompt: structuredPrompt(visionText, merchant_hint, attempt > 0 ? lastError?.message : ""),
          format: "json",
        });
        product = normalizeProductOnboard(parseJsonFromLlm(raw));
        const check = validateProductOnboard(product);
        if (!check.valid) throw new Error(check.errors.join("; "));
        break;
      } catch (e) {
        lastError = e;
        product = null;
      }
    }

    if (!product) {
      await logInference({
        task: "onboard_product",
        model: OLLAMA_MODEL_CHAT,
        promptHash,
        latencyMs: Date.now() - started,
        success: false,
        errorMsg: lastError?.message,
        metadata: { vision_ms: visionMs },
      });
      return res.status(422).json({ error: "llm_validation_failed", detail: lastError?.message });
    }

    const latencyMs = Date.now() - started;
    await logInference({
      task: "onboard_product",
      model: `${OLLAMA_MODEL_VISION}+${OLLAMA_MODEL_CHAT}`,
      promptHash,
      latencyMs,
      success: true,
      metadata: { vision_ms: visionMs, title: product.title },
    });

    res.json({
      ok: true,
      product: {
        ...product,
        price: product.price_thb,
        image_uris: image_url ? [image_url] : [],
      },
      vision_description: visionText,
      latency_ms: latencyMs,
      note: "CPU PoC: expect 30-120s per product; move OLLAMA_HOST to GPU server for prod",
    });
  } catch (e) {
    await logInference({
      task: "onboard_product",
      model: OLLAMA_MODEL_VISION,
      promptHash,
      latencyMs: Date.now() - started,
      success: false,
      errorMsg: e.message,
    });
    console.error("[ai-core] onboard error:", e);
    res.status(502).json({ error: "inference_failed", detail: e.message });
  } finally {
    activeInferences -= 1;
  }
});

/** GET /v1/audit/recent — inference audit log (onboard, SLA, live closer) */
app.get("/v1/audit/recent", auth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const task = req.query.task ? String(req.query.task) : null;
  try {
    const params = task ? [task, limit] : [limit];
    const sql = task
      ? `SELECT id, task, model, prompt_hash, latency_ms, success, error_msg, metadata, created_at
         FROM ai.inference_log WHERE task = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT id, task, model, prompt_hash, latency_ms, success, error_msg, metadata, created_at
         FROM ai.inference_log ORDER BY created_at DESC LIMIT $1`;
    const { rows } = await pool.query(sql, params);
    res.json({ ok: true, count: rows.length, entries: rows });
  } catch (e) {
    res.status(500).json({ error: "audit_query_failed", detail: e.message });
  }
});

/** POST /v1/sla/judge — P6 n8n SLA breach (Hermes + rules fallback) */
app.post("/v1/sla/judge", auth, async (req, res) => {
  const payload = req.body || {};
  const useRulesOnly = process.env.SLA_USE_RULES_ONLY === "1";
  const started = Date.now();
  const promptHash = crypto
    .createHash("sha256")
    .update(String(payload.order_id || "sla"))
    .digest("hex")
    .slice(0, 16);

  if (useRulesOnly) {
    const verdict = ruleBasedSlaVerdict(payload);
    await logInference({
      task: "sla_judge",
      model: "rules",
      promptHash,
      latencyMs: Date.now() - started,
      success: true,
      metadata: { order_id: payload.order_id, source: "rules" },
    });
    return res.json({ ok: true, source: "rules", verdict });
  }

  try {
    const raw = await generate({
      model: OLLAMA_MODEL_CHAT,
      prompt: slaJudgePrompt(payload),
      format: "json",
    });
    let verdict = parseJsonFromLlm(raw);
    const check = validateSlaJudge(verdict);
    if (!check.valid) {
      verdict = ruleBasedSlaVerdict(payload);
      verdict.fallback_reason = check.errors.join("; ");
    } else {
      verdict.source = "hermes";
    }

    await logInference({
      task: "sla_judge",
      model: OLLAMA_MODEL_CHAT,
      promptHash,
      latencyMs: Date.now() - started,
      success: true,
      metadata: { order_id: payload.order_id, recommend_refund: verdict.recommend_refund },
    });

    res.json({ ok: true, source: verdict.source || "hermes", verdict });
  } catch (e) {
    const verdict = ruleBasedSlaVerdict(payload);
    await logInference({
      task: "sla_judge",
      model: OLLAMA_MODEL_CHAT,
      promptHash,
      latencyMs: Date.now() - started,
      success: false,
      errorMsg: e.message,
      metadata: { order_id: payload.order_id, fallback: "rules" },
    });
    res.json({
      ok: true,
      source: "rules_fallback",
      verdict,
      inference_error: e.message,
    });
  }
});

/** POST /v1/live/closer — P5 voice live sales agent (Hermes + rules fallback) */
app.post("/v1/live/closer", auth, async (req, res) => {
  const context = req.body || {};
  const useRulesOnly = process.env.VOICE_USE_RULES_ONLY === "1" || process.env.SLA_USE_RULES_ONLY === "1";
  const started = Date.now();
  const promptHash = crypto
    .createHash("sha256")
    .update(String(context.session_id || context.user_message || "closer"))
    .digest("hex")
    .slice(0, 16);

  if (useRulesOnly) {
    const verdict = ruleBasedLiveCloser(context);
    await logInference({
      task: "live_closer",
      model: "rules",
      promptHash,
      latencyMs: Date.now() - started,
      success: true,
      metadata: { session_id: context.session_id, should_order: verdict.should_create_order },
    });
    return res.json({ ok: true, source: "rules", closer: verdict });
  }

  try {
    const raw = await generate({
      model: OLLAMA_MODEL_CHAT,
      prompt: liveCloserPrompt(context),
      format: "json",
    });
    let closer = parseJsonFromLlm(raw);
    const check = validateLiveCloser(closer);
    if (!check.valid) {
      closer = ruleBasedLiveCloser(context);
      closer.fallback_reason = check.errors.join("; ");
    } else {
      closer.source = "hermes";
      if (!closer.product_id && context.external_id) closer.product_id = context.external_id;
    }

    await logInference({
      task: "live_closer",
      model: OLLAMA_MODEL_CHAT,
      promptHash,
      latencyMs: Date.now() - started,
      success: true,
      metadata: {
        session_id: context.session_id,
        should_order: closer.should_create_order,
      },
    });

    res.json({ ok: true, source: closer.source || "hermes", closer });
  } catch (e) {
    const closer = ruleBasedLiveCloser(context);
    await logInference({
      task: "live_closer",
      model: OLLAMA_MODEL_CHAT,
      promptHash,
      latencyMs: Date.now() - started,
      success: false,
      errorMsg: e.message,
      metadata: { session_id: context.session_id, fallback: "rules" },
    });
    res.json({
      ok: true,
      source: "rules_fallback",
      closer,
      inference_error: e.message,
    });
  }
});

/** POST /v1/crew/rerank — P7 CrewAI-style stream/product re-ranking */
app.post("/v1/crew/rerank", auth, async (req, res) => {
  const { entity_type = "stream", candidates = [], context = {} } = req.body || {};
  const useRulesOnly =
    process.env.CREW_USE_RULES_ONLY === "1" || process.env.VOICE_USE_RULES_ONLY === "1";
  const started = Date.now();
  const promptHash = crypto.createHash("sha256").update(entity_type).digest("hex").slice(0, 16);

  if (!Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: "candidates array required" });
  }

  if (useRulesOnly) {
    const result = rulesCrewRerank({ entity_type, candidates });
    await logInference({
      task: "crew_rerank",
      model: "rules",
      promptHash,
      latencyMs: Date.now() - started,
      success: true,
      metadata: { entity_type, count: candidates.length },
    });
    return res.json({ ok: true, source: "rules", ...result });
  }

  try {
    const raw = await generate({
      model: OLLAMA_MODEL_CHAT,
      prompt: crewRerankPrompt({ entity_type, candidates, context }),
      format: "json",
    });
    let result = parseJsonFromLlm(raw);
    const check = validateCrewRerank(result);
    if (!check.valid) {
      result = rulesCrewRerank({ entity_type, candidates });
      result.fallback_reason = check.errors.join("; ");
    } else {
      result.source = "hermes_crew";
    }

    await logInference({
      task: "crew_rerank",
      model: OLLAMA_MODEL_CHAT,
      promptHash,
      latencyMs: Date.now() - started,
      success: true,
      metadata: { entity_type, count: result.ranked?.length },
    });

    res.json({ ok: true, source: result.source || "hermes_crew", ...result });
  } catch (e) {
    const result = rulesCrewRerank({ entity_type, candidates });
    await logInference({
      task: "crew_rerank",
      model: OLLAMA_MODEL_CHAT,
      promptHash,
      latencyMs: Date.now() - started,
      success: false,
      errorMsg: e.message,
      metadata: { entity_type, fallback: "rules" },
    });
    res.json({
      ok: true,
      source: "rules_fallback",
      ...result,
      inference_error: e.message,
    });
  }
});

/** POST /v1/moderate/media — P38 content moderation gate (vision stub + rules) */
app.post("/v1/moderate/media", auth, async (req, res) => {
  const { media_id, stub_safe = true } = req.body || {};
  const started = Date.now();
  const promptHash = crypto.createHash("sha256").update(`moderate:${media_id}`).digest("hex").slice(0, 16);

  // dev-lite: rules-first; vision optional when image provided
  const labels = [];
  let score = 0.1;
  let safe = stub_safe !== false;

  if (req.body?.image_base64) {
    try {
      const visionText = await chat({
        model: OLLAMA_MODEL_VISION,
        messages: [
          {
            role: "user",
            content: "Does this image contain NSFW, violence, or hate content? Answer SAFE or UNSAFE with brief reason.",
            images: [req.body.image_base64],
          },
        ],
      });
      const lower = (visionText || "").toLowerCase();
      if (lower.includes("unsafe") || lower.includes("nsfw") || lower.includes("violence")) {
        safe = false;
        score = 0.9;
        labels.push("vision_flagged");
      }
    } catch (e) {
      labels.push("vision_skipped");
    }
  }

  await logInference({
    task: "moderate_media",
    model: OLLAMA_MODEL_VISION,
    promptHash,
    latencyMs: Date.now() - started,
    success: true,
    metadata: { media_id, safe, score, labels },
  });

  res.json({ ok: true, safe, score, labels, media_id });
});

const SEARCH_URL = (process.env.SEARCH_SERVICE_URL || "http://search-svc:8122").replace(/\/$/, "");
const CATALOG_URL = (process.env.CATALOG_SERVICE_URL || "http://catalog-svc:8110").replace(/\/$/, "");

/** POST /v1/address/parse — parse free-text Thai address */
app.post("/v1/address/parse", auth, async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });
  const useRules = process.env.VOICE_USE_RULES_ONLY === "1";
  if (useRules) {
    return res.json({ ok: true, parsed: ruleBasedAddressParse(text), source: "rules" });
  }
  try {
    const raw = await generate({ model: OLLAMA_MODEL_CHAT, prompt: addressParsePrompt(text), format: "json" });
    const parsed = parseJsonFromLlm(raw) || ruleBasedAddressParse(text);
    res.json({ ok: true, parsed, source: "hermes" });
  } catch (e) {
    res.json({ ok: true, parsed: ruleBasedAddressParse(text), source: "rules_fallback" });
  }
});

/** POST /v1/vision/ocr-slip — read shipping/payment slip */
app.post("/v1/vision/ocr-slip", auth, async (req, res) => {
  const { image_base64 } = req.body || {};
  if (!image_base64) return res.status(400).json({ error: "image_base64 required" });
  const b64 = String(image_base64).replace(/^data:image\/\w+;base64,/, "");
  try {
    const raw = await chat({
      model: OLLAMA_MODEL_VISION,
      messages: [{ role: "user", content: ocrSlipPrompt(), images: [b64] }],
    });
    let parsed = parseJsonFromLlm(raw) || ruleBasedOcrSlip("");
    parsed.amount_micro = Math.round(Number(parsed.amount_thb || 0) * 1_000_000);
    res.json({ ok: true, ...parsed, source: "vision" });
  } catch (e) {
    const fallback = ruleBasedOcrSlip("");
    res.json({ ok: true, ...fallback, source: "rules_fallback", error: e.message });
  }
});

/** POST /v1/live/faq — auto FAQ in live chat */
app.post("/v1/live/faq", auth, async (req, res) => {
  const ctx = req.body || {};
  const useRules = process.env.VOICE_USE_RULES_ONLY === "1";
  if (useRules) {
    const r = ruleBasedLiveFaq(ctx);
    return res.json({ ok: true, ...r });
  }
  try {
    const raw = await generate({ model: OLLAMA_MODEL_CHAT, prompt: liveFaqPrompt(ctx), format: "json" });
    const out = parseJsonFromLlm(raw) || ruleBasedLiveFaq(ctx);
    res.json({ ok: true, reply_th: out.reply_th, source: "hermes" });
  } catch (e) {
    const r = ruleBasedLiveFaq(ctx);
    res.json({ ok: true, ...r, source: "rules_fallback" });
  }
});

/** POST /v1/vision/product-dimensions — estimate weight/size from product photo */
app.post("/v1/vision/product-dimensions", auth, async (req, res) => {
  const { image_base64 } = req.body || {};
  if (!image_base64) return res.status(400).json({ error: "image_base64 required" });
  const b64 = String(image_base64).replace(/^data:image\/\w+;base64,/, "");
  try {
    const raw = await chat({
      model: OLLAMA_MODEL_VISION,
      messages: [{
        role: "user",
        content: "Estimate product weight in grams and box dimensions cm (width,length,height). JSON only: {\"weight_grams\":500,\"width_cm\":10,\"length_cm\":15,\"height_cm\":8}",
        images: [b64],
      }],
    });
    const dims = parseJsonFromLlm(raw) || { weight_grams: 500, width_cm: 10, length_cm: 15, height_cm: 8 };
    res.json({ ok: true, ...dims, source: "vision" });
  } catch (e) {
    res.json({ ok: true, weight_grams: 500, width_cm: 10, length_cm: 15, height_cm: 8, source: "default" });
  }
});

/** POST /v1/jarvis/concierge — Jarvis shopping brain + tool hints */
app.post("/v1/jarvis/concierge", auth, async (req, res) => {
  const ctx = req.body || {};
  const useRules = process.env.VOICE_USE_RULES_ONLY === "1";
  let brain = useRules ? ruleBasedJarvis(ctx) : null;
  if (!brain) {
    try {
      const raw = await generate({ model: OLLAMA_MODEL_CHAT, prompt: jarvisConciergePrompt(ctx), format: "json" });
      brain = parseJsonFromLlm(raw) || ruleBasedJarvis(ctx);
      brain.source = "hermes";
    } catch (e) {
      brain = ruleBasedJarvis(ctx);
      brain.source = "rules_fallback";
    }
  }

  const result = { ok: true, jarvis: brain };

  if (brain.action === "search" && brain.search_query) {
    try {
      const sr = await fetch(`${SEARCH_URL}/v1/search?q=${encodeURIComponent(brain.search_query)}&tab=product&limit=8`);
      const sd = await sr.json();
      result.products = sd.results || sd.items || [];
    } catch (e) {
      result.search_error = e.message;
    }
  }

  if (brain.action === "compare" && ctx.session?.last_search?.length) {
    const items = ctx.session.last_search;
    const sorted = [...items].sort((a, b) => (a.price_micro || 0) - (b.price_micro || 0));
    result.cheapest = sorted[0] || null;
    result.compare = sorted.slice(0, 5);
    if (result.cheapest) {
      result.jarvis.reply_th = `ราคาที่ถูกที่สุดตอนนี้ ${Math.round((result.cheapest.price_micro || 0) / 1_000_000)} บาทครับเจ้านาย สั่งซื้อเลยไหมครับ`;
    }
  }

  res.json(result);
});

/** POST /v1/live/pack-assist — group orders for packing */
app.post("/v1/live/pack-assist", auth, async (req, res) => {
  const { orders = [] } = req.body || {};
  const groups = {};
  for (const o of orders) {
    const key = `${o.carrier_id || "default"}:${o.postal_code || "unknown"}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }
  res.json({ ok: true, groups, batch_count: Object.keys(groups).length });
});

/** POST /v1/live/stock-announce — generate live stock/limit announcement */
app.post("/v1/live/stock-announce", auth, async (req, res) => {
  const { title, inventory, limit_per_user } = req.body || {};
  const limitTxt = limit_per_user > 0 ? ` จำกัด ${limit_per_user} ชิ้นต่อคน` : "";
  res.json({
    ok: true,
    announcement_th: `📢 ${title || "สินค้า"} เหลือ ${inventory ?? "?"} ชิ้น${limitTxt} — พิมพ์ F เพื่อสั่งซื้อ`,
  });
});

/** POST /v1/growth/incubation-brief — weekly Talent clip creative brief (Hermes) */
app.post("/v1/growth/incubation-brief", auth, async (req, res) => {
  const ctx = req.body || {};
  const weekNo = Math.max(1, Math.min(13, Number(ctx.week_no) || 1));
  const useRules = process.env.VOICE_USE_RULES_ONLY === "1";

  if (useRules) {
    const brief = ruleBasedIncubationBrief({ ...ctx, week_no: weekNo });
    return res.json({ ok: true, brief, source: "rules" });
  }

  try {
    const raw = await generate({
      model: OLLAMA_MODEL_CHAT,
      prompt: incubationBriefPrompt({ ...ctx, week_no: weekNo }),
      format: "json",
    });
    const brief = parseJsonFromLlm(raw) || ruleBasedIncubationBrief({ ...ctx, week_no: weekNo });
    brief.week_no = weekNo;
    res.json({ ok: true, brief, source: "hermes" });
  } catch (e) {
    const brief = ruleBasedIncubationBrief({ ...ctx, week_no: weekNo });
    res.json({ ok: true, brief, source: "rules_fallback", error: e.message });
  }
});

/** POST /v1/talent/resume-draft — LinkedIn-style profile (Hermes structure + Qwen polish) */
app.post("/v1/talent/resume-draft", auth, async (req, res) => {
  const ctx = req.body || {};
  const useRules = process.env.VOICE_USE_RULES_ONLY === "1";

  if (useRules) {
    const draft = ruleBasedResumeDraft(ctx);
    return res.json({ ok: true, draft, source: "rules", sources: { structure: "rules" } });
  }

  try {
    const raw = await generate({
      model: OLLAMA_MODEL_CHAT,
      prompt: talentResumeHermesPrompt(ctx),
      format: "json",
    });
    let draft = parseJsonFromLlm(raw) || ruleBasedResumeDraft(ctx);
    draft = { ...ruleBasedResumeDraft(ctx), ...draft, source: "hermes" };

    const sources = { structure: "hermes", prose: null };
    const useQwen = process.env.TALENT_RESUME_QWEN !== "0";

    if (useQwen && OLLAMA_MODEL_PROSE) {
      try {
        const qwenRaw = await chat({
          model: OLLAMA_MODEL_PROSE,
          messages: [
            { role: "system", content: "Return valid JSON only." },
            { role: "user", content: talentResumeQwenPrompt(draft, ctx) },
          ],
          format: "json",
          options: { num_predict: 768, temperature: 0.4 },
        });
        const polished = parseJsonFromLlm(qwenRaw);
        if (polished?.headline_th) draft.headline_th = polished.headline_th;
        if (polished?.about_th) draft.about_th = polished.about_th;
        if (polished?.video_script_th) draft.video_script_th = polished.video_script_th;
        sources.prose = "qwen";
        draft.source = "hermes+qwen";
      } catch (qe) {
        sources.prose = "qwen_fallback";
        console.warn("[ai-core] Qwen polish skipped:", qe.message);
      }
    }

    res.json({ ok: true, draft, source: draft.source || "hermes", sources });
  } catch (e) {
    const draft = ruleBasedResumeDraft(ctx);
    res.json({ ok: true, draft, source: "rules_fallback", sources: { structure: "rules_fallback" }, error: e.message });
  }
});

/** POST /v1/merchant/ad-brief — 10-shot product ad storyboard (merchant marketplace/food) */
app.post("/v1/merchant/ad-brief", auth, async (req, res) => {
  const ctx = req.body || {};
  const fallback = ruleBasedAdBrief(ctx);
  try {
    if (activeInferences >= MAX_CONCURRENT) {
      return res.json({ ok: true, brief: fallback, source: "rules_queue" });
    }
    activeInferences++;
    const t0 = Date.now();
    try {
      const raw = await chat({
        model: OLLAMA_MODEL_PROSE,
        messages: [
          { role: "system", content: "Return valid JSON only. Exactly 10 shots." },
          { role: "user", content: merchantAdBriefPrompt(ctx) },
        ],
        format: "json",
        options: { num_predict: 2048, temperature: 0.45 },
      });
      const parsed = parseJsonFromLlm(raw);
      const brief =
        parsed?.shots?.length >= 8
          ? { ...fallback, ...parsed, shots: parsed.shots.slice(0, 10), source: "hermes" }
          : fallback;
      await logInference({
        task: "merchant_ad_brief",
        model: OLLAMA_MODEL_PROSE,
        promptHash: crypto.createHash("sha256").update(ctx.product_title || "").digest("hex").slice(0, 16),
        latencyMs: Date.now() - t0,
        success: true,
        metadata: { merchant_id: ctx.merchant_id, shots: brief.shots?.length },
      });
      res.json({ ok: true, brief, source: brief.source || "hermes" });
    } finally {
      activeInferences--;
    }
  } catch (e) {
    res.json({ ok: true, brief: fallback, source: "rules_fallback", error: e.message });
  }
});

app.listen(PORT, () => console.log(`ai-core :${PORT} → ${process.env.OLLAMA_HOST || "http://ollama:11434"}`));
