/**
 * Resolve Social Core identity + build targeting signals from meerak user profile
 */
export async function resolveSocialCoreIdentity(pool, meerakUserId) {
  if (!meerakUserId) return null;
  try {
    const hasTable = await pool
      .query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'identity_links'`)
      .then((r) => r.rows?.length > 0);
    if (hasTable) {
      const link = await pool.query(
        `SELECT social_core_identity_id FROM identity_links WHERE meerak_user_id = $1::uuid LIMIT 1`,
        [meerakUserId],
      );
      if (link.rows?.[0]?.social_core_identity_id) {
        return String(link.rows[0].social_core_identity_id);
      }
      await pool.query(
        `INSERT INTO identity_links (meerak_user_id, social_core_identity_id)
         VALUES ($1::uuid, $1::uuid)
         ON CONFLICT (meerak_user_id) DO NOTHING`,
        [meerakUserId],
      );
    }
  } catch (e) {
    console.warn('[adsTargeting] identity_links:', e?.message);
  }
  return String(meerakUserId);
}

export async function buildAdsTargetingSignals(pool, meerakUserId, extra = {}) {
  const signals = {
    geographyIso: extra.geographyIso || null,
    languagePrefs: extra.languagePrefs || ['th'],
    providerCategoryTags: [],
    searchInterestTags: [],
    followerUserSample: [],
    engagementCategoryTags: [],
  };
  if (!meerakUserId) return signals;

  try {
    const u = await pool.query(
      `SELECT role, preferred_language, city, province, service_categories FROM users WHERE id = $1::uuid LIMIT 1`,
      [meerakUserId],
    );
    const row = u.rows?.[0];
    if (row?.preferred_language) {
      signals.languagePrefs = [String(row.preferred_language).slice(0, 8)];
    }
    if (row?.province) signals.geographyIso = String(row.province).slice(0, 8);
    if (row?.service_categories && Array.isArray(row.service_categories)) {
      signals.providerCategoryTags = row.service_categories.map(String).slice(0, 20);
    } else if (row?.role === 'PROVIDER') {
      signals.providerCategoryTags = ['provider'];
    }
  } catch {
    /* optional columns */
  }

  try {
    const hasViews = await pool
      .query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'video_likes'`)
      .then((r) => r.rows?.length > 0);
    if (hasViews) {
      const eng = await pool.query(
        `SELECT DISTINCT v.title FROM video_likes vl
         JOIN talent_videos v ON v.id = vl.video_id
         WHERE vl.user_id = $1::uuid
         ORDER BY vl.created_at DESC NULLS LAST
         LIMIT 8`,
        [meerakUserId],
      );
      signals.engagementCategoryTags = (eng.rows || [])
        .map((r) => String(r.title || '').slice(0, 40))
        .filter(Boolean);
    }
  } catch {
    /* ignore */
  }

  return signals;
}
