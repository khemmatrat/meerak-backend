/**
 * Relay legs — future: split escrow release to two provider wallets (Driver A / Driver B).
 * Wire from job completion / release flow when job_kind = relay_leg and relay_details are set.
 *
 * @module relayWalletHooks
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} jobId
 * @param {{ leg1_provider_id?: string, leg2_provider_id?: string, leg1_amount_thb?: number, leg2_amount_thb?: number }} [_ctx]
 * @returns {Promise<{ ok: boolean, skipped: boolean }>}
 */
export async function relaySplitOnJobCompleted(pool, jobId, _ctx = {}) {
  void pool;
  void jobId;
  void _ctx;
  return { ok: true, skipped: true };
}
