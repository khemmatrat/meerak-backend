/**
 * ส่ง FCM push สำหรับ Advance Job board badges — มี deep_link สำหรับเปิดหน้าที่ถูกต้องบน device
 */
import { sendFcmMulticast } from './fcmService.js';
import { AQOND_FCM_CHANNEL_JOB_ALERTS } from './fcmPushDefaults.js';

function appHashLink(deepLink) {
  const path = String(deepLink || '').trim();
  if (!path) return null;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const appBase = String(process.env.VITE_APP_URL || process.env.APP_URL || 'https://aqond.com').replace(/\/$/, '');
  return `${appBase}/#${normalized.replace(/^\//, '')}`;
}

function extractJobId(deepLink) {
  const m = String(deepLink || '').match(/\/job-board\/([^/?#]+)/);
  return m?.[1] || '';
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ user_id: string, title?: string, body?: string, deep_link?: string|null, type?: string, source?: string }} payload
 */
export async function deliverAdvanceJobPush(pool, payload) {
  const userId = String(payload?.user_id || '').trim();
  if (!userId) return { skipped: true, reason: 'missing_user' };
  if (!pool) return { skipped: true, reason: 'missing_pool' };

  const idStr = userId;
  const peace = await pool
    .query(
      'SELECT is_peace_mode FROM users WHERE id::text = $1 OR firebase_uid = $1 OR phone = $1 LIMIT 1',
      [idStr],
    )
    .catch(() => ({ rows: [] }));
  if (peace.rows?.[0]?.is_peace_mode) {
    return { skipped: true, reason: 'peace_mode' };
  }

  const uuidRow = await pool
    .query('SELECT id FROM users WHERE id::text = $1 OR firebase_uid = $1 OR phone = $1 LIMIT 1', [idStr])
    .catch(() => ({ rows: [] }));
  const uuid = uuidRow.rows?.[0]?.id ? String(uuidRow.rows[0].id) : idStr;

  const tokens = await pool
    .query(
      `SELECT token FROM fcm_tokens WHERE user_id = $1::uuid AND token IS NOT NULL AND token != ''`,
      [uuid],
    )
    .then((r) => (r.rows || []).map((x) => x.token).filter(Boolean))
    .catch(() => []);

  if (tokens.length === 0) {
    return { skipped: true, reason: 'no_tokens', user_id: uuid };
  }

  const deepLink = String(payload.deep_link || '').trim();
  const title = payload.title || 'AQOND Job Board';
  const body = payload.body || 'มีรายการที่ต้องดำเนินการ';
  const webLink = appHashLink(deepLink);

  const result = await sendFcmMulticast(tokens, {
    title,
    body,
    icon: '/logo.png',
    channelId: AQOND_FCM_CHANNEL_JOB_ALERTS,
    link: webLink || undefined,
    data: {
      deep_link: deepLink,
      route: deepLink,
      notification_type: payload.type || 'advance_job',
      source: payload.source || 'board_badges',
      job_id: extractJobId(deepLink),
      open_chat: deepLink.includes('/chat/') ? '1' : '',
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[advanceJobPushDelivery]', {
      user_id: uuid,
      deep_link: deepLink,
      tokens: tokens.length,
      ...result,
    });
  }

  return { ok: true, user_id: uuid, deep_link: deepLink, ...result };
}

/**
 * Adapter สำหรับ advanceJobBoardPushBridge — enqueue Bull หรือส่งตรงเมื่อไม่มี Redis
 */
export function createAqPushQueueAdapter(pool, pushQueue) {
  return {
    add: async (_queueName, payload, opts) => {
      if (pushQueue) {
        return pushQueue.add(payload, opts || { removeOnComplete: 100, removeOnFail: 50 });
      }
      if (pool) {
        return deliverAdvanceJobPush(pool, payload);
      }
      return null;
    },
  };
}
