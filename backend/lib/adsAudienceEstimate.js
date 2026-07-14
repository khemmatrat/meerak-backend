/**
 * AQOND population-based reach estimate for ad targeting.
 */
export async function estimateAdsAudience(pool, { provinces = [], surfaces = ['VIDEO_FEED'] } = {}) {
  let userCount = 0;
  let provinceBreakdown = [];

  try {
    if (provinces.length) {
      const r = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(province), ''), 'ไม่ระบุ') AS province, COUNT(*)::int AS cnt
         FROM users
         WHERE province IS NOT NULL AND TRIM(province) <> ''
           AND (province = ANY($1::text[]) OR EXISTS (
             SELECT 1 FROM unnest($1::text[]) p WHERE province ILIKE '%' || p || '%'
           ))
         GROUP BY 1 ORDER BY cnt DESC LIMIT 15`,
        [provinces],
      );
      provinceBreakdown = r.rows;
      userCount = provinceBreakdown.reduce((s, row) => s + (row.cnt || 0), 0);
    } else {
      const r = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE COALESCE(is_active, true) = true`);
      userCount = r.rows[0]?.cnt || 0;
    }
  } catch {
    const r = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users`).catch(() => ({ rows: [{ cnt: 0 }] }));
    userCount = r.rows[0]?.cnt || 0;
  }

  const surfaceCount = Math.max(1, surfaces.length);
  const freqCap = 3;
  const estimatedWeeklyReach = Math.max(
    50,
    Math.round(userCount * 0.12 * Math.min(1, surfaceCount * 0.4) / freqCap),
  );
  const estimatedWeeklyImpressions = estimatedWeeklyReach * freqCap;

  return {
    estimatedWeeklyReach,
    estimatedWeeklyImpressions,
    addressableUsers: userCount,
    provinceBreakdown,
    surfaces,
    targetingProvinces: provinces,
    frequencyCapPerCreative24h: freqCap,
    disclaimer: 'ประมาณการจากผู้ใช้ AQOND จริง — ไม่ใช่การรับประกันผลลัพธ์',
  };
}
