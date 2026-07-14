/**
 * P6: SLA breach → ai-core judge → escrow REFUND / RELEASE
 */
const ESCROW_URL = (process.env.ESCROW_SERVICE_URL || "http://escrow-service:8091").replace(/\/$/, "");
const ESCROW_KEY = process.env.ESCROW_API_KEY || "";
const AI_CORE_URL = (process.env.AI_CORE_URL || "http://ai-core:8100").replace(/\/$/, "");
const AI_CORE_KEY = process.env.AI_CORE_API_KEY || "";
const DEFAULT_SLA_HOURS = Number(process.env.P6_SLA_HOURS || 48);

export async function escrowTransition(orderId, action, { reason, actor = "p6-sla" } = {}) {
  const r = await fetch(`${ESCROW_URL}/${action.toLowerCase()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Escrow-Api-Key": ESCROW_KEY,
    },
    body: JSON.stringify({ order_id: orderId, reason, actor }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, error: data.error || `escrow_${action}_${r.status}`, detail: data };
  }
  return { ok: true, ledger: data.ledger };
}

export async function callSlaJudge(orderContext) {
  try {
    const r = await fetch(`${AI_CORE_URL}/v1/sla/judge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AI-Core-Api-Key": AI_CORE_KEY,
      },
      body: JSON.stringify(orderContext),
      signal: AbortSignal.timeout(120000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: data.error || `ai_judge_${r.status}`, detail: data };
    }
    return { ok: true, verdict: data.verdict || data, source: data.source || "ai-core" };
  } catch (e) {
    return { ok: false, error: "ai_core_unreachable", detail: e.message };
  }
}

export function isSlaBreached(order, { force = false } = {}) {
  if (force) return true;
  if (order.fulfillment_status !== "shipped") return false;
  if (order.delivered_at) return false;
  if (!order.sla_deadline_at) return false;
  return new Date(order.sla_deadline_at).getTime() <= Date.now();
}

export async function shipOrder(pool, orderId, { carrier_code, tracking_id, sla_hours } = {}) {
  const { rows } = await pool.query(`SELECT * FROM marketplace.orders WHERE order_id = $1`, [orderId]);
  if (!rows.length) return { ok: false, status: 404, error: "not_found" };
  const order = rows[0];
  if (order.status !== "held") {
    return { ok: false, status: 409, error: "invalid_order_status", status_value: order.status };
  }
  if (order.fulfillment_status !== "pending_ship") {
    return { ok: false, status: 409, error: "already_shipped", fulfillment: order.fulfillment_status };
  }

  const hours = Math.max(0, Math.round(Number(sla_hours ?? order.sla_hours ?? DEFAULT_SLA_HOURS)));
  const { rows: updated } = await pool.query(
    `UPDATE marketplace.orders SET
       fulfillment_status = 'shipped',
       carrier_code = $2,
       tracking_id = $3,
       shipped_at = NOW(),
       sla_hours = $4,
       sla_deadline_at = NOW() + make_interval(hours => $4),
       updated_at = NOW()
     WHERE order_id = $1
     RETURNING *`,
    [orderId, carrier_code || "unknown", tracking_id || null, hours],
  );
  return { ok: true, order: updated[0], sla_hours: hours };
}

export async function deliverOrder(pool, orderId, { actor = "merchant" } = {}) {
  const { rows } = await pool.query(`SELECT * FROM marketplace.orders WHERE order_id = $1`, [orderId]);
  if (!rows.length) return { ok: false, status: 404, error: "not_found" };
  const order = rows[0];
  if (order.status !== "held") {
    return { ok: false, status: 409, error: "invalid_order_status", status_value: order.status };
  }
  if (order.fulfillment_status === "delivered") {
    return { ok: true, already_delivered: true, order };
  }
  if (order.fulfillment_status !== "shipped" && order.fulfillment_status !== "pending_ship") {
    return { ok: false, status: 409, error: "cannot_deliver", fulfillment: order.fulfillment_status };
  }

  const release = await escrowTransition(orderId, "RELEASE", {
    reason: "delivered_on_time",
    actor,
  });
  if (!release.ok) {
    return { ok: false, status: 502, error: "escrow_release_failed", detail: release };
  }

  const { rows: updated } = await pool.query(
    `UPDATE marketplace.orders SET
       status = 'released',
       fulfillment_status = 'delivered',
       delivered_at = NOW(),
       sla_metadata = sla_metadata || $2::jsonb,
       updated_at = NOW()
     WHERE order_id = $1
     RETURNING *`,
    [orderId, JSON.stringify({ released_at: new Date().toISOString(), actor })],
  );
  return { ok: true, order: updated[0], escrow: release.ledger };
}

