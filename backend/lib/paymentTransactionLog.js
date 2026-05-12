/**
 * Transaction logging — ยอดเต็ม, MDR, ค่าธรรมเนียมโปรเซสเซอร์, ประมาณกำไรสุทธิหลังหักค่าธรรมเนียม
 */
import { round2 } from './financialEngine.js';

/**
 * @param {number} grossThb
 * @param {number} mdrDecimal — เช่น 0.005 = 0.5%
 * @param {number} [fixedFeeThb]
 */
export function computeProcessorFeeBreakdown(grossThb, mdrDecimal, fixedFeeThb = 0) {
  const gross = round2(Math.max(0, Number(grossThb) || 0));
  const r = Math.max(0, Number(mdrDecimal) || 0);
  const f = round2(Math.max(0, Number(fixedFeeThb) || 0));
  const mdrFeePctPart = round2(gross * r);
  const totalProcessorFee = round2(mdrFeePctPart + f);
  const netAfterProcessor = round2(Math.max(0, gross - totalProcessorFee));
  return {
    gross_amount_thb: gross,
    mdr_rate_decimal: r,
    mdr_fee_from_percent_thb: mdrFeePctPart,
    fixed_fee_thb: f,
    total_processor_fee_thb: totalProcessorFee,
    net_after_processor_thb: netAfterProcessor,
  };
}

/**
 * net_profit_estimate_thb = platform markup ที่เก็บจากลูกค้า − ค่าโปรเซสเซอร์ (ถ้ามีตัวเลข markup)
 * @param {{ platformMarkupThb?: number }} opts
 */
export function computeNetProfitEstimate(breakdown, opts = {}) {
  const markup = round2(Math.max(0, Number(opts.platformMarkupThb) || 0));
  const proc = round2(Number(breakdown.total_processor_fee_thb) || 0);
  return round2(Math.max(0, markup - proc));
}

/**
 * Idempotency — กันบันทึกซ้ำเมื่อ Gateway ส่ง webhook ซ้ำ
 * ลำดับ: webhook_event_id → webhook_idempotency_key → external_id
 * @param {import('pg').Pool} pool
 * @param {{ gateway: string, externalId?: string|null, webhookEventId?: string|null, idempotencyKey?: string|null }} keys
 */
export async function findExistingWebhookTransactionLog(pool, keys) {
  if (!pool || !keys?.gateway) return null;
  const gw = String(keys.gateway);
  const ext = keys.externalId != null && String(keys.externalId).trim() !== '' ? String(keys.externalId).trim() : null;
  const ev =
    keys.webhookEventId != null && String(keys.webhookEventId).trim() !== ''
      ? String(keys.webhookEventId).trim()
      : null;
  const idem =
    keys.idempotencyKey != null && String(keys.idempotencyKey).trim() !== ''
      ? String(keys.idempotencyKey).trim()
      : null;
  try {
    if (ev) {
      const r = await pool.query(
        `SELECT id, status, created_at, external_id FROM payment_transaction_logs
         WHERE gateway = $1 AND COALESCE(metadata->>'webhook_event_id','') = $2
         LIMIT 1`,
        [gw, ev],
      );
      if (r.rows?.length) return r.rows[0];
    }
    if (idem) {
      const r = await pool.query(
        `SELECT id, status, created_at, external_id FROM payment_transaction_logs
         WHERE gateway = $1 AND COALESCE(metadata->>'webhook_idempotency_key','') = $2
         LIMIT 1`,
        [gw, idem],
      );
      if (r.rows?.length) return r.rows[0];
    }
    if (ext) {
      const r = await pool.query(
        `SELECT id, status, created_at, external_id FROM payment_transaction_logs
         WHERE gateway = $1 AND external_id = $2
         LIMIT 1`,
        [gw, ext],
      );
      if (r.rows?.length) return r.rows[0];
    }
  } catch (e) {
    console.warn('[payment_transaction_logs] idempotency lookup failed:', e?.message || e);
  }
  return null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} row
 */
export async function insertPaymentTransactionLog(pool, row) {
  if (!pool || !row || typeof row !== 'object') return null;
  const {
    jobId = null,
    userId = null,
    externalId = null,
    gateway = 'unknown',
    paymentChannel = 'promptpay',
    eventType = 'gateway_callback',
    status = 'recorded',
    grossAmountThb,
    mdrRateDecimal,
    mdrFeeThb,
    fixedFeeThb = 0,
    netAfterProcessorThb,
    platformMarkupThb = null,
    netProfitEstimateThb = null,
    metadata = {},
  } = row;

  const q = `
    INSERT INTO payment_transaction_logs (
      job_id, user_id, external_id, gateway, payment_channel,
      gross_amount_thb, mdr_rate_decimal, mdr_fee_thb, fixed_fee_thb,
      net_after_processor_thb, platform_markup_thb, net_profit_estimate_thb,
      event_type, status, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id, created_at
  `;
  const vals = [
    jobId,
    userId,
    externalId,
    String(gateway),
    String(paymentChannel),
    grossAmountThb != null ? round2(Number(grossAmountThb)) : null,
    mdrRateDecimal != null ? Number(mdrRateDecimal) : null,
    mdrFeeThb != null ? round2(Number(mdrFeeThb)) : null,
    fixedFeeThb != null ? round2(Number(fixedFeeThb)) : null,
    netAfterProcessorThb != null ? round2(Number(netAfterProcessorThb)) : null,
    platformMarkupThb != null ? round2(Number(platformMarkupThb)) : null,
    netProfitEstimateThb != null ? round2(Number(netProfitEstimateThb)) : null,
    String(eventType),
    String(status),
    JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
  ];
  try {
    const r = await pool.query(q, vals);
    return r.rows?.[0] || null;
  } catch (e) {
    console.warn('[payment_transaction_logs] insert skipped:', e?.message || e);
    return null;
  }
}
