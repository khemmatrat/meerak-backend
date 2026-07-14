/**
 * Course marketplace ledger integrity — wraps verify_ledger_chain_integrity + course event audit.
 */

export function parseIntegrityResult(raw) {
  if (raw == null) return { valid: null, totalRows: 0 };
  if (typeof raw === 'string') {
    try {
      return parseIntegrityResult(JSON.parse(raw));
    } catch {
      return { valid: null, totalRows: 0, raw };
    }
  }
  if (typeof raw === 'object') {
    return {
      valid: raw.valid === true ? true : raw.valid === false ? false : null,
      totalRows: Number(raw.total_rows ?? raw.totalRows ?? 0),
      firstBroken: raw.first_broken ?? raw.firstBroken ?? null,
    };
  }
  return { valid: null, totalRows: 0 };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function checkCourseMarketplaceLedgerIntegrity(pool) {
  try {
    const r = await pool.query('SELECT verify_ledger_chain_integrity() AS result');
    const parsed = parseIntegrityResult(r.rows?.[0]?.result);
    return {
      available: true,
      ...parsed,
    };
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('verify_ledger_chain_integrity') || msg.includes('does not exist')) {
      return { available: false, valid: null, totalRows: 0, note: 'verify_ledger_chain_integrity not installed' };
    }
    return { available: false, valid: null, totalRows: 0, error: msg };
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function summarizeCourseLedgerEvents(pool) {
  try {
    const r = await pool.query(
      `SELECT event_type, COUNT(*)::int AS n
       FROM payment_ledger_audit
       WHERE event_type IN ('course_purchase','course_purchase_bnpl','course_refund','course_instructor_payout')
       GROUP BY event_type
       ORDER BY event_type`,
    );
    const byType = Object.fromEntries((r.rows || []).map((row) => [row.event_type, Number(row.n || 0)]));
    return { ok: true, byType, total: Object.values(byType).reduce((a, b) => a + b, 0) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
