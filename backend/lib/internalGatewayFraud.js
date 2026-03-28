/**
 * @fileoverview Fraud scoring for AQOND Internal Gateway (card-testing / velocity / patterns).
 * No PAN/CVV — uses metadata flags, IP, device, and aggregate DB signals only.
 */

/** @typedef {import('pg').Pool|import('pg').PoolClient} PgClient */

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Suspicious amount patterns (card testing): round thousands, repeated micro-amounts.
 * @param {number} amountMinor
 * @returns {number} sub-score 0–25
 */
export function scoreAmountPattern(amountMinor) {
  const a = Math.max(0, Math.floor(Number(amountMinor) || 0));
  if (a <= 0) return 5;
  let s = 0;
  if (a % 100000 === 0 && a >= 100000) s += 12;
  if (a === 100 || a === 200 || a === 500 || a === 1000) s += 15;
  if (a % 1111 === 0 && a > 1111) s += 10;
  if (a % 10000 === 0 && a >= 10000 && a <= 50000) s += 8;
  return clamp(s, 0, 25);
}

/**
 * If card BIN country vs IP-derived country disagree (future-proof; no PAN stored).
 * @param {{ cardCountry?: string | null, ipCountry?: string | null }} ctx
 * @returns {number} 0–25
 */
export function scoreCountryMismatch(ctx) {
  const c = (ctx.cardCountry || '').trim().toUpperCase();
  const ip = (ctx.ipCountry || '').trim().toUpperCase();
  if (!c || !ip) return 0;
  if (c.length !== 2 || ip.length !== 2) return 0;
  return c !== ip ? 22 : 0;
}

/**
 * Same device, different IP in short window (existing rule) — contributes to score.
 * @param {PgClient} pool
 * @param {{ deviceId?: string | null, ipAddress?: string | null, excludeTransactionId?: string | null }} p
 * @returns {Promise<number>} 0–30
 */
export async function scoreVelocityDeviceIp(pool, p) {
  const deviceId = p.deviceId ? String(p.deviceId).trim() : '';
  const ip = p.ipAddress ? String(p.ipAddress).trim() : '';
  if (!deviceId || !ip) return 0;
  try {
    const r = await pool.query(
      `SELECT 1 FROM gateway_transactions
       WHERE device_id = $1
         AND ($2::uuid IS NULL OR id <> $2::uuid)
         AND created_at > NOW() - INTERVAL '25 minutes'
         AND ip_address IS NOT NULL
         AND ip_address::text <> $3
       LIMIT 1`,
      [deviceId, p.excludeTransactionId || null, ip]
    );
    return r.rows?.length ? 28 : 0;
  } catch (e) {
    if (e && (e.code === '42703' || e.code === '42P01')) return 0;
    throw e;
  }
}

/**
 * Transaction frequency per user (metadata.user_id): >5 attempts in 1 hour → high risk.
 * @param {PgClient} pool
 * @param {{ userId?: string | null, excludeTransactionId?: string | null }} p
 * @returns {Promise<{ count: number, score: number, highRisk: boolean }>}
 */
export async function evaluateTransactionFrequency(pool, p) {
  const uid = p.userId ? String(p.userId).trim() : '';
  if (!uid) return { count: 0, score: 0, highRisk: false };
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM gateway_transactions
       WHERE COALESCE(metadata->>'user_id','') = $1
         AND ($2::uuid IS NULL OR id <> $2::uuid)
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [uid, p.excludeTransactionId || null]
    );
    const c = Number(r.rows?.[0]?.c) || 0;
    /** Prior attempts in window (current tx excluded) — 5 prior = 6th attempt total → high risk */
    const highRisk = c >= 5;
    const score = highRisk ? 20 : clamp(Math.floor(c) * 3, 0, 18);
    return { count: c, score, highRisk };
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) return { count: 0, score: 0, highRisk: false };
    throw e;
  }
}

/**
 * Same amount repeated many times in 1h (same device) — card testing pattern.
 * @param {PgClient} pool
 * @param {{ deviceId?: string | null, amountMinor: number, excludeTransactionId?: string | null }} p
 * @returns {Promise<number>} 0–15
 */
