/**
 * Shared helpers for course marketplace + studio routes.
 */
import { redactLessonForViewer } from './courseLessonPlayback.js';

export function asJson(value, fallback) {
  if (value == null) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function userId(req) {
  return req.user?.id || req.user?.uid || req.user?.user_id || null;
}

export function slugify(input) {
  return String(input || 'course')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'course';
}

export function mapCourse(row, extras = {}) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    category: row.category || '',
    duration: row.duration || 0,
    level: row.level || 'beginner',
    imageUrl: row.image_url || '',
    instructorUserId: row.instructor_user_id ? String(row.instructor_user_id) : null,
    instructorName: row.instructor_name || 'AQOND Instructor',
    priceThb: Number(row.price_thb || 0),
    originalPriceThb: row.original_price_thb != null ? Number(row.original_price_thb) : null,
    currency: row.currency || 'THB',
    status: row.status || 'draft',
    isMarketplace: !!row.is_marketplace,
    platformRateOverride: row.platform_rate_override != null ? Number(row.platform_rate_override) : null,
    promoVideoUrl: row.promo_video_url || '',
    thumbnailVariants: asJson(row.thumbnail_variants, {}),
    language: row.language || 'th',
    learningOutcomes: asJson(row.learning_outcomes, []),
    requirements: asJson(row.requirements, []),
    totalEnrolled: Number(row.total_enrolled || 0),
    ratingAvg: Number(row.rating_avg || 0),
    ratingCount: Number(row.rating_count || 0),
    publishedAt: row.published_at || null,
    submittedAt: row.submitted_at || null,
    featuredAt: row.featured_at || null,
    featuredRank: Number(row.featured_rank || 0),
    rejectionReason: row.rejection_reason || null,
    sequentialUnlock: !!row.sequential_unlock,
    enrolled: !!row.enrolled,
    saved: !!row.saved,
    ...extras,
  };
}

export async function loadCourseDetail(pool, courseId, viewerId = null, includeDraft = false) {
  const c = await pool.query(
    `SELECT c.*, u.full_name AS instructor_name,
            u.provider_status AS instructor_provider_status,
            (SELECT COUNT(*)::int FROM coach_trainee_connections cc
             WHERE cc.coach_id = c.instructor_user_id AND cc.status = 'active') AS instructor_coach_count,
            (SELECT COUNT(*)::int FROM advance_jobs aj
             WHERE aj.hired_user_id = c.instructor_user_id AND aj.status = 'completed') AS instructor_completed_jobs,
            EXISTS (SELECT 1 FROM course_enrollments e WHERE e.course_id = c.id AND e.user_id = $2::uuid) AS enrolled,
            EXISTS (SELECT 1 FROM saved_marketplace_courses s WHERE s.course_id = c.id AND s.user_id = $2::uuid) AS saved,
            EXISTS (
              SELECT 1 FROM course_recommendations cr
              WHERE cr.course_id = c.id AND cr.trainee_id = $2::uuid
            ) AS coach_recommended
     FROM courses c
     LEFT JOIN users u ON u.id = c.instructor_user_id
     WHERE c.id = $1
       AND c.is_marketplace = TRUE
       AND ($3::boolean OR c.status = 'published')
     LIMIT 1`,
    [courseId, viewerId || '00000000-0000-0000-0000-000000000000', includeDraft],
  );
  if (!c.rows?.[0]) return null;

  const sectionsRes = await pool.query(
    `SELECT id, title, sort_order FROM course_sections WHERE course_id = $1 ORDER BY sort_order, created_at`,
    [courseId],
  );
  const lessonsRes = await pool.query(
    `SELECT id, section_id, title, sort_order, step_type, video_url, text_content,
            duration_min, quiz_pass_percent, is_preview, resource_urls
     FROM course_lessons
     WHERE course_id = $1
     ORDER BY COALESCE(section_id::text, ''), sort_order, created_at`,
    [courseId],
  );
  const lessons = (lessonsRes.rows || []).map((l) =>
    redactLessonForViewer(mapLessonRow(l), { allowVideoUrl: includeDraft }),
  );
  const sections = (sectionsRes.rows || []).map((s) => ({
    id: s.id,
    title: s.title,
    sortOrder: s.sort_order,
    lessons: lessons.filter((l) => String(l.sectionId || '') === String(s.id)),
  }));
  const unsectioned = lessons.filter((l) => !l.sectionId);
  if (unsectioned.length) sections.push({ id: null, title: 'บทเรียน', sortOrder: 9999, lessons: unsectioned });

  return mapCourse(c.rows[0], { sections, lessons });
}

