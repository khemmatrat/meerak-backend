/**
 * Gated lesson playback — video URLs are never exposed in catalog/detail JSON.
 * Clients fetch short-lived embed URLs via authenticated playback endpoint.
 */
import crypto from 'crypto';

const PLAYBACK_TTL_SEC = 60 * 30;

export function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/(?:youtube\.com\/.*[?&]v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

export function buildYouTubeEmbedUrl(videoId, { origin = '', enableApi = true } = {}) {
  if (!videoId) return '';
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (enableApi) {
    params.set('enablejsapi', '1');
    if (origin) params.set('origin', origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function signPlaybackPayload(payload, secret) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret || 'dev-playback-secret').update(body).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

export function verifyPlaybackSignature(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const body = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const expected = crypto.createHmac('sha256', secret || 'dev-playback-secret').update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function redactLessonForViewer(lesson, { allowVideoUrl = false } = {}) {
  const mapped = lesson?.video_url != null || lesson?.videoUrl != null
    ? {
        id: lesson.id,
        sectionId: lesson.section_id ?? lesson.sectionId,
        title: lesson.title,
        sortOrder: lesson.sort_order ?? lesson.sortOrder,
        stepType: lesson.step_type ?? lesson.stepType,
        videoUrl: lesson.video_url ?? lesson.videoUrl,
        textContent: lesson.text_content ?? lesson.textContent,
        durationMin: lesson.duration_min ?? lesson.durationMin,
        quizPassPercent: lesson.quiz_pass_percent ?? lesson.quizPassPercent,
        isPreview: !!(lesson.is_preview ?? lesson.isPreview),
        resourceUrls: lesson.resource_urls ?? lesson.resourceUrls ?? [],
        watchedSecondsRequired: Number(lesson.watched_seconds_required ?? lesson.watchedSecondsRequired ?? 0),
      }
    : { ...lesson };

  const hasVideo = !!(mapped.videoUrl || mapped.stepType === 'video');
  if (allowVideoUrl) return { ...mapped, hasVideo };

  const { videoUrl: _drop, ...rest } = mapped;
  return { ...rest, hasVideo };
}

export async function assertLessonPlaybackAccess(pool, userId, courseId, lessonId) {
  const lessonRes = await pool.query(
    `SELECT cl.*, c.status, c.is_marketplace
     FROM course_lessons cl
     JOIN courses c ON c.id = cl.course_id
     WHERE cl.id = $1::uuid AND cl.course_id = $2
     LIMIT 1`,
    [lessonId, courseId],
  );
  const lesson = lessonRes.rows?.[0];
  if (!lesson) return { ok: false, httpStatus: 404, error: 'Lesson not found' };
  if (!lesson.is_marketplace || lesson.status !== 'published') {
    return { ok: false, httpStatus: 403, error: 'Course not available' };
  }

  if (lesson.is_preview) {
    return { ok: true, lesson, access: 'preview' };
  }

  if (!userId) {
    return { ok: false, httpStatus: 401, error: 'Login required to watch this lesson' };
  }

  const enrolled = await pool.query(
    `SELECT 1 FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  if (!enrolled.rows?.[0]) {
    return { ok: false, httpStatus: 403, error: 'Enroll before watching this lesson' };
  }

  return { ok: true, lesson, access: 'enrolled' };
}

export function createLessonPlaybackGrant(lesson, { origin = '', secret = '' } = {}) {
  const videoId = extractYouTubeVideoId(lesson.video_url);
  const expiresAt = new Date(Date.now() + PLAYBACK_TTL_SEC * 1000).toISOString();

  if (videoId) {
    const embedUrl = buildYouTubeEmbedUrl(videoId, { origin, enableApi: true });
    const playbackToken = signPlaybackPayload(
      { courseId: lesson.course_id, lessonId: lesson.id, videoId, exp: expiresAt },
      secret,
    );
    return {
      provider: 'youtube',
      videoId,
      embedUrl,
      expiresAt,
      playbackToken,
    };
  }

  if (lesson.video_url) {
    const playbackToken = signPlaybackPayload(
      { courseId: lesson.course_id, lessonId: lesson.id, exp: expiresAt },
      secret,
    );
    return {
      provider: 'direct',
      embedUrl: lesson.video_url,
      expiresAt,
      playbackToken,
    };
  }

  return {
    provider: 'none',
    embedUrl: null,
    expiresAt,
    playbackToken: null,
  };
}