export async function scoreRepeatedAmount1h(pool, p) {
  const dev = p.deviceId ? String(p.deviceId).trim() : '';
  const amt = Math.floor(Number(p.amountMinor) || 0);
  if (!dev || amt <= 0) return 0;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM gateway_transactions
       WHERE device_id = $1 AND amount_minor = $2
         AND ($3::uuid IS NULL OR id <> $3::uuid)
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [dev, amt, p.excludeTransactionId || null]
    );
    const c = Number(r.rows?.[0]?.c) || 0;
    return c >= 2 ? clamp(8 + c * 2, 0, 15) : 0;
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) return 0;
    throw e;
  }
}

/**
 * Composite fraud score (0–100). Intended for ML hand-off later.
 *
 * @param {PgClient} pool
 * @param {{
 *   amountMinor: number,
 *   deviceId?: string | null,
 *   ipAddress?: string | null,
 *   excludeTransactionId?: string | null,
 *   metadata?: Record<string, unknown> | null,
 * }} ctx
 * @returns {Promise<{
 *   score: number,
 *   shouldVoid: boolean,
 *   breakdown: Record<string, number | boolean | string>,
 *   highRiskFrequency: boolean,
 * }>}
 */
export async function calculateFraudScore(pool, ctx) {
  const meta = ctx.metadata && typeof ctx.metadata === 'object' ? ctx.metadata : {};
  const userId =
    (meta.user_id != null && String(meta.user_id)) ||
    (meta.employer_user_id != null && String(meta.employer_user_id)) ||
    null;
  const cardCountry = meta.card_country != null ? String(meta.card_country) : meta.cardCountry != null ? String(meta.cardCountry) : null;
  const ipCountry = meta.ip_country != null ? String(meta.ip_country) : meta.ipCountry != null ? String(meta.ipCountry) : null;

  const vel = await scoreVelocityDeviceIp(pool, {
    deviceId: ctx.deviceId,
    ipAddress: ctx.ipAddress,
    excludeTransactionId: ctx.excludeTransactionId,
  });
  const amtPat = scoreAmountPattern(ctx.amountMinor);
  const country = scoreCountryMismatch({ cardCountry, ipCountry });
  const freq = await evaluateTransactionFrequency(pool, { userId, excludeTransactionId: ctx.excludeTransactionId });
  const repeatAmt = await scoreRepeatedAmount1h(pool, {
    deviceId: ctx.deviceId,
    amountMinor: ctx.amountMinor,
    excludeTransactionId: ctx.excludeTransactionId,
  });

  const raw = vel + amtPat * 0.9 + country + freq.score + repeatAmt;
  const score = clamp(Math.round(raw), 0, 100);

  const threshold = Math.min(
    100,
    Math.max(50, parseInt(process.env.INTERNAL_GATEWAY_FRAUD_SCORE_THRESHOLD || '80', 10) || 80)
  );
  const shouldVoid = score >= threshold || freq.highRisk;

  return {
    score,
    shouldVoid,
    highRiskFrequency: freq.highRisk,
    breakdown: {
      velocity_device_ip: vel,
      amount_pattern: amtPat,
      country_mismatch: country,
      user_frequency_1h: freq.count,
      frequency_score: freq.score,
      repeated_amount_1h: repeatAmt,
      threshold,
    },
  };
}

/**
 * Legacy fast path — kept for backward compatibility; superseded by {@link calculateFraudScore}.
 * @param {PgClient} pool
 * @param {{ deviceId?: string | null, ipAddress?: string | null, excludeTransactionId?: string | null }} p
 * @returns {Promise<{ shouldVoid: boolean, reason?: string }>}
 */
export async function evaluateFraudVelocity(pool, p) {
  const n = await scoreVelocityDeviceIp(pool, p);
  if (n > 0) return { shouldVoid: true, reason: 'fraud_velocity_device_ip' };
  return { shouldVoid: false };
}
