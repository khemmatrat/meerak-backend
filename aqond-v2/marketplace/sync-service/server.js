import express from "express";
import pg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { mirrorProductToBagisto, bagistoHealth } from "./lib/bagisto-client.js";
import {
  shipOrder,
  deliverOrder,
  processSlaBreach,
  slaStatus,
} from "./lib/sla-processor.js";
import { assertProdSecrets, strictSyncSecret } from "./lib/prod-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || "aqond-db",
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  user: process.env.DB_USERNAME || process.env.PGUSER,
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  database: process.env.DB_DATABASE || process.env.PGDATABASE || "bagisto",
});

const WEBHOOK_SECRET = process.env.BAGISTO_WEBHOOK_SECRET || "";
const ESCROW_URL = process.env.ESCROW_SERVICE_URL || "http://escrow-service:8091";
const ESCROW_KEY = process.env.ESCROW_API_KEY || "";
const ANALYTICS_URL = (process.env.ANALYTICS_URL || "http://analytics-service:8095").replace(/\/$/, "");
const ANALYTICS_KEY = process.env.ANALYTICS_API_KEY || "";

/** THB minor units: satang (price * 100) */
function priceToMicro(priceThb) {
  return Math.round(Number(priceThb) * 100);
}

function trackAnalyticsEvent(payload) {
  fetch(`${ANALYTICS_URL}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Analytics-Api-Key": ANALYTICS_KEY,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function authSync(req, res, next) {
  return strictSyncSecret(WEBHOOK_SECRET)(req, res, next);
}

assertProdSecrets([
  { name: "POSTGRES_PASSWORD", value: process.env.DB_PASSWORD || process.env.PGPASSWORD },
  { name: "BAGISTO_WEBHOOK_SECRET", value: WEBHOOK_SECRET },
  { name: "ESCROW_API_KEY", value: ESCROW_KEY },
  { name: "ANALYTICS_API_KEY", value: ANALYTICS_KEY },
]);

function mapRow(row, images = []) {
  return {
    id: row.id,
    external_id: row.external_id,
    title: row.title,
    category: row.category,
    description: row.description,
    price: Number(row.price_thb),
    price_thb: Number(row.price_thb),
    inventory: row.inventory,
    status: row.status,
    merchant_hint: row.merchant_hint,
    bagisto_product_id: row.bagisto_product_id ? Number(row.bagisto_product_id) : null,
    published_at: row.published_at,
    image_uris: images.map((i) => i.public_url),
    images: images.map((i) => ({
      url: i.public_url,
      object_key: i.object_key,
      sort_order: i.sort_order,
    })),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadProduct(externalId) {
  const { rows } = await pool.query(
    `SELECT p.*,
            COALESCE(
              json_agg(
                json_build_object('public_url', pi.public_url, 'object_key', pi.object_key, 'sort_order', pi.sort_order)
                ORDER BY pi.sort_order
              ) FILTER (WHERE pi.id IS NOT NULL),
              '[]'
            ) AS images
     FROM marketplace.products p
     LEFT JOIN marketplace.product_images pi ON pi.product_id = p.id
     WHERE p.external_id = $1
     GROUP BY p.id`,
    [externalId],
  );
  if (!rows.length) return null;
  return mapRow(rows[0], rows[0].images || []);
}

async function attachImages(client, productId, imageUris) {
  if (!imageUris.length) return;
  await client.query(`DELETE FROM marketplace.product_images WHERE product_id = $1`, [productId]);
  for (let i = 0; i < imageUris.length; i++) {
    const url = String(imageUris[i]);
    const objectKey = url.includes("/") ? url.split("/").slice(-2).join("/") : url;
    await client.query(
      `INSERT INTO marketplace.product_images (product_id, object_key, public_url, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [productId, objectKey, url, i],
    );
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "marketplace-sync",
    catalog: "postgres+minio",
    p2b: { draft_publish: true, checkout_escrow: true },
    p6: { sla_ship_deliver: true, sla_refund: true },
    p7: { analytics_checkout: true },
    production_hardening: process.env.AQOND_ENV === "production",
    bagisto: bagistoHealth(),
  });
});

