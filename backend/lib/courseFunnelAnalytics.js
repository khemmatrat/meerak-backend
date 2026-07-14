/**
 * Course marketplace funnel analytics — isolated event stream.
 */

export const COURSE_FUNNEL_EVENTS = [
  'course_impression',
  'course_detail_view',
  'course_preview_play',
  'course_purchase_intent',
  'course_purchase_completed',
  'course_lesson_completed',
  'course_completed',
  'course_review_submitted',
  'course_qa_posted',
];

const ALLOWED = new Set(COURSE_FUNNEL_EVENTS);

export function normalizeFunnelEventType(value) {
  const t = String(value || '').trim().toLowerCase();
  return ALLOWED.has(t) ? t : null;
}

export async function trackCourseFunnelEvent(pool, {
  userId = null,
  courseId,
  eventType,
  sessionId = null,
  metadata = {},
}) {
  const type = normalizeFunnelEventType(eventType);
  const cid = String(courseId || '').trim();
  if (!type || !cid) return { ok: false, reason: 'invalid_event' };

  try {
    await pool.query(
      `INSERT INTO course_funnel_events (user_id, course_id, session_id, event_type, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      [
        userId || null,
        cid,
        sessionId ? String(sessionId).slice(0, 64) : null,
        type,
        JSON.stringify(metadata || {}),
      ],
    );
    return { ok: true };
  } catch (e) {
    if (String(e?.code) === '42P01') return { ok: false, reason: 'table_missing' };
    console.warn('[courseFunnelAnalytics] track failed:', e?.message);
    return { ok: false, reason: e?.message };
  }
}

export async function getCourseFunnelReport(pool, { from = null, to = null, courseId = null } = {}) {
  const params = [];
  let where = 'WHERE 1=1';
  if (courseId) {
    params.push(String(courseId));
    where += ` AND course_id = $${params.length}`;
  }
  if (from) {
    params.push(from);
    where += ` AND created_at >= $${params.length}::timestamptz`;
  }
  if (to) {
    params.push(to);
    where += ` AND created_at <= $${params.length}::timestamptz`;
  }

  const counts = await pool.query(
    `SELECT event_type, COUNT(*)::int AS events, COUNT(DISTINCT COALESCE(user_id::text, session_id, id::text))::int AS unique_actors
     FROM course_funnel_events
     ${where}
     GROUP BY event_type
     ORDER BY event_type`,
    params,
  );

  const byCourse = await pool.query(
    `SELECT course_id, event_type, COUNT(*)::int AS events
     FROM course_funnel_events
     ${where}
     GROUP BY course_id, event_type
     ORDER BY course_id, event_type
     LIMIT 500`,
    params,
  );

  const map = Object.fromEntries(COURSE_FUNNEL_EVENTS.map((t) => [t, 0]));
  for (const row of counts.rows || []) {
    map[row.event_type] = Number(row.events || 0);
  }

  const impression = map.course_impression || 0;
  const detail = map.course_detail_view || 0;
  const preview = map.course_preview_play || 0;
  const intent = map.course_purchase_intent || 0;
  const purchase = map.course_purchase_completed || 0;
  const lesson = map.course_lesson_completed || 0;
  const review = map.course_review_submitted || 0;
  const qa = map.course_qa_posted || 0;
  const completed = map.course_completed || 0;

  return {
    counts: counts.rows || [],
    byCourse: byCourse.rows || [],
    funnel: {
      course_impression: impression,
      course_detail_view: detail,
      course_preview_play: preview,
      course_purchase_intent: intent,
      course_purchase_completed: purchase,
      course_lesson_completed: lesson,
      course_review_submitted: review,
      course_qa_posted: qa,
      course_completed: completed,
    },
    conversion: {
      detail_rate: impression > 0 ? Math.round((detail / impression) * 10000) / 100 : null,
      preview_rate: detail > 0 ? Math.round((preview / detail) * 10000) / 100 : null,
      intent_rate: detail > 0 ? Math.round((intent / detail) * 10000) / 100 : null,
      purchase_rate: intent > 0 ? Math.round((purchase / intent) * 10000) / 100 : null,
      lesson_rate: purchase > 0 ? Math.round((lesson / purchase) * 10000) / 100 : null,
      review_rate: purchase > 0 ? Math.round((review / purchase) * 10000) / 100 : null,
      qa_rate: purchase > 0 ? Math.round((qa / purchase) * 10000) / 100 : null,
    },
  };
}
