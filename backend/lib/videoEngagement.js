/**
 * Video feed engagement — views (dedup per day), shares, saves.
 * Internal design for aqond; not derived from third-party app source code.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function tableExists(pool, name) {
  const r = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [name]);
  return r.rows?.length > 0;
}

async function columnExists(pool, table, col) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, col]
  );
  return r.rows?.length > 0;
}

export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

function normChannel(ch) {
  const c = String(ch || 'unknown')
    .trim()
    .toLowerCase()
    .slice(0, 32);
  if (!/^[a-z0-9_-]+$/.test(c)) return 'unknown';
  return c || 'unknown';
}

function actorKeyForView(userId, visitorId) {
  if (userId && isUuid(userId)) return `u:${String(userId).trim()}`;
  const v = String(visitorId || '')
    .trim()
    .slice(0, 64);
  if (v.length < 8) return null;
  const safe = v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (safe.length < 8) return null;
  return `v:${safe}`;
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ counted: boolean, view_count: number }>}
 */
export async function recordVideoView(pool, { videoId, userId, visitorId }) {
  const vid = String(videoId || '').trim();
  if (!isUuid(vid)) return { counted: false, view_count: 0 };

  const exists = await pool.query(`SELECT 1 FROM talent_videos WHERE id = $1::uuid`, [vid]);
  if (!exists.rows?.length) return { counted: false, view_count: 0 };

  const hasBuckets = await pool
    .query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'video_view_buckets'`)
    .then((r) => r.rows?.length > 0);
  if (!hasBuckets) return { counted: false, view_count: 0 };

  const actor = actorKeyForView(userId, visitorId);
  if (!actor) return { counted: false, view_count: 0 };

  const hasViewCol = await pool
    .query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'talent_videos' AND column_name = 'view_count'`
    )
    .then((r) => r.rows?.length > 0);
  if (!hasViewCol) return { counted: false, view_count: 0 };

  const daySql = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date`;

  const ins = await pool.query(
    `INSERT INTO video_view_buckets (video_id, actor_key, bucket_date)
     VALUES ($1::uuid, $2, ${daySql})
     ON CONFLICT (video_id, actor_key, bucket_date) DO NOTHING
     RETURNING 1`,
    [vid, actor]
  );

  if (ins.rows?.length) {
    await pool.query(`UPDATE talent_videos SET view_count = view_count + 1 WHERE id = $1::uuid`, [vid]);
  }

  const r = await pool.query(`SELECT COALESCE(view_count, 0)::bigint AS c FROM talent_videos WHERE id = $1::uuid`, [vid]);
  const view_count = Number(r.rows?.[0]?.c || 0);
  return { counted: ins.rows?.length > 0, view_count };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function recordVideoShare(pool, { videoId, userId, channel }) {
  const vid = String(videoId || '').trim();
  if (!isUuid(vid)) return { share_count: 0, recorded: false };

  const has = await pool
    .query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'video_shares'`)
    .then((r) => r.rows?.length > 0);
  if (!has) return { share_count: 0, recorded: false };

  const ex = await pool.query(`SELECT 1 FROM talent_videos WHERE id = $1::uuid`, [vid]);
  if (!ex.rows?.length) return { share_count: 0, recorded: false };

  const ch = normChannel(channel);
  const uid = userId && isUuid(userId) ? userId : null;

  await pool.query(`INSERT INTO video_shares (video_id, user_id, channel) VALUES ($1::uuid, $2::uuid, $3)`, [
    vid,
    uid,
    ch,
  ]);

  const c = await pool.query(`SELECT COUNT(*)::bigint AS n FROM video_shares WHERE video_id = $1::uuid`, [vid]);
  return { share_count: Number(c.rows?.[0]?.n || 0), recorded: true };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function toggleVideoSave(pool, userId, videoId) {
  const uid = String(userId || '').trim();
  const vid = String(videoId || '').trim();
  if (!isUuid(uid) || !isUuid(vid)) {
    return { saved: false, save_count: 0, error: 'invalid_id' };
  }

  const has = await pool
    .query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'video_saves'`)
    .then((r) => r.rows?.length > 0);
  if (!has) return { saved: false, save_count: 0, error: 'not_configured' };

  const ex = await pool.query(`SELECT 1 FROM talent_videos WHERE id = $1::uuid`, [vid]);
  if (!ex.rows?.length) return { saved: false, save_count: 0, error: 'not_found' };

  const cur = await pool.query(`SELECT 1 FROM video_saves WHERE video_id = $1::uuid AND user_id = $2::uuid`, [vid, uid]);
  let saved;
  if (cur.rows?.length) {
    await pool.query(`DELETE FROM video_saves WHERE video_id = $1::uuid AND user_id = $2::uuid`, [vid, uid]);
    saved = false;
  } else {
    await pool.query(
      `INSERT INTO video_saves (video_id, user_id) VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (video_id, user_id) DO NOTHING`,
      [vid, uid]
    );
    saved = true;
  }

  const n = await pool.query(`SELECT COUNT(*)::bigint AS n FROM video_saves WHERE video_id = $1::uuid`, [vid]);
  return { saved, save_count: Number(n.rows?.[0]?.n || 0) };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getVideoEngagementStats(pool, videoId, viewerUserId) {
  const vid = String(videoId || '').trim();
  if (!isUuid(vid)) return null;

  const hasLikes = await tableExists(pool, 'video_likes');
  const hasComments = await tableExists(pool, 'video_comments');
  const hasShares = await tableExists(pool, 'video_shares');
  const hasSaves = await tableExists(pool, 'video_saves');
  const hasViewCol = await columnExists(pool, 'talent_videos', 'view_count');

  const likeSel = hasLikes
    ? `COALESCE((SELECT COUNT(*)::bigint FROM video_likes WHERE video_id = v.id), 0)`
    : `0::bigint`;
  const commentSel = hasComments
    ? `COALESCE((SELECT COUNT(*)::bigint FROM video_comments WHERE video_id = v.id), 0)`
    : `0::bigint`;
  const shareSel = hasShares
    ? `COALESCE((SELECT COUNT(*)::bigint FROM video_shares WHERE video_id = v.id), 0)`
    : `0::bigint`;
  const saveSel = hasSaves
    ? `COALESCE((SELECT COUNT(*)::bigint FROM video_saves WHERE video_id = v.id), 0)`
    : `0::bigint`;
  const viewSel = hasViewCol ? `COALESCE(v.view_count, 0)::bigint` : `0::bigint`;

  const row = await pool.query(
    `SELECT
       ${likeSel} AS like_count,
       ${commentSel} AS comment_count,
       ${shareSel} AS share_count,
       ${saveSel} AS save_count,
       ${viewSel} AS view_count
     FROM talent_videos v WHERE v.id = $1::uuid`,
    [vid]
  );
  if (!row.rows?.length) return null;

  const r = row.rows[0];
  let liked_by_me = false;
  let saved_by_me = false;
  const viewer = viewerUserId && isUuid(viewerUserId) ? viewerUserId : null;
  if (viewer && hasLikes) {
    const l = await pool.query(`SELECT 1 FROM video_likes WHERE video_id = $1::uuid AND user_id = $2::uuid`, [
      vid,
      viewer,
    ]);
    liked_by_me = !!l.rows?.length;
  }
  if (viewer && hasSaves) {
    const s = await pool.query(`SELECT 1 FROM video_saves WHERE video_id = $1::uuid AND user_id = $2::uuid`, [
      vid,
      viewer,
    ]);
    saved_by_me = !!s.rows?.length;
  }

  return {
    like_count: Number(r.like_count || 0),
    comment_count: Number(r.comment_count || 0),
    share_count: Number(r.share_count || 0),
    save_count: Number(r.save_count || 0),
    view_count: Number(r.view_count || 0),
    liked_by_me,
    saved_by_me,
  };
}
