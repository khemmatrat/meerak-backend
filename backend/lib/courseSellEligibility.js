/**
 * Phase 0 guardrails — who may create/sell marketplace courses.
 */

export const COURSE_SELL_DENIED_MESSAGE =
  'ต้องเป็น Verified Provider หรือผ่าน KYC ก่อนขายคอร์ส';

export const COURSE_SELL_DENIED_CODE = 'COURSE_SELL_NOT_ELIGIBLE';

export const SEED_MARKETPLACE_COURSE_ID = 'aqond-service-business-starter';

const ELIGIBLE_KYC = new Set(['verified', 'approved', 'ai_verified']);
const ELIGIBLE_ONBOARDING = new Set(['TRAINING_COMPLETE', 'QUALIFIED']);

/** App Store review / demo accounts — same bypass pattern as job & booking flows. */
export function isAppleDemoCourseSeller(row) {
  if (!row) return false;
  const uid = String(row.firebase_uid || '').toLowerCase();
  const name = String(row.full_name || '').toLowerCase();
  const phone = String(row.phone || '').replace(/\D/g, '');

  if (uid === 'apple-demo-employer' || uid === 'apple-demo-talent') return true;
  if (/apple-demo|apple review|demo employer|demo talent/.test(name)) return true;
  if (phone === '0812345601' || phone === '0812345602') return true;
  if (String(row.email || '').toLowerCase().includes('tester.') && String(row.email || '').includes('@aqond.com')) {
    return true;
  }
  return false;
}

/**
 * Pure eligibility check from a user row (or null).
 * @param {{ can_sell_courses?: boolean, provider_status?: string, kyc_status?: string, onboarding_status?: string, firebase_uid?: string, full_name?: string, phone?: string, email?: string } | null | undefined} row
 */
export function isUserEligibleToSellCourses(row) {
  if (!row) return false;
  if (isAppleDemoCourseSeller(row)) return true;
  if (row.can_sell_courses === true) return true;

  if (String(row.provider_status || '').toUpperCase() === 'VERIFIED_PROVIDER') {
    return true;
  }

  const kyc = String(row.kyc_status || '').toLowerCase();
  if (ELIGIBLE_KYC.has(kyc)) return true;

  const onboarding = String(row.onboarding_status || '').toUpperCase();
  if (ELIGIBLE_ONBOARDING.has(onboarding)) return true;

  return false;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function assertCanSellCourses(pool, userId) {
  if (!pool || !userId) {
    return {
      ok: false,
      code: COURSE_SELL_DENIED_CODE,
      error: COURSE_SELL_DENIED_MESSAGE,
    };
  }

  try {
    const r = await pool.query(
      `SELECT can_sell_courses, provider_status, kyc_status, onboarding_status,
              firebase_uid, full_name, phone, email
       FROM users WHERE id = $1::uuid LIMIT 1`,
      [userId],
    );
    const row = r.rows?.[0];
    if (!isUserEligibleToSellCourses(row)) {
      return {
        ok: false,
        code: COURSE_SELL_DENIED_CODE,
        error: COURSE_SELL_DENIED_MESSAGE,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      code: 'COURSE_SELL_CHECK_FAILED',
      error: e?.message || 'Failed to verify course sell eligibility',
    };
  }
}

/**
 * Phase 0 foundation readiness (seed + guardrails).
 * @param {import('pg').Pool} pool
 */
export async function evaluatePhase0Foundation(pool) {
  const checks = [];

  function push(id, label, pass, detail = null) {
    checks.push({ id, label, pass: !!pass, detail });
  }

  if (!pool) {
    push('pool', 'Database pool', false, 'missing');
    return { ok: false, checks };
  }

  try {
    const pub = await pool.query(
      `SELECT COUNT(*)::int AS n FROM courses WHERE is_marketplace = TRUE AND status = 'published'`,
    );
    const publishedCount = Number(pub.rows?.[0]?.n || 0);
    push('published_marketplace_courses', 'Published marketplace course ≥ 1', publishedCount >= 1, {
      count: publishedCount,
    });
  } catch (e) {
    push('published_marketplace_courses', 'Published marketplace course ≥ 1', false, e?.message);
  }

  try {
    const lessons = await pool.query(
      `SELECT COUNT(*)::int AS n FROM course_lessons
       WHERE course_id IN (SELECT id FROM courses WHERE is_marketplace = TRUE)`,
    );
    const lessonCount = Number(lessons.rows?.[0]?.n || 0);
    push('marketplace_lessons', 'Marketplace lessons ≥ 1', lessonCount >= 1, { count: lessonCount });
  } catch (e) {
    push('marketplace_lessons', 'Marketplace lessons ≥ 1', false, e?.message);
  }

  try {
    const seed = await pool.query(
      `SELECT id, instructor_user_id, promo_video_url, status, is_marketplace
       FROM courses WHERE id = $1 LIMIT 1`,
      [SEED_MARKETPLACE_COURSE_ID],
    );
    const row = seed.rows?.[0];
    push('seed_course_exists', `Seed course "${SEED_MARKETPLACE_COURSE_ID}" exists`, !!row);
    push(
      'seed_instructor_linked',
      'Seed course has instructor_user_id',
      !!row?.instructor_user_id,
      row ? { instructorUserId: row.instructor_user_id ? String(row.instructor_user_id) : null } : null,
    );
    push(
      'seed_promo_video',
      'Seed course has promo_video_url',
      !!String(row?.promo_video_url || '').trim(),
      row ? { hasPromo: !!String(row.promo_video_url || '').trim() } : null,
    );
  } catch (e) {
    push('seed_course_exists', 'Seed course check', false, e?.message);
  }

  try {
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'can_sell_courses'
       LIMIT 1`,
    );
    push('can_sell_courses_column', 'users.can_sell_courses column', !!col.rows?.[0]);
  } catch (e) {
    push('can_sell_courses_column', 'users.can_sell_courses column', false, e?.message);
  }

  try {
    const eligible = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users WHERE can_sell_courses = TRUE`,
    );
    const n = Number(eligible.rows?.[0]?.n || 0);
    push('can_sell_courses_backfill', 'At least one user can_sell_courses', n >= 1, { count: n });
  } catch (e) {
    push('can_sell_courses_backfill', 'can_sell_courses backfill', false, e?.message);
  }

  try {
    const c = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'courses_marketplace_status_check' LIMIT 1`,
    );
    push('status_check_constraint', 'courses_marketplace_status_check constraint', !!c.rows?.[0]);
  } catch (e) {
    push('status_check_constraint', 'status CHECK constraint', false, e?.message);
  }

  try {
    const c = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'courses_marketplace_nexus_exclusive' LIMIT 1`,
    );
    push('nexus_exclusive_constraint', 'courses_marketplace_nexus_exclusive constraint', !!c.rows?.[0]);
  } catch (e) {
    push('nexus_exclusive_constraint', 'Nexus/marketplace exclusive constraint', false, e?.message);
  }

  const ok = checks.every((c) => c.pass);
  return { ok, checks };
}
