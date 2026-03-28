/**
 * Delegates to SQL verify_gateway_ledger_integrity() (migration 147).
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string, unknown>>}
 */
export async function verifyLedgerIntegrity(pool) {
  const r = await pool.query(`SELECT verify_gateway_ledger_integrity() AS result`);
  const raw = r.rows?.[0]?.result;
  if (raw && typeof raw === 'object') return raw;
  if (raw && typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { ok: false, parseError: true };
    }
  }
  return { ok: false, reason: 'no_result' };
}