export function mapLessonRow(l) {
  return {
    id: l.id,
    sectionId: l.section_id,
    title: l.title,
    sortOrder: l.sort_order,
    stepType: l.step_type,
    videoUrl: l.video_url,
    hasVideo: !!(l.video_url || l.step_type === 'video'),
    textContent: l.text_content,
    durationMin: l.duration_min,
    quizPassPercent: l.quiz_pass_percent,
    isPreview: !!l.is_preview,
    resourceUrls: asJson(l.resource_urls, []),
    watchedSecondsRequired: Number(l.watched_seconds_required || 0),
  };
}

export async function readCoursePolicy(pool) {
  try {
    const r = await pool.query(
      `SELECT value_json FROM payout_config WHERE key = 'course_revenue_policy' LIMIT 1`,
    );
    return asJson(r.rows?.[0]?.value_json, {});
  } catch {
    return {};
  }
}

export async function assertStudioCourseOwner(pool, courseId, uid) {
  const r = await pool.query(
    `SELECT 1 FROM courses WHERE id = $1 AND instructor_user_id = $2::uuid AND is_marketplace = TRUE LIMIT 1`,
    [courseId, uid],
  );
  return !!r.rows?.[0];
}

export async function readInstructorProfile(pool, uid) {
  try {
    const r = await pool.query(
      `SELECT user_id, headline, bio, avatar_url, payout_eligible
       FROM course_instructor_profiles WHERE user_id = $1::uuid LIMIT 1`,
      [uid],
    );
    return r.rows?.[0] || null;
  } catch {
    return null;
  }
}

/** Block curriculum edits while course is live on marketplace. */
export async function assertStudioCourseEditable(pool, courseId, uid) {
  const r = await pool.query(
    `SELECT status FROM courses
     WHERE id = $1 AND instructor_user_id = $2::uuid AND is_marketplace = TRUE LIMIT 1`,
    [courseId, uid],
  );
  if (!r.rows?.[0]) {
    return { ok: false, httpStatus: 404, error: 'Course not found' };
  }
  if (r.rows[0].status === 'published') {
    return {
      ok: false,
      httpStatus: 400,
      error: 'ถอดจากขาย (unlist) ก่อนแก้ไขบทเรียน',
      code: 'COURSE_PUBLISHED_LOCKED',
    };
  }
  return { ok: true, status: r.rows[0].status };
}

/** Build WHERE/ORDER fragments for published marketplace catalog (Phase 2). */
export function buildMarketplaceCatalogFilters(query = {}) {
  const q = String(query.q || '').trim();
  const category = String(query.category || '').trim();
  const level = String(query.level || '').trim();
  const language = String(query.language || '').trim();
  const sort = String(query.sort || 'featured');
  const priceMinRaw = query.price_min ?? query.priceMin;
  const priceMaxRaw = query.price_max ?? query.priceMax;
  const minRatingRaw = query.min_rating ?? query.minRating;

  const params = [];
  let where = `WHERE c.is_marketplace = TRUE AND c.status = 'published'`;

  if (q) {
    params.push(`%${q}%`);
    where += ` AND (c.title ILIKE $${params.length} OR c.subtitle ILIKE $${params.length} OR c.description ILIKE $${params.length})`;
  }
  if (category) {
    params.push(category);
    where += ` AND c.category = $${params.length}`;
  }
  if (level) {
    params.push(level);
    where += ` AND c.level = $${params.length}`;
  }
  if (language) {
    params.push(language);
    where += ` AND c.language = $${params.length}`;
  }
  if (priceMinRaw != null && priceMinRaw !== '') {
    params.push(Number(priceMinRaw));
    where += ` AND c.price_thb >= $${params.length}`;
  }
  if (priceMaxRaw != null && priceMaxRaw !== '') {
    params.push(Number(priceMaxRaw));
    where += ` AND c.price_thb <= $${params.length}`;
  }
  if (minRatingRaw != null && minRatingRaw !== '') {
    params.push(Number(minRatingRaw));
    where += ` AND c.rating_avg >= $${params.length}`;
  }

  const order =
    sort === 'rating' ? 'c.rating_avg DESC, c.rating_count DESC' :
    sort === 'price_low' ? 'c.price_thb ASC' :
    sort === 'price_high' ? 'c.price_thb DESC' :
    sort === 'newest' ? 'c.published_at DESC NULLS LAST' :
    'c.featured_rank DESC NULLS LAST, c.featured_at DESC NULLS LAST, c.total_enrolled DESC, c.published_at DESC NULLS LAST';

  return { where, params, order };
}

export function mapInstructorProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id ? String(row.user_id) : null,
    headline: row.headline || '',
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    payoutEligible: !!row.payout_eligible,
  };
}