app.get("/shop", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "shop.html"));
});

app.get("/products", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const status = req.query.status || "published";
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              COALESCE(
                json_agg(
                  json_build_object('public_url', pi.public_url, 'object_key', pi.object_key, 'sort_order', pi.sort_order)
                  ORDER BY pi.sort_order
                ) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM marketplace.products p
       LEFT JOIN marketplace.product_images pi ON pi.product_id = p.id
       WHERE p.status = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [status, limit],
    );
    res.json({
      ok: true,
      count: rows.length,
      products: rows.map((r) => mapRow(r, r.images || [])),
    });
  } catch (e) {
    res.status(500).json({ error: "catalog_query_failed", detail: e.message });
  }
});

app.get("/products/:external_id", async (req, res) => {
  try {
    const product = await loadProduct(req.params.external_id);
    if (!product) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, product });
  } catch (e) {
    res.status(500).json({ error: "catalog_query_failed", detail: e.message });
  }
});

/** PATCH /products/:external_id — edit draft listing */
app.patch("/products/:external_id", async (req, res) => {
  const body = req.body || {};
  try {
    const existing = await loadProduct(req.params.external_id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    if (existing.status === "published" && body.status !== "archived") {
      return res.status(409).json({ error: "published_locked", hint: "Archive first to major-edit" });
    }

    const { rows } = await pool.query(
      `UPDATE marketplace.products SET
         title = COALESCE($2, title),
         category = COALESCE($3, category),
         description = COALESCE($4, description),
         price_thb = COALESCE($5, price_thb),
         inventory = COALESCE($6, inventory),
         updated_at = NOW()
       WHERE external_id = $1
       RETURNING *`,
      [
        req.params.external_id,
        body.title ? String(body.title).slice(0, 240) : null,
        body.category ? String(body.category).slice(0, 120) : null,
        body.description != null ? String(body.description).slice(0, 5000) : null,
        body.price != null ? Number(body.price) : body.price_thb != null ? Number(body.price_thb) : null,
        body.inventory != null ? Math.max(0, Math.round(Number(body.inventory))) : null,
      ],
    );
    const product = mapRow(rows[0], existing.images.map((url, i) => ({
      public_url: url,
      object_key: "",
      sort_order: i,
    })));
    res.json({ ok: true, product });
  } catch (e) {
    res.status(500).json({ error: "update_failed", detail: e.message });
  }
});

/** POST /products/:external_id/publish — draft → published (+ optional Bagisto mirror) */
app.post("/products/:external_id/publish", async (req, res) => {
  try {
    const existing = await loadProduct(req.params.external_id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    if (existing.status === "published") {
      return res.json({ ok: true, already_published: true, product: existing });
    }

    const { rows } = await pool.query(
      `UPDATE marketplace.products SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE external_id = $1 RETURNING *`,
      [req.params.external_id],
    );
    let product = mapRow(rows[0], existing.images.map((url, i) => ({
      public_url: url,
      object_key: "",
      sort_order: i,
    })));

    const bagistoMirror = await mirrorProductToBagisto(product);
    if (bagistoMirror.ok && bagistoMirror.bagisto_product_id) {
      await pool.query(
        `UPDATE marketplace.products SET bagisto_product_id = $2 WHERE external_id = $1`,
        [req.params.external_id, bagistoMirror.bagisto_product_id],
      );
      product.bagisto_product_id = bagistoMirror.bagisto_product_id;
    }

    res.json({ ok: true, product, bagisto_mirror: bagistoMirror });
  } catch (e) {
    res.status(500).json({ error: "publish_failed", detail: e.message });
  }
});

/** POST /checkout — create order + escrow HOLD */
app.post("/checkout", async (req, res) => {
  const { external_id, buyer_id = "guest", qty = 1 } = req.body || {};
  if (!external_id) return res.status(400).json({ error: "external_id required" });

  const product = await loadProduct(external_id);
  if (!product) return res.status(404).json({ error: "product_not_found" });
  if (product.status !== "published") {
    return res.status(409).json({ error: "not_published", status: product.status });
  }
  const quantity = Math.max(1, Math.round(Number(qty)));
  if (product.inventory < quantity) {
    return res.status(409).json({ error: "insufficient_inventory", inventory: product.inventory });
  }

  const orderId = `ord-${crypto.randomUUID()}`;
  const idempotencyKey = `checkout-${external_id}-${orderId}`;
  const amountMicro = priceToMicro(product.price) * quantity;
  const merchantId = product.merchant_hint || "default-merchant";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const escrowRes = await fetch(`${ESCROW_URL}/hold`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Escrow-Api-Key": ESCROW_KEY,
      },
      body: JSON.stringify({
        order_id: orderId,
        amount_micro: amountMicro,
        merchant_id: merchantId,
        buyer_id,
        idempotency_key: idempotencyKey,
        actor: "checkout",
      }),
    });
    const escrowData = await escrowRes.json().catch(() => ({}));
    if (!escrowRes.ok) {
      await client.query("ROLLBACK");
      return res.status(502).json({ error: "escrow_hold_failed", detail: escrowData });
    }

    const orderInsert = await client.query(
      `INSERT INTO marketplace.orders
         (order_id, product_id, external_id, buyer_id, qty, amount_micro, status, escrow_idempotency_key, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'held', $7, $8)
       RETURNING *`,
      [orderId, product.id, external_id, buyer_id, quantity, amountMicro, idempotencyKey, merchantId],
    );

    await client.query(
      `UPDATE marketplace.products SET inventory = inventory - $2, updated_at = NOW() WHERE id = $1`,
      [product.id, quantity],
    );

    await client.query("COMMIT");
    trackAnalyticsEvent({
      stream_id: "shop",
      merchant_id: merchantId,
      product_id: external_id,
      event_type: "purchase",
      session_id: orderId,
      user_id: buyer_id,
      source: "checkout",
      metadata: { amount_micro: amountMicro, qty: quantity },
    });
    res.status(201).json({
      ok: true,
      order: orderInsert.rows[0],
      escrow: escrowData.ledger,
      amount_thb: amountMicro / 100,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "checkout_failed", detail: e.message });
  } finally {
    client.release();
  }
});

