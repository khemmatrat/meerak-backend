/**
 * POST /api/payments/webhook — Phase 1A intake (fast 200, async processing).
 *
 * Layering (do NOT inline business logic here):
 *   1. handlePaymentsWebhookIntake (api/paymentsWebhook.js)
 *      - normalize raw body (paymentEventNormalizer)
 *      - dedupe via payment_webhook_event_dedupe (atomic)
 *      - enqueue durable job into payment_webhook_jobs (DB = source of truth)
 *      - return 200 with { ok, queued, duplicate, idempotency_key, event_id, trace_id }
 *   2. enqueuePaymentWebhookSignal (queues.js) — best-effort Bull wake-up.
 *      DB queue is durable; if Redis is down the worker still polls the DB.
 *
 * This file MUST NOT:
 *   - update payment / ledger state
 *   - invoke any business action handler
 *   - return 4xx/5xx for normalization/validation issues (worker decides)
 *
 * Edge cases handled here:
 *   - Redis unavailable (signal swallowed; DB job remains durable)
 *   - Duplicate event (intake returns duplicate=true; signal still safe via Bull jobId)
 *   - Payload too large (intake truncates and adds raw_body_truncated to issues)
 *   - Hard-fail-by-signature / replay (these happen in the worker, not here)
 */
import { handlePaymentsWebhookIntake } from '../api/paymentsWebhook.js';
import { enqueuePaymentWebhookSignal } from './queues.js';

/**
 * Route handler for POST /api/payments/webhook.
 * Always returns { status: 200, body: {...} }. Body shape:
 *   { ok, queued, duplicate, trace_id, event_id, idempotency_key,
 *     replay_count, ignored?, failure_code?, retryable?, enqueue_error?, issues? }
 *
 * @param {import('express').Request} req
 * @param {import('pg').Pool} pool
 */
export async function handlePaymentsConfirmWebhook(req, pool) {
  const result = await handlePaymentsWebhookIntake(req, pool);
  const body = result?.body || {};

  // Fire-and-forget Bull signal so workers wake within milliseconds instead
  // of waiting for the next DB poll cycle. The DB row is already committed
  // and durable at this point, so signal failure is non-fatal.
  if (body.queued && body.idempotency_key && body.event_id) {
    const provider = String(body.idempotency_key).split(':')[0] || 'unknown';
    void enqueuePaymentWebhookSignal({
      provider,
      event_id: body.event_id,
      idempotency_key: body.idempotency_key,
      trace_id: body.trace_id || null,
    })
      .then((r) => {
        if (!r?.enqueued && r?.reason && r.reason !== 'queue_not_initialized') {
          console.warn('[paymentsWebhookConfirm] bull signal not enqueued', {
            trace_id: body.trace_id || null,
            event_id: body.event_id,
            idempotency_key: body.idempotency_key,
            reason: r.reason,
            error: r.error || null,
          });
        }
      })
      .catch((e) => {
        console.warn('[paymentsWebhookConfirm] bull signal threw', {
          trace_id: body.trace_id || null,
          event_id: body.event_id,
          idempotency_key: body.idempotency_key,
          error: e?.message || String(e),
        });
      });
  }

  return result;
}
