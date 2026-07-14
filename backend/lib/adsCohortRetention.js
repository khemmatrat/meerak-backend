/**
 * Ads cohort retention — users who converted from ads and returned for another outcome.
 */

export async function getAdsCohortRetention(pool, { campaignId, rangeDays = 90 } = {}) {
  const sinceDays = Math.max(7, Math.min(rangeDays, 180));

  const firstTouch = await pool.query(
    `SELECT DISTINCT ON (meerak_user_id)
            meerak_user_id, campaign_id, clicked_at, conversion_kind
     FROM (
       SELECT a.meerak_user_id, a.campaign_id, a.clicked_at, o.conversion_kind, o.created_at AS outcome_at
       FROM ad_click_attribution a
       JOIN ad_outcome_billable_log o
         ON o.campaign_id = a.campaign_id
        AND o.meerak_user_id = a.meerak_user_id
        AND o.status IN ('billed', 'disputed', 'reversed')
       WHERE a.clicked_at >= NOW() - ($2::text || ' days')::interval
         AND ($1::text IS NULL OR a.campaign_id = $1)
     ) t
     ORDER BY meerak_user_id, outcome_at ASC`,
    [campaignId || null, String(sinceDays)],
  ).catch(() => ({ rows: [] }));

  const repeaters = await pool.query(
    `SELECT o.meerak_user_id, COUNT(*)::int AS outcome_cnt
     FROM ad_outcome_billable_log o
     WHERE o.created_at >= NOW() - ($2::text || ' days')::interval
       AND ($1::text IS NULL OR o.campaign_id = $1)
       AND o.meerak_user_id IS NOT NULL
       AND o.status IN ('billed', 'disputed')
     GROUP BY o.meerak_user_id
     HAVING COUNT(*) >= 2`,
    [campaignId || null, String(sinceDays)],
  ).catch(() => ({ rows: [] }));

  const converters = firstTouch.rows.length;
  const returned = repeaters.rows.length;
  const retentionRatePct = converters > 0 ? Math.round((returned / converters) * 10000) / 100 : 0;

  return {
    rangeDays: sinceDays,
    campaignId: campaignId || null,
    adAttributedConverters: converters,
    repeatOutcomeUsers: returned,
    retentionRatePct,
    disclaimer: 'ผู้ใช้ที่มี outcome จาก ads มากกว่า 1 ครั้งในช่วงเวลา',
  };
}