app.get("/orders/:order_id", async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM marketplace.orders WHERE order_id = $1`, [
    req.params.order_id,
  ]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, order: rows[0], sla: slaStatus(rows[0]) });
});

/** GET /orders/:order_id/sla-status — n8n polls after SLA wait */
app.get("/orders/:order_id/sla-status", async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM marketplace.orders WHERE order_id = $1`, [
    req.params.order_id,
  ]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, ...slaStatus(rows[0]) });
});

/** POST /orders/:order_id/ship — 3PL pickup, starts SLA timer (P6) */
app.post("/orders/:order_id/ship", authSync, async (req, res) => {
  const body = req.body || {};
  try {
    const result = await shipOrder(pool, req.params.order_id, {
      carrier_code: body.carrier_code,
      tracking_id: body.tracking_id,
      sla_hours: body.sla_hours,
    });
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json({
      ok: true,
      order: result.order,
      sla: slaStatus(result.order),
      note: `SLA ${result.sla_hours}h — n8n webhook or POST /sla/process-breach after deadline`,
    });
  } catch (e) {
    res.status(500).json({ error: "ship_failed", detail: e.message });
  }
});

/** POST /orders/:order_id/deliver — on-time delivery → escrow RELEASE (P6) */
app.post("/orders/:order_id/deliver", authSync, async (req, res) => {
  try {
    const result = await deliverOrder(pool, req.params.order_id, {
      actor: req.body?.actor || "merchant",
    });
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "deliver_failed", detail: e.message });
  }
});

