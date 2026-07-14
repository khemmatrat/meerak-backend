/**
 * Privacy-safe audience engagement — click heatmap + age buckets.
 */

function ageBucketFromDob(dob) {
  if (!dob) return 'unknown';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 'unknown';
  const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age < 18) return 'under_18';
  if (age < 25) return '18_24';
  if (age < 35) return '25_34';
  if (age < 45) return '35_44';
  if (age < 55) return '45_54';
  return '55_plus';
}

export async function getCampaignAudienceEngagement(pool, campaignId, { rangeDays = 30 } = {}) {
  const sinceDays = Math.max(1, Math.min(rangeDays, 90));

  const [heatmap, ageRows, outcomeKinds] = await Promise.all([
    pool.query(
      `SELECT EXTRACT(HOUR FROM clicked_at AT TIME ZONE 'Asia/Bangkok')::int AS hour,
              COUNT(*)::int AS clicks
       FROM ad_click_attribution
       WHERE campaign_id = $1 AND clicked_at >= NOW() - ($2::text || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      [campaignId, String(sinceDays)],
    ),
    pool.query(
      `SELECT
         CASE
           WHEN u.date_of_birth IS NULL THEN 'unknown'
           ELSE (
             CASE
               WHEN EXTRACT(YEAR FROM AGE(u.date_of_birth)) < 18 THEN 'under_18'
               WHEN EXTRACT(YEAR FROM AGE(u.date_of_birth)) < 25 THEN '18_24'
               WHEN EXTRACT(YEAR FROM AGE(u.date_of_birth)) < 35 THEN '25_34'
               WHEN EXTRACT(YEAR FROM AGE(u.date_of_birth)) < 45 THEN '35_44'
               WHEN EXTRACT(YEAR FROM AGE(u.date_of_birth)) < 55 THEN '45_54'
               ELSE '55_plus'
             END
           )
         END AS age_bucket,
         COUNT(*)::int AS clicks
       FROM ad_click_attribution a
       JOIN users u ON u.id = a.meerak_user_id
       WHERE a.campaign_id = $1 AND a.clicked_at >= NOW() - ($2::text || ' days')::interval
       GROUP BY 1 ORDER BY clicks DESC`,
      [campaignId, String(sinceDays)],
    ),
    pool.query(
      `SELECT conversion_kind, COUNT(*)::int AS cnt
       FROM ad_outcome_billable_log
       WHERE campaign_id = $1
         AND created_at >= NOW() - ($2::text || ' days')::interval
         AND status IN ('billed', 'disputed', 'reversed')
       GROUP BY 1 ORDER BY cnt DESC`,
      [campaignId, String(sinceDays)],
    ),
  ]);

  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    clicks: heatmap.rows.find((r) => Number(r.hour) === h)?.clicks || 0,
  }));

  return {
    rangeDays: sinceDays,
    clickHeatmap: hours,
    ageBuckets: ageRows.rows.map((r) => ({
      bucket: r.age_bucket,
      label: ageBucketLabel(r.age_bucket),
      clicks: r.clicks,
    })),
    outcomesByKind: outcomeKinds.rows,
  };
}

function ageBucketLabel(bucket) {
  const map = {
    under_18: 'ต่ำกว่า 18',
    '18_24': '18–24',
    '25_34': '25–34',
    '35_44': '35–44',
    '45_54': '45–54',
    '55_plus': '55+',
    unknown: 'ไม่ระบุ',
  };
  return map[bucket] || bucket;
}
