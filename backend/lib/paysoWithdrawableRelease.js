/**
 * PaySo weekly release: pending settlement → withdrawable + RECEIVED (Wednesday cron or admin).
 * Idempotent: rows already released are skipped.
 */

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ updated: number }>}
 */
export async function releasePendingPaysoWithdrawable(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      WITH sums AS (
        SELECT wt.user_id::uuid AS uid, SUM(COALESCE(wt.net_amount_thb, pla.net_amount, 0))::numeric AS add_amt
        FROM wallet_transactions wt
        INNER JOIN payment_ledger_audit pla ON pla.id = wt.ledger_id
        WHERE wt.funding_source = 'PAYSO'
          AND wt.is_withdrawable = false
          AND wt.settlement_status = 'PENDING_SETTLEMENT'
        GROUP BY wt.user_id
      )
      UPDATE users u
      SET wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + sums.add_amt,
          updated_at = NOW()
      FROM sums
      WHERE u.id = sums.uid
    `);
    const r = await client.query(`
      UPDATE wallet_transactions wt
      SET is_withdrawable = true,
          settlement_status = 'RECEIVED',
          settled_at = NOW(),
          available_on = NULL
      WHERE wt.funding_source = 'PAYSO'
        AND wt.is_withdrawable = false
        AND wt.settlement_status = 'PENDING_SETTLEMENT'
      RETURNING wt.id
    `);
    await client.query('COMMIT');
    return { updated: r.rowCount || 0 };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    throw e;
  } finally {
    client.release();
  }
}
