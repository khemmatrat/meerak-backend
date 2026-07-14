/**
 * Course marketplace reviews — enrolled + progress gate, denormalized ratings.
 */
export const MIN_REVIEW_PROGRESS_PCT = 25;

export function canReviewFromProgress(progressPct, completedAt = null) {
  const pct = Number(progressPct || 0);
  const completed = !!completedAt || pct >= 100;
  return completed || pct >= MIN_REVIEW_PROGRESS_PCT;
}

export async function getEnrollmentReviewEligibility(pool, userId, courseId) {
  if (!userId) {
    return {
      ok: false,
      canReview: false,
      httpStatus: 401,
      error: 'Login required',
      code: 'auth_required',
    };
  }

  const r = await pool.query(
    `SELECT progress_pct, completed_at FROM course_enrollments
     WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  if (!r.rows?.[0]) {
    return {
      ok: false,
      canReview: false,
      httpStatus: 403,
      error: 'ลงทะเบียนคอร์สก่อนรีวิว',
      code: 'not_enrolled',
      progressPct: 0,
    };
  }

  const progressPct = Number(r.rows[0].progress_pct || 0);
  const completedAt = r.rows[0].completed_at;
  const canReview = canReviewFromProgress(progressPct, completedAt);

  if (!canReview) {
    return {
      ok: false,
      canReview: false,
      httpStatus: 403,
      error: `เรียนไปอย่างน้อย ${MIN_REVIEW_PROGRESS_PCT}% หรือจบคอร์สก่อนรีวิว`,
      code: 'insufficient_progress',
      progressPct,
      minProgressPct: MIN_REVIEW_PROGRESS_PCT,
    };
  }

  return {
    ok: true,
    canReview: true,
    progressPct,
    completed: !!completedAt || progressPct >= 100,
  };
}

export async function refreshCourseRatingStats(pool, courseId) {
  const r = await pool.query(
    `UPDATE courses SET
       rating_avg = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM course_reviews WHERE course_id = $1 AND is_hidden IS NOT TRUE), 0),
       rating_count = COALESCE((SELECT COUNT(*)::int FROM course_reviews WHERE course_id = $1 AND is_hidden IS NOT TRUE), 0),
       updated_at = NOW()
     WHERE id = $1
     RETURNING rating_avg, rating_count`,
    [courseId],
  );
  return {
    ratingAvg: Number(r.rows?.[0]?.rating_avg || 0),
    ratingCount: Number(r.rows?.[0]?.rating_count || 0),
  };
}

export async function getMyCourseReview(pool, userId, courseId) {
  const r = await pool.query(
    `SELECT id, rating, comment, created_at, updated_at FROM course_reviews
     WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function submitCourseReview(pool, userId, courseId, { rating, comment = '' } = {}) {
  const score = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
  if (!score) {
    return { ok: false, httpStatus: 400, error: 'rating required', code: 'rating_required' };
  }

  const eligibility = await getEnrollmentReviewEligibility(pool, userId, courseId);
  if (!eligibility.canReview) {
    return {
      ok: false,
      httpStatus: eligibility.httpStatus || 403,
      error: eligibility.error,
      code: eligibility.code,
      progressPct: eligibility.progressPct,
      minProgressPct: eligibility.minProgressPct,
    };
  }

  await pool.query(
    `INSERT INTO course_reviews (user_id, course_id, rating, comment)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (user_id, course_id) DO UPDATE SET
       rating = EXCLUDED.rating,
       comment = EXCLUDED.comment,
       updated_at = NOW()`,
    [userId, courseId, score, String(comment || '').slice(0, 4000)],
  );

  const stats = await refreshCourseRatingStats(pool, courseId);
  const mine = await getMyCourseReview(pool, userId, courseId);

  return { ok: true, review: mine, ...stats };
}

export async function deleteCourseReview(pool, userId, courseId) {
  const r = await pool.query(
    `DELETE FROM course_reviews WHERE user_id = $1::uuid AND course_id = $2 RETURNING id`,
    [userId, courseId],
  );
  if (!r.rows?.[0]) {
    return { ok: false, httpStatus: 404, error: 'Review not found', code: 'review_not_found' };
  }
  const stats = await refreshCourseRatingStats(pool, courseId);
  return { ok: true, ...stats };
}

export async function updateCourseReview(pool, userId, courseId, { rating, comment = '' } = {}) {
  return submitCourseReview(pool, userId, courseId, { rating, comment });
}

const REVIEW_SORTS = {
  newest: 'cr.created_at DESC',
  rating_high: 'cr.rating DESC, cr.created_at DESC',
  rating_low: 'cr.rating ASC, cr.created_at DESC',
};

export function normalizeReviewSort(sort) {
  const key = String(sort || 'newest').toLowerCase();
  return REVIEW_SORTS[key] ? key : 'newest';
}

export async function listCourseReviews(pool, courseId, { limit = 10, offset = 0, sort = 'newest' } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const off = Math.max(Number(offset) || 0, 0);
  const sortKey = normalizeReviewSort(sort);
  const orderBy = REVIEW_SORTS[sortKey];

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM course_reviews WHERE course_id = $1 AND is_hidden IS NOT TRUE`,
    [courseId],
  );
  const total = Number(countRes.rows?.[0]?.n || 0);

  const r = await pool.query(
    `SELECT cr.id, cr.user_id, cr.rating, cr.comment, cr.created_at, cr.updated_at, u.full_name
     FROM course_reviews cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.course_id = $1 AND cr.is_hidden IS NOT TRUE
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [courseId, cap, off],
  );

  return {
    reviews: (r.rows || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      rating: row.rating,
      comment: row.comment || '',
      full_name: row.full_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    total,
    limit: cap,
    offset: off,
    hasMore: off + cap < total,
    sort: sortKey,
  };
}

/** @deprecated use listCourseReviews with options */
export async function listCourseReviewsLegacy(pool, courseId, limit = 50) {
  const r = await listCourseReviews(pool, courseId, { limit, offset: 0, sort: 'newest' });
  return r.reviews;
}

export function buildRatingDistribution(reviews = []) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const n = Number(r.rating || 0);
    if (n >= 1 && n <= 5) dist[n] += 1;
  }
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  return { dist, total };
}
