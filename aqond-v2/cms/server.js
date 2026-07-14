import express from "express";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { uploadProductImages, storageHealth } from "./lib/storage.js";
import { assertProdSecrets, requireApiKey, isProduction } from "./lib/prod-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));

const CMS_API_KEY = process.env.CMS_API_KEY || "";

app.get("/merchant-config.js", (_req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  const key = isProduction() && CMS_API_KEY ? CMS_API_KEY : "";
  res.send(`window.__CMS_API_KEY__=${JSON.stringify(key)};`);
});

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

const BAGISTO_URL = process.env.BAGISTO_WEBHOOK_URL || "http://marketplace-web:8080/internal/sync-product";
const BAGISTO_SECRET = process.env.BAGISTO_WEBHOOK_SECRET || "";
const AI_CORE_URL = process.env.AI_CORE_URL || "http://ai-core:8100";
const AI_CORE_API_KEY = process.env.AI_CORE_API_KEY || "";
const merchantAuth = requireApiKey(CMS_API_KEY, ["x-cms-api-key", "x-api-key"]);

assertProdSecrets([
  { name: "BAGISTO_WEBHOOK_SECRET", value: BAGISTO_SECRET },
  { name: "AI_CORE_API_KEY", value: AI_CORE_API_KEY },
  { name: "CMS_API_KEY", value: CMS_API_KEY },
]);

/** Normalize LLM output into product payload */
function mapLlmToProduct(body) {
  const raw = body.llm_output || body.product || body;
  return {
    title: String(raw.title || raw.product_name || "Untitled").slice(0, 240),
    category: raw.category || raw.categories?.[0] || "general",
    price: Number(raw.price || raw.price_thb || 0),
    inventory: Number(raw.inventory ?? raw.qty ?? 1),
    image_uris: Array.isArray(raw.image_uris) ? raw.image_uris : raw.image_url ? [raw.image_url] : [],
    description: String(raw.description || raw.body || "").slice(0, 5000),
    external_id: raw.external_id || crypto.randomUUID(),
    merchant_hint: String(raw.merchant_hint || ""),
    status: raw.status || "draft",
  };
}

async function syncToBagisto(product, idempotencyKey) {
  const syncRes = await fetch(BAGISTO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bagisto-Sync-Secret": BAGISTO_SECRET,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      ...product,
      status: product.status || "draft",
      merchant_hint: product.merchant_hint || "",
    }),
  });
  const data = await syncRes.json().catch(() => ({}));
  if (!syncRes.ok) {
    const err = new Error("bagisto_sync_failed");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data;
}

async function callAiCoreOnboard({ imageBase64, imageUrl, merchantHint }) {
  const aiRes = await fetch(`${AI_CORE_URL}/v1/onboard/product`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AI-Core-Api-Key": AI_CORE_API_KEY,
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      image_url: imageUrl,
      merchant_hint: merchantHint,
    }),
    signal: AbortSignal.timeout(Number(process.env.AI_ONBOARD_TIMEOUT_MS || 600000)),
  });
  const data = await aiRes.json().catch(() => ({}));
  if (!aiRes.ok) {
    const err = new Error(data.error || "ai_core_failed");
    err.status = aiRes.status >= 500 ? 502 : aiRes.status;
    err.detail = data;
    throw err;
  }
  return data;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "cms-service",
    ai_core: AI_CORE_URL,
    storage: storageHealth(),
    ai_onboard_timeout_ms: Number(process.env.AI_ONBOARD_TIMEOUT_MS || 600000),
  });
});

/** Merchant upload UI — also at /onboard via static/public/onboard.html */
app.get("/onboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "onboard.html"));
});

/**
 * POST /ai/onboard
 * multipart: images[] + optional merchant_hint
 * JSON fallback: llm_output (legacy) or image_url
 */
app.post("/ai/onboard", merchantAuth, upload.array("images", 5), async (req, res) => {
  const idempotencyKey = req.headers["idempotency-key"] || crypto.randomUUID();
  const merchantHint = req.body?.merchant_hint || "";

  try {
    let product;
    let aiMeta = null;

    if (req.files?.length) {
      const imageUris = await uploadProductImages(req.files);
      const file = req.files[0];
      const imageBase64 = file.buffer.toString("base64");
      const ai = await callAiCoreOnboard({ imageBase64, merchantHint });
      product = mapLlmToProduct({
        ...ai.product,
        external_id: idempotencyKey,
        image_uris: imageUris,
        merchant_hint: merchantHint,
        status: "draft",
      });
      aiMeta = { latency_ms: ai.latency_ms, vision_description: ai.vision_description, image_uris: imageUris };
    } else if (req.body?.image_url || req.body?.image_base64) {
      const ai = await callAiCoreOnboard({
        imageUrl: req.body.image_url,
        imageBase64: req.body.image_base64,
        merchantHint,
      });
      product = mapLlmToProduct({ ...ai.product, external_id: idempotencyKey, status: "draft" });
      aiMeta = { latency_ms: ai.latency_ms };
    } else if (req.body?.llm_output || req.body?.title) {
      product = mapLlmToProduct(req.body);
    } else {
      return res.status(400).json({
        error: "missing_input",
        hint: "Send multipart images[], or JSON image_url/image_base64, or legacy llm_output",
      });
    }

    const bagisto = await syncToBagisto(product, idempotencyKey);
    res.status(201).json({ ok: true, product, bagisto, ai: aiMeta });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message, detail: e.detail });
  }
});

/** GET /products — stub catalog from in-memory (replace with Strapi v5 DB) */
const catalog = new Map();
app.post("/products", (req, res) => {
  const p = mapLlmToProduct(req.body);
  catalog.set(p.external_id, p);
  res.status(201).json({ product: p });
});
app.get("/products", (_req, res) => {
  res.json({ products: [...catalog.values()] });
});

const port = Number(process.env.PORT || 8094);
app.listen(port, () => console.log(`cms-service :${port} → ai-core ${AI_CORE_URL}`));
