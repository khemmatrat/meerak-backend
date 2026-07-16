/** Rider KYC portrait (verified selfie) — shared query for admin + rider profile. */

export function riderKycWhereSql(alias = 'ks') {
  const a = alias ? `${alias}.` : '';
  return `(
    ${a}address ILIKE '%AQOND แอปไรเดอร์%'
    OR ${a}vehicles_json::text ILIKE '%aqond_delivery%'
    OR ${a}vehicles_json::text ILIKE '%aqond_storefront%'
    OR ${a}vehicles_json::text ILIKE '%rider_os%'
  )`;
}

export async function getRiderKycPortrait(pool, userId) {
  const row = await pool.query(
    `SELECT selfie_photo_url, status, submitted_at
       FROM kyc_submissions
      WHERE user_id = $1::uuid AND ${riderKycWhereSql('')}
      ORDER BY submitted_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const rec = row.rows?.[0];
  const url = String(rec?.selfie_photo_url || '').trim();
  if (!url) {
    return { portrait_url: null, verified: false, source: null };
  }
  return {
    portrait_url: url,
    verified: ['approved', 'verified', 'pending_review', 'pending', 'under_review'].includes(
      String(rec?.status || '').toLowerCase(),
    ),
    source: 'kyc_selfie',
    submitted_at: rec?.submitted_at || null,
  };
}