export async function processSlaBreach(pool, orderId, { force = false, actor = "n8n-sla" } = {}) {
  const { rows } = await pool.query(`SELECT * FROM marketplace.orders WHERE order_id = $1`, [orderId]);
  if (!rows.length) return { ok: false, status: 404, error: "not_found" };
  const order = rows[0];

  if (order.status === "refunded") {
    return { ok: true, already_refunded: true, order };
  }
  if (order.status !== "held") {
    return { ok: false, status: 409, error: "not_held", status_value: order.status };
  }

  const breached = isSlaBreached(order, { force });
  if (!breached) {
    return {
      ok: false,
      status: 409,
      error: "sla_not_breached",
      fulfillment_status: order.fulfillment_status,
      sla_deadline_at: order.sla_deadline_at,
    };
  }

  const judgePayload = {
    order_id: order.order_id,
    external_id: order.external_id,
    buyer_id: order.buyer_id,
    carrier_code: order.carrier_code,
    fulfillment_status: order.fulfillment_status,
    shipped_at: order.shipped_at,
    sla_deadline_at: order.sla_deadline_at,
    delivered_at: order.delivered_at,
    amount_micro: Number(order.amount_micro),
    force,
  };

  const judge = await callSlaJudge(judgePayload);
  let verdict = judge.verdict;
  if (!judge.ok || !verdict) {
    verdict = ruleBasedVerdict(judgePayload);
  }

  if (!verdict.recommend_refund) {
    return {
      ok: false,
      status: 409,
      error: "judge_no_refund",
      verdict,
      judge_ok: judge.ok,
    };
  }

  const refund = await escrowTransition(orderId, "REFUND", {
    reason: verdict.reason || "sla_breach_refund",
    actor,
  });
  if (!refund.ok) {
    return { ok: false, status: 502, error: "escrow_refund_failed", detail: refund, verdict };
  }

  const { rows: updated } = await pool.query(
    `UPDATE marketplace.orders SET
       status = 'refunded',
       fulfillment_status = 'sla_breach',
       sla_metadata = sla_metadata || $2::jsonb,
       updated_at = NOW()
     WHERE order_id = $1
     RETURNING *`,
    [
      orderId,
      JSON.stringify({
        refunded_at: new Date().toISOString(),
        actor,
        verdict,
        judge_source: judge.source || verdict.source,
      }),
    ],
  );

  return {
    ok: true,
    order: updated[0],
    escrow: refund.ledger,
    verdict,
    judge,
    carrier_penalty: await penalizeCarrier(order.carrier_code, verdict.reason),
  };
}

async function penalizeCarrier(carrierCode, reason) {
  if (!carrierCode) return { skipped: true };
  try {
    const r = await fetch(`${ESCROW_URL}/carrier/penalty`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Escrow-Api-Key": ESCROW_KEY,
      },
      body: JSON.stringify({
        carrier_code: carrierCode,
        penalty: 5,
        reason: reason || "sla_breach",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...data } : { ok: false, detail: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function ruleBasedVerdict(payload) {
  const deadline = payload.sla_deadline_at ? new Date(payload.sla_deadline_at) : null;
  const breached =
    payload.force === true ||
    (payload.fulfillment_status === "shipped" &&
      deadline &&
      deadline.getTime() <= Date.now() &&
      !payload.delivered_at);

  return {
    carrier_at_fault: breached,
    confidence: breached ? 0.92 : 0.4,
    reason: breached
      ? `Carrier ${payload.carrier_code || "unknown"} missed ${payload.sla_deadline_at} SLA deadline`
      : "No SLA breach detected",
    recommend_refund: breached,
    recommend_release: false,
    source: "rules",
  };
}

export function slaStatus(order) {
  const breached = isSlaBreached(order);
  return {
    order_id: order.order_id,
    status: order.status,
    fulfillment_status: order.fulfillment_status,
    carrier_code: order.carrier_code,
    shipped_at: order.shipped_at,
    delivered_at: order.delivered_at,
    sla_deadline_at: order.sla_deadline_at,
    sla_hours: order.sla_hours,
    breached,
    delivered: order.fulfillment_status === "delivered",
    refunded: order.status === "refunded",
  };
}