/** POST /orders/:order_id/sla/process-breach — ai judge + escrow REFUND (P6) */
app.post("/orders/:order_id/sla/process-breach", authSync, async (req, res) => {
  const force = req.query.force === "1" || req.body?.force === true;
  try {
    const result = await processSlaBreach(pool, req.params.order_id, {
      force,
      actor: req.body?.actor || "n8n-sla",
    });
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "sla_process_failed", detail: e.message });
  }
});

/** POST /logistics/pickup — alias for n8n 3PL webhook (body.order_id) */
app.post("/logistics/pickup", authSync, async (req, res) => {
  const orderId = req.body?.order_id;
  if (!orderId) return res.status(400).json({ error: "order_id required" });
  try {
    const result = await shipOrder(pool, orderId, {
      carrier_code: req.body?.carrier_code,
      tracking_id: req.body?.tracking_id,
      sla_hours: req.body?.sla_hours,
    });
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json({ ok: true, order: result.order, sla: slaStatus(result.order) });
  } catch (e) {
    res.status(500).json({ error: "pickup_failed", detail: e.message });
  }
});

/** POST /internal/sync-product — idempotent upsert (P2b default: draft) */
app.post("/internal/sync-product", authSync, async (req, res) => {
  const idempotencyKey = req.headers["idempotency-key"] || req.body?.external_id;
  if (!idempotencyKey) {
    return res.status(400).json({ error: "idempotency_key_required" });
  }

  const body = req.body || {};
  const title = String(body.title || "Untitled").slice(0, 240);
  const category = String(body.category || "general").slice(0, 120);
  const description = String(body.description || "").slice(0, 5000);
  const price = Number(body.price ?? body.price_thb ?? 0);
  const inventory = Math.max(0, Math.round(Number(body.inventory ?? 1)));
  const merchantHint = String(body.merchant_hint || "");
  const status = body.status === "published" ? "published" : "draft";
  const imageUris = Array.isArray(body.image_uris) ? body.image_uris.filter(Boolean) : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upsert = await client.query(
      `INSERT INTO marketplace.products
         (external_id, title, category, description, price_thb, inventory, status, merchant_hint, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (external_id) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         description = EXCLUDED.description,
         price_thb = EXCLUDED.price_thb,
         inventory = EXCLUDED.inventory,
         status = CASE
           WHEN marketplace.products.status = 'published' THEN marketplace.products.status
           ELSE EXCLUDED.status
         END,
         merchant_hint = EXCLUDED.merchant_hint,
         published_at = CASE
           WHEN EXCLUDED.status = 'published' THEN COALESCE(marketplace.products.published_at, NOW())
           ELSE marketplace.products.published_at
         END,
         updated_at = NOW()
       RETURNING *`,
      [
        idempotencyKey,
        title,
        category,
        description,
        price,
        inventory,
        status,
        merchantHint,
        status === "published" ? new Date() : null,
      ],
    );
    const product = upsert.rows[0];
    await attachImages(client, product.id, imageUris);

    const { rows: imgRows } = await client.query(
      `SELECT public_url, object_key, sort_order FROM marketplace.product_images
       WHERE product_id = $1 ORDER BY sort_order`,
      [product.id],
    );

    await client.query("COMMIT");
    const mapped = mapRow(product, imgRows);
    res.status(201).json({
      ok: true,
      synced: true,
      product: mapped,
      p2b_note: mapped.status === "draft"
        ? "Draft — POST /products/:id/publish before shop checkout"
        : "Published",
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[marketplace-sync] sync error:", e);
    res.status(500).json({ error: "sync_failed", detail: e.message });
  } finally {
    client.release();
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`marketplace-sync :${port} (P2b checkout + P6 SLA)`));
