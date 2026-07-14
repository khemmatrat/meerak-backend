/**
 * Ads billing reconciliation — wallet spend vs delivery ledger.
 */

export async function buildAdsReconciliationReport(pool, { rangeDays = 7 } = {}) {
  const days = Math.min(Math.max(Number(rangeDays) || 7, 1), 90);

  const wallet = await pool.query(
    `SELECT event_type, COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::numeric AS total_thb
     FROM payment_ledger_audit
     WHERE event_type LIKE 'ad_%'
       AND created_at >= NOW() - ($1::text || ' days')::interval
     GROUP BY event_type
     ORDER BY event_type`,
    [String(days)],
  );

  const spend = await pool.query(
    `SELECT COUNT(*)::int AS campaigns,
            COALESCE(SUM(amount), 0)::numeric AS wallet_spend_thb
     FROM payment_ledger_audit
     WHERE event_type = 'ad_campaign_spend'
       AND created_at >= NOW() - ($1::text || ' days')::interval`,
    [String(days)],
  );

  const refunds = await pool.query(
    `SELECT COUNT(*)::int AS cnt,
            COALESCE(SUM(amount), 0)::numeric AS total_thb
     FROM payment_ledger_audit
     WHERE event_type IN ('ad_campaign_refund', 'ad_render_credit')
       AND created_at >= NOW() - ($1::text || ' days')::interval`,
    [String(days)],
  );

  const billable = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM payment_ledger_audit
     WHERE event_type IN ('ad_impression_billable', 'ad_video_view_billable')
       AND created_at >= NOW() - ($1::text || ' days')::interval`,
    [String(days)],
  );

  const failed = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM payment_ledger_audit
     WHERE event_type = 'ad_render_failed_no_bill'
       AND created_at >= NOW() - ($1::text || ' days')::interval`,
    [String(days)],
  );

  return {
    rangeDays: days,
    walletByEvent: wallet.rows,
    walletSpendThb: Number(spend.rows[0]?.wallet_spend_thb || 0),
    walletSpendCampaigns: spend.rows[0]?.campaigns || 0,
    refundThb: Number(refunds.rows[0]?.total_thb || 0),
    refundCount: refunds.rows[0]?.cnt || 0,
    billableDeliveryEvents: billable.rows[0]?.cnt || 0,
    failedRenderEvents: failed.rows[0]?.cnt || 0,
    note:
      'Prepaid wallet model — billable events are delivery accounting (amount=0 in ledger); compare billableDeliveryEvents to Social Core spendMicro via admin summary.',
  };
}
