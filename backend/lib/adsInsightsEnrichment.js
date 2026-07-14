/**
 * Enrich SC insights with meerak-local escrow truth (dailySeries.escrowRemaining).
 */
export async function enrichDailySeriesEscrow(pool, campaignId, dailySeries, escrow) {
  if (!escrow || !Array.isArray(dailySeries) || !dailySeries.length) return dailySeries || [];

  const escrowMicro = BigInt(escrow.escrow_micro || 0);
  const spendRows = await pool
    .query(
      `SELECT to_char(DATE(created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(cost_micro), 0)::bigint AS spend_micro
       FROM ad_outcome_billable_log
       WHERE campaign_id = $1 AND status IN ('billed', 'disputed', 'reversed')
       GROUP BY 1
       ORDER BY 1`,
      [campaignId],
    )
    .catch(() => ({ rows: [] }));

  const spendByDay = new Map(
    (spendRows.rows || []).map((r) => [String(r.day), BigInt(r.spend_micro || 0)]),
  );

  let cumulative = 0n;
  return [...dailySeries]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((d) => {
      const dayKey = String(d.date).slice(0, 10);
      cumulative += spendByDay.get(dayKey) || 0n;
      const remaining = escrowMicro - cumulative;
      return {
        ...d,
        escrowRemainingMicro: (remaining > 0n ? remaining : 0n).toString(),
        escrowRemainingSource: 'meerak_escrow',
      };
    });
}
