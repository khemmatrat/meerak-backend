/**

 * Admin population & engagement summary for ads trust dashboard.

 */

export async function getAdsPopulationSummary(pool, { rangeDays = 7 } = {}) {

  const sinceDays = Math.max(1, Math.min(Number(rangeDays) || 7, 90));



  const [

    totalUsers,

    provinceRows,

    clickBySurface,

    outcomeByKind,

    engagedUsers,

    disputedCount,

    fillByProvince,

    dauByProvince,

    impressionsByProvince,

    statusCounts,

    adEligibleDauTotal,

  ] = await Promise.all([

    pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE COALESCE(is_active, true) = true`),

    pool.query(

      `SELECT COALESCE(NULLIF(TRIM(province), ''), 'ไม่ระบุ') AS province, COUNT(*)::int AS users

       FROM users GROUP BY 1 ORDER BY users DESC LIMIT 15`,

    ),

    pool.query(

      `SELECT COALESCE(surface, 'unknown') AS surface,

              COUNT(*)::int AS clicks,

              COUNT(DISTINCT meerak_user_id)::int AS clickers

       FROM ad_click_attribution

       WHERE clicked_at >= NOW() - ($1::text || ' days')::interval

       GROUP BY 1 ORDER BY clicks DESC`,

      [String(sinceDays)],

    ),

    pool.query(

      `SELECT conversion_kind, COUNT(*)::int AS cnt

       FROM ad_outcome_billable_log

       WHERE created_at >= NOW() - ($1::text || ' days')::interval

         AND status IN ('billed', 'disputed', 'reversed')

       GROUP BY 1`,

      [String(sinceDays)],

    ),

    pool.query(

      `SELECT COUNT(DISTINCT meerak_user_id)::int AS cnt

       FROM ad_click_attribution

       WHERE clicked_at >= NOW() - ($1::text || ' days')::interval`,

      [String(sinceDays)],

    ),

    pool.query(`SELECT COUNT(*)::int AS cnt FROM ad_outcome_billable_log WHERE status = 'disputed'`),

    pool.query(

      `SELECT COALESCE(NULLIF(TRIM(u.province), ''), 'ไม่ระบุ') AS province,

              COUNT(DISTINCT a.meerak_user_id)::int AS clickers,

              COUNT(*)::int AS clicks

       FROM ad_click_attribution a

       JOIN users u ON u.id = a.meerak_user_id

       WHERE a.clicked_at >= NOW() - ($1::text || ' days')::interval

       GROUP BY 1 ORDER BY clicks DESC LIMIT 10`,

      [String(sinceDays)],

    ),

    pool.query(

      `SELECT COALESCE(NULLIF(TRIM(province), ''), 'ไม่ระบุ') AS province,

              COUNT(*)::int AS ad_eligible_dau

       FROM users

       WHERE COALESCE(is_active, true) = true

         AND last_active_at >= NOW() - INTERVAL '1 day'

       GROUP BY 1 ORDER BY ad_eligible_dau DESC LIMIT 15`,

    ),

    pool.query(

      `SELECT COALESCE(NULLIF(TRIM(u.province), ''), 'ไม่ระบุ') AS province,

              COUNT(*)::int AS impressions

       FROM payment_ledger_audit p

       JOIN users u ON u.id = p.user_id

       WHERE p.event_type IN ('ad_impression_billable', 'ad_video_view_billable')

         AND p.created_at >= NOW() - ($1::text || ' days')::interval

       GROUP BY 1 ORDER BY impressions DESC LIMIT 15`,

      [String(sinceDays)],

    ).catch(() => ({ rows: [] })),

    pool

      .query(`SELECT status, COUNT(*)::int AS cnt FROM ad_outcome_billable_log GROUP BY 1`)

      .catch(() => ({ rows: [] })),

    pool.query(

      `SELECT COUNT(*)::int AS cnt FROM users

       WHERE COALESCE(is_active, true) = true

         AND last_active_at >= NOW() - INTERVAL '1 day'`,

    ),

  ]);



  const provinces = provinceRows.rows || [];

  const total = totalUsers.rows[0]?.cnt || 0;

  const engaged = engagedUsers.rows[0]?.cnt || 0;

  const engagementRatePct = total > 0 ? Math.round((engaged / total) * 10000) / 100 : 0;

  const adEligibleDau = adEligibleDauTotal.rows[0]?.cnt || 0;



  const dauMap = new Map((dauByProvince.rows || []).map((r) => [r.province, r.ad_eligible_dau]));

  const impMap = new Map((impressionsByProvince.rows || []).map((r) => [r.province, r.impressions]));



  const engagementByProvince = (fillByProvince.rows || []).map((r) => {

    const provUsers = provinces.find((p) => p.province === r.province)?.users || 0;

    return {

      province: r.province,

      clicks: r.clicks,

      clickers: r.clickers,

      users: provUsers,

      engagementPct: provUsers > 0 ? Math.round((r.clickers / provUsers) * 10000) / 100 : 0,

    };

  });



  const provinceKeys = new Set([

    ...dauMap.keys(),

    ...impMap.keys(),

    ...engagementByProvince.map((r) => r.province),

  ]);



  const fillRateByProvince = [...provinceKeys]

    .map((province) => {

      const dau = dauMap.get(province) || 0;

      const impressions = impMap.get(province) || 0;

      return {

        province,

        adEligibleDau: dau,

        impressions,

        fillRatePct: dau > 0 ? Math.round((impressions / dau) * 10000) / 100 : 0,

      };

    })

    .filter((r) => r.adEligibleDau > 0 || r.impressions > 0)

    .sort((a, b) => b.fillRatePct - a.fillRatePct)

    .slice(0, 15);



  return {

    rangeDays: sinceDays,

    totalUsers: total,

    adEligibleDau,

    engagedUsers: engaged,

    engagementRatePct,

    usersByProvince: provinces,

    clicksBySurface: clickBySurface.rows || [],

    outcomesByKind: outcomeByKind.rows || [],

    outcomesByStatus: statusCounts.rows || [],

    openDisputes: disputedCount.rows[0]?.cnt || 0,

    engagementByProvince,

    fillRateByProvince,

  };

}

