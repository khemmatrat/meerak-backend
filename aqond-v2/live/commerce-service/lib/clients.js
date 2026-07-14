const ORDER_URL = (process.env.ORDER_SERVICE_URL || "http://order-svc:8113").replace(/\/$/, "");
const CATALOG_URL = (process.env.CATALOG_SERVICE_URL || "http://catalog-svc:8110").replace(/\/$/, "");
const ADDRESS_URL = (process.env.ADDRESS_SERVICE_URL || "http://address-svc:8128").replace(/\/$/, "");
const SHIPPING_URL = (process.env.SHIPPING_SERVICE_URL || "http://shipping-svc:8127").replace(/\/$/, "");
const AI_CORE_URL = (process.env.AI_CORE_URL || "http://ai-core:8100").replace(/\/$/, "");
const AI_CORE_KEY = process.env.AI_CORE_API_KEY || "";

export async function flashBuy({ buyerId, variantId, productId, merchantId, qty, roomId }) {
  const r = await fetch(`${ORDER_URL}/v1/flash/buy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `live-${roomId}-${buyerId}-${variantId}-${Date.now()}`,
    },
    body: JSON.stringify({
      buyer_id: buyerId,
      variant_id: variantId,
      product_id: productId,
      merchant_id: merchantId,
      qty,
      flash_event_id: roomId,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `flash_buy_${r.status}`);
  return data;
}

export async function getProductVariants(productId) {
  const r = await fetch(`${CATALOG_URL}/v1/variants?product_id=${encodeURIComponent(productId)}`, {
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  return data.variants || [];
}

export async function listAddresses(ownerId) {
  const r = await fetch(`${ADDRESS_URL}/v1/address?owner_id=${encodeURIComponent(ownerId)}`, {
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  return data.addresses || [];
}

export async function createAddress(payload) {
  const r = await fetch(`${ADDRESS_URL}/v1/address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.errors?.join?.(", ") || data.error || "address_failed");
  return data;
}

export async function attachShippingAddress(orderId, addressId) {
  const { query } = await import("./db.js");
  await query(
    `UPDATE commerce.orders SET shipping_address_id=$2, fulfillment_status='pending_ship', updated_at=NOW() WHERE id=$1`,
    [orderId, addressId],
  );
}

export async function updateFulfillment(orderId, status, note = "") {
  const { query } = await import("./db.js");
  const { ulid } = await import("ulid");
  await query(`UPDATE commerce.orders SET fulfillment_status=$2, updated_at=NOW() WHERE id=$1`, [
    orderId,
    status,
  ]);
  await query(
    `INSERT INTO commerce.fulfillment_events (id, order_id, status, note) VALUES ($1,$2,$3,$4)`,
    [ulid(), orderId, status, note],
  );
}

export async function createLabel(payload) {
  const r = await fetch(`${SHIPPING_URL}/v1/shipping/label`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

export async function renderLabelHtml(shipmentId) {
  const r = await fetch(`${SHIPPING_URL}/v1/shipping/label/${encodeURIComponent(shipmentId)}/html`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  return r.text();
}

export async function aiParseAddress(text) {
  const headers = { "Content-Type": "application/json" };
  if (AI_CORE_KEY) headers["X-AI-Core-Api-Key"] = AI_CORE_KEY;
  const r = await fetch(`${AI_CORE_URL}/v1/address/parse`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  return data.parsed || null;
}

export async function aiFaqReply(context) {
  const headers = { "Content-Type": "application/json" };
  if (AI_CORE_KEY) headers["X-AI-Core-Api-Key"] = AI_CORE_KEY;
  const r = await fetch(`${AI_CORE_URL}/v1/live/faq`, {
    method: "POST",
    headers,
    body: JSON.stringify(context),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => ({}));
  return data.reply_th || null;
}

export async function ocrSlip(imageBase64) {
  const headers = { "Content-Type": "application/json" };
  if (AI_CORE_KEY) headers["X-AI-Core-Api-Key"] = AI_CORE_KEY;
  const r = await fetch(`${AI_CORE_URL}/v1/vision/ocr-slip`, {
    method: "POST",
    headers,
    body: JSON.stringify({ image_base64: imageBase64 }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "ocr_failed");
  return data;
}
