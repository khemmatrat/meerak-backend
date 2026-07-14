/** P6 — n8n SLA breach analysis (Hermes JSON) */
export function slaJudgePrompt(logPayload) {
  return `You are a logistics SLA arbitrator for a Thai marketplace escrow system.
Given order shipment data, decide if the carrier missed the delivery SLA and buyer should be refunded.

Respond with JSON only (no markdown):
{"carrier_at_fault":true,"confidence":0.0,"reason":"short explanation","recommend_refund":true,"recommend_release":false}

Rules:
- If shipped but not delivered and current time is past sla_deadline_at → recommend_refund true, carrier_at_fault true
- If already delivered → recommend_refund false
- confidence between 0 and 1

Order data:
${JSON.stringify(logPayload, null, 0)}`;
}

export function ruleBasedSlaVerdict(payload) {
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
      ? `Missed SLA deadline ${payload.sla_deadline_at}`
      : "Within SLA or already delivered",
    recommend_refund: breached,
    recommend_release: false,
    source: "rules",
  };
}