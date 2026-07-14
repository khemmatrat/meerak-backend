/**
 * User Stories — 24h ephemeral (Instagram-style tray)
 */
const STORY_TTL_HOURS = 24;

function rowToStory(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    media_type: row.media_type,
    media_url: row.media_url || null,
    text_overlay: row.text_overlay || null,
    background_style:
      row.background_style && typeof row.background_style === 'object'
        ? row.background_style
        : {},
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    user_name: row.user_name || null,
    user_avatar: row.user_avatar || null,
  };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function createStory(pool, {
  userId,
  mediaType,
  mediaUrl,
  textOverlay,
  backgroundStyle,
}) {
  const mt = ['text', 'image', 'video'].includes(mediaType) ? mediaType : 'image';
  const r = await pool.query(
    `INSERT INTO user_stories (user_id, media_type, media_url, text_overlay, background_style, expires_at)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb, NOW() + ($6::int * INTERVAL '1 hour'))
     RETURNING id, user_id, media_type, media_url, text_overlay, background_style, expires_at, created_at`,
    [
      userId,
      mt,
      mediaUrl || null,
      textOverlay ? String(textOverlay).slice(0, 500) : null,
      JSON.stringify(backgroundStyle && typeof backgroundStyle === 'object' ? backgroundStyle : {}),
      STORY_TTL_HOURS,
    ],
  );
  return rowToStory(r.rows[0]);
}

/**
 * Tray for Home — one entry per user with active stories
 * @param {import('pg').Pool} pool
 * @param {string|null} viewerId — UUID for unseen calculation
 */
export async function listStoryTray(pool, viewerId) {
  const params = [];
  let viewerJoin = '';
  if (viewerId) {
    params.push(viewerId);
    viewerJoin = `
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS unseen_count
        FROM user_stories s2
        WHERE s2.user_id = agg.user_id
          AND s2.expires_at > NOW()
          AND NOT EXISTS (
            SELECT 1 FROM user_story_views v
            WHERE v.story_id = s2.id AND v.viewer_id = $1::uuid
          )
      ) un ON true`;
  } else {
    viewerJoin = `LEFT JOIN LATERAL (SELECT 0 AS unseen_count) un ON true`;
  }

  const r = await pool.query(
    `SELECT agg.user_id,
            u.full_name AS user_name,
            u.avatar_url AS user_avatar,
            agg.story_count,
            agg.latest_at,
            COALESCE(un.unseen_count, agg.story_count) AS unseen_count
     FROM (
       SELECT user_id, COUNT(*)::int AS story_count, MAX(created_at) AS latest_at
       FROM user_stories
       WHERE expires_at > NOW()
       GROUP BY user_id
     ) agg
     JOIN users u ON u.id = agg.user_id
     ${viewerJoin}
     ORDER BY (COALESCE(un.unseen_count, agg.story_count) > 0) DESC, agg.latest_at DESC
     LIMIT 50`,
    params,
  );

  return (r.rows || []).map((row) => ({
    user_id: String(row.user_id),
    user_name: row.user_name || 'ผู้ใช้',
    user_avatar: row.user_avatar || null,
    story_count: row.story_count || 0,
    has_unseen: viewerId ? (row.unseen_count || 0) > 0 : true,
    latest_at: row.latest_at ? new Date(row.latest_at).toISOString() : null,
  }));
}

/**
 * @param {import('pg').Pool} pool
 */
export async function listStoriesForUser(pool, targetUserId, viewerId) {
  const r = await pool.query(
    `SELECT s.*, u.full_name AS user_name, u.avatar_url AS user_avatar
     FROM user_stories s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1::uuid AND s.expires_at > NOW()
     ORDER BY s.created_at ASC`,
    [targetUserId],
  );
  const stories = (r.rows || []).map(rowToStory);
  if (!viewerId || stories.length === 0) return { user: stories[0] || null, stories };

  const viewed = await pool.query(
    `SELECT story_id FROM user_story_views
     WHERE viewer_id = $1::uuid AND story_id = ANY($2::uuid[])`,
    [viewerId, stories.map((s) => s.id)],
  );
  const viewedSet = new Set((viewed.rows || []).map((x) => String(x.story_id)));

  return {
    user: {
      user_id: String(targetUserId),
      user_name: stories[0]?.user_name,
      user_avatar: stories[0]?.user_avatar,
    },
    stories: stories.map((s) => ({ ...s, viewed_by_me: viewedSet.has(s.id) })),
  };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function recordStoryView(pool, storyId, viewerId) {
  await pool.query(
    `INSERT INTO user_story_views (story_id, viewer_id, viewed_at)
     VALUES ($1::uuid, $2::uuid, NOW())
     ON CONFLICT (story_id, viewer_id) DO UPDATE SET viewed_at = NOW()`,
    [storyId, viewerId],
  );
}

/**
 * @param {import('pg').Pool} pool
 */
export async function deleteStory(pool, storyId, userId) {
  const r = await pool.query(
    `DELETE FROM user_stories WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
    [storyId, userId],
  );
  return r.rowCount > 0;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function purgeExpiredStories(pool) {
  const r = await pool.query(
    `DELETE FROM user_stories WHERE expires_at < NOW() RETURNING id`,
  );
  return r.rowCount || 0;
}

/**
 * Whether user has any active story (for "your story" ring state)
 */
export async function userHasActiveStories(pool, userId) {
  const r = await pool.query(
    `SELECT 1 FROM user_stories WHERE user_id = $1::uuid AND expires_at > NOW() LIMIT 1`,
    [userId],
  );
  return (r.rows || []).length > 0;
}
