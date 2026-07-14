/**
 * Saved promoted (sponsored) clips — keyed by creative_id, not per-impression id.
 */

function normCreativeId(id) {
  const s = String(id || '').trim();
  return s.length >= 4 && s.length <= 128 ? s : '';
}

function normOptional(s, max = 512) {
  const x = String(s || '').trim();
  return x ? x.slice(0, max) : null;
}

async function tableExists(pool) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'saved_promoted_clips'`,
  );
  return r.rows?.length > 0;
}

export async function togglePromotedClipSave(pool, userId, payload) {
  const uid = String(userId || '').trim();
  const creativeId = normCreativeId(payload?.creative_id || payload?.creativeId);
  if (!uid || !creativeId) {
    return { saved: false, error: 'invalid_id' };
  }

  const has = await tableExists(pool);
  if (!has) return { saved: false, error: 'not_configured' };

  const cur = await pool.query(
    `SELECT 1 FROM saved_promoted_clips WHERE user_id = $1::uuid AND creative_id = $2`,
    [uid, creativeId],
  );

  let saved;
  if (cur.rows?.length) {
    await pool.query(
      `DELETE FROM saved_promoted_clips WHERE user_id = $1::uuid AND creative_id = $2`,
      [uid, creativeId],
    );
    saved = false;
  } else {
    const snapshot =
      payload?.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : {};
    await pool.query(
      `INSERT INTO saved_promoted_clips (
         user_id, creative_id, campaign_id, title, description,
         video_url, thumbnail_url, destination_url, media_type, content_kind, snapshot
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (user_id, creative_id) DO NOTHING`,
      [
        uid,
        creativeId,
        normOptional(payload?.campaign_id || payload?.campaignId, 128),
        normOptional(payload?.title, 300),
        normOptional(payload?.description, 2000),
        normOptional(payload?.video_url || payload?.videoUrl, 2000),
        normOptional(payload?.thumbnail_url || payload?.thumbnailUrl, 2000),
        normOptional(payload?.destination_url || payload?.destinationUrl, 2000),
        normOptional(payload?.media_type || payload?.mediaType, 16) || 'video',
        normOptional(payload?.content_kind || payload?.contentKind, 32),
        JSON.stringify(snapshot),
      ],
    );
    saved = true;
  }

  const n = await pool.query(
    `SELECT COUNT(*)::bigint AS n FROM saved_promoted_clips WHERE user_id = $1::uuid`,
    [uid],
  );
  return { saved, save_count: Number(n.rows?.[0]?.n || 0), creative_id: creativeId };
}

export async function listSavedPromotedClips(pool, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const has = await tableExists(pool);
  if (!has) return [];

  const r = await pool.query(
    `SELECT creative_id, campaign_id, title, description, video_url, thumbnail_url,
            destination_url, media_type, content_kind, snapshot, created_at
     FROM saved_promoted_clips
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 100`,
    [uid],
  );

  return (r.rows || []).map((row) => {
    const snap = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};
    const adFromSnap = snap.ad && typeof snap.ad === 'object' ? snap.ad : {};
    return {
      id: `ad-${row.creative_id}`,
      mixKind: 'sponsored',
      mediaType: row.media_type || 'video',
      talent_id: '',
      video_url: row.video_url || '',
      thumbnail_url: row.thumbnail_url || null,
      title: row.title || 'โปรโมต',
      description: row.description || '',
      duration_seconds: null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      talent_name: 'โปรโมต',
      talent_avatar: null,
      like_count: 0,
      comment_count: 0,
      save_count: 0,
      saved_by_me: true,
      liked_by_me: false,
      ad: {
        creativeId: row.creative_id,
        campaignId: row.campaign_id || adFromSnap.campaignId || null,
        destinationUrl: row.destination_url || adFromSnap.destinationUrl || null,
        contentKind: row.content_kind || adFromSnap.contentKind || null,
        mediaType: row.media_type || adFromSnap.mediaType || 'video',
        playbackUrl: adFromSnap.playbackUrl || row.video_url || null,
        posterUrl: adFromSnap.posterUrl || row.thumbnail_url || null,
        fallbackImageUrl: adFromSnap.fallbackImageUrl || row.thumbnail_url || null,
        imageUrl: adFromSnap.imageUrl || row.thumbnail_url || null,
        thumbnailUrl: adFromSnap.thumbnailUrl || row.thumbnail_url || null,
        publicImpressionId: adFromSnap.publicImpressionId || null,
        billingMode: adFromSnap.billingMode || null,
        isHouse: adFromSnap.isHouse || false,
      },
    };
  });
}

export async function listSavedPromotedCreativeIds(pool, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const has = await tableExists(pool);
  if (!has) return [];
  const r = await pool.query(
    `SELECT creative_id FROM saved_promoted_clips WHERE user_id = $1::uuid`,
    [uid],
  );
  return (r.rows || []).map((x) => String(x.creative_id));
}
