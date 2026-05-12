import crypto from 'crypto';

function toObj(v) {
  return v && typeof v === 'object' ? v : {};
}

function toStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function firstNonEmpty(values) {
  for (const v of values) {
    const s = toStr(v);
    if (s) return s;
  }
  return '';
}

function parsePositiveAmount(values) {
  for (const v of values) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeProvider(input, headers = {}, payload = {}) {
  const h = toObj(headers);
  const p = toObj(payload);
  const raw = firstNonEmpty([
    input,
    h['x-payment-gateway'],
    h['x-gateway'],
    p.provider,
    p.gateway,
    toObj(p.data).provider,
    toObj(p.data).gateway,
  ]).toLowerCase();
  if (raw.includes('payso')) return 'payso';
  if (raw.includes('ksher')) return 'ksher';
  return raw || 'unknown';
}

function normalizeStatus(payload = {}) {
  const p = toObj(payload);
  const data = toObj(p.data);
  const statusRaw = firstNonEmpty([
    data.status,
    data.payment_status,
    data.order_status,
    data.state,
    p.status,
    p.payment_status,
  ]);
  return statusRaw.toLowerCase();
}

function normalizeEventType(payload = {}, status = '') {
  const p = toObj(payload);
  const data = toObj(p.data);
  const rawType = firstNonEmpty([
    p.event,
    p.type,
    data.event,
    data.type,
    data.event_type,
    status,
  ]).toLowerCase();

  if (
    rawType.includes('charge.complete') ||
    rawType.includes('payment.success') ||
    rawType.includes('paid') ||
    rawType.includes('success') ||
    rawType.includes('completed') ||
    rawType.includes('succeeded')
  ) {
    return 'payment_confirmed';
  }
  if (
    rawType.includes('fail') ||
    rawType.includes('cancel') ||
    rawType.includes('void') ||
    rawType.includes('expire') ||
    rawType.includes('reject')
  ) {
    return 'payment_failed';
  }
  if (
    rawType.includes('pending') ||
    rawType.includes('processing') ||
    rawType.includes('wait') ||
    rawType.includes('created')
  ) {
    return 'payment_pending';
  }
  return 'unsupported';
}

/**
 * Normalize webhook payload from multiple providers into one shape.
 * @param {{
 *  payload: any,
 *  headers?: Record<string, any>,
 *  provider?: string | null,
 *  rawHash?: string | null
 * }} input
 */
export function normalizePaymentWebhookEvent(input) {
  const payload = toObj(input?.payload);
  const headers = toObj(input?.headers);
  const data = toObj(payload.data);
  const metadata = toObj(data.metadata || payload.metadata);

  const provider = normalizeProvider(input?.provider, headers, payload);
  const status = normalizeStatus(payload);
  const event_type = normalizeEventType(payload, status);
  const raw_hash = toStr(input?.rawHash) || crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const issues = [];

  let event_id = firstNonEmpty([
    payload.id,
    payload.event_id,
    data.event_id,
    data.notify_id,
    data.notification_id,
  ]);
  if (!event_id) {
    issues.push('missing_provider_event_id');
    event_id = `raw:${provider}:${raw_hash.slice(0, 24)}`;
  }

  const amount = parsePositiveAmount([
    data.amount,
    data.total_amount,
    data.amount_thb,
    data.pay_amount,
    data.order_amount,
    payload.amount,
  ]);
  if (amount == null) issues.push('invalid_amount');
  if (event_type === 'unsupported') issues.push('unsupported_event_type');

  const normalized = {
    provider,
    event_id,
    event_type,
    payment_id: firstNonEmpty([
      metadata.meerak_order_id,
      metadata.payment_id,
      data.charge_id,
      data.merchant_order_id,
      data.order_id,
      payload.order_id,
    ]) || null,
    client_reference_id:
      firstNonEmpty([
        metadata.client_reference_id,
        metadata.client_ref_id,
        data.client_reference_id,
        payload.client_reference_id,
      ]) || null,
    amount,
    currency: firstNonEmpty([data.currency, payload.currency, metadata.currency, 'THB']).toUpperCase(),
    status: status || 'unknown',
    purpose:
      firstNonEmpty([
        metadata.purpose,
        metadata.payment_purpose,
        data.purpose,
        payload.purpose,
      ]) || null,
    occurred_at:
      firstNonEmpty([
        data.paid_at,
        data.completed_at,
        data.updated_at,
        payload.created_at,
        payload.timestamp,
      ]) || null,
    raw_hash,
    trace_id:
      firstNonEmpty([
        headers['x-trace-id'],
        headers['x-request-id'],
        payload.trace_id,
        metadata.trace_id,
      ]) || `trace:${raw_hash.slice(0, 16)}`,
  };

  return {
    ...normalized,
    issues,
  };
}

