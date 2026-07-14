/**
 * Optional mirror to Bagisto app (profile p2b-bagisto).
 * POST /aqond-api/v1/products on bagisto-app when installed.
 */
const BAGISTO_URL = (process.env.BAGISTO_APP_URL || "").replace(/\/$/, "");
const BAGISTO_SYNC_KEY = process.env.BAGISTO_AQOND_SYNC_KEY || process.env.BAGISTO_WEBHOOK_SECRET || "";

export async function mirrorProductToBagisto(product) {
  if (!BAGISTO_URL) {
    return { skipped: true, reason: "BAGISTO_APP_URL not set — enable profile p2b-bagisto" };
  }

  try {
    const r = await fetch(`${BAGISTO_URL}/aqond-api/v1/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Aqond-Sync-Key": BAGISTO_SYNC_KEY,
      },
      body: JSON.stringify({
        external_id: product.external_id,
        title: product.title,
        category: product.category,
        description: product.description,
        price_thb: product.price_thb ?? product.price,
        inventory: product.inventory,
        status: product.status,
        image_uris: product.image_uris || [],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: data.error || `bagisto_http_${r.status}`, detail: data };
    }
    return { ok: true, bagisto_product_id: data.bagisto_product_id, data };
  } catch (e) {
    return { ok: false, error: "bagisto_unreachable", detail: e.message };
  }
}

export function bagistoHealth() {
  return { configured: Boolean(BAGISTO_URL), url: BAGISTO_URL || null };
}
