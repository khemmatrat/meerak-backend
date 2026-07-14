/**
 * Course Marketplace routes — Udemy-style courses isolated from legacy payment flows.
 */
import { computeCoursePurchaseQuote, normalizeCourseRevenuePolicy } from '../lib/courseFeeEngine.js';
import {
  evaluateCourseRefundEligibility,
  normalizeCourseRefundPolicy,
} from '../lib/courseRefundEngine.js';
import { executeCourseRefund, readCourseRefundPolicy } from '../lib/courseRefundService.js';
import { releaseEligibleCoursePayouts, readCoursePayoutPolicy } from '../lib/coursePayoutService.js';
import {
  loadInstructorDashboard,
  mapInstructorDashboardResponse,
} from '../lib/courseInstructorEarnings.js';
import { loadBuyerCourseOrders } from '../lib/courseBuyerOrders.js';
import { runCoursePayoutReleaseSideEffects as applyCoursePayoutSideEffects } from '../lib/coursePayoutSideEffects.js';
import { generateCourseOrderReceiptPdf } from '../lib/courseReceiptPdf.js';
import {
  loadCourseOrderTaxDocuments,
  loadIssuedFiscalDocumentForOrder,
} from '../lib/courseOrderTaxDocuments.js';
import {
  pipeFiscalDocumentPdf,
} from '../lib/fiscalDocumentPdf.js';
import { getDocumentWithLines } from '../lib/taxDocumentService.js';
import { trackCourseFunnelEvent, getCourseFunnelReport } from '../lib/courseFunnelAnalytics.js';
import { createCourseAnnouncementBannerDraft } from '../lib/courseBannerAutomation.js';
import { loadCourseDetailConversion, loadActiveCourseBundles } from '../lib/courseConversionService.js';
import { logCourseMarketplaceEvent, listCourseMarketplaceAuditLog } from '../lib/courseMarketplaceAudit.js';
import {
  listAdminCourseQa,
  listAdminCourseReviews,
  moderateCourseQaMessage,
  moderateCourseReview,
} from '../lib/courseModerationService.js';
import { buildCourseLaunchChecklist } from '../lib/courseLaunchChecklist.js';
import { buildCourseQualityChecklist } from '../lib/courseStudioHelpers.js';
import { isCoachDirectPurchase } from '../lib/coursePurchaseService.js';
import {
  assertCanSellCourses,
  evaluatePhase0Foundation,
} from '../lib/courseSellEligibility.js';
import {
  asJson,
  buildMarketplaceCatalogFilters,
  loadCourseDetail,
  mapCourse,
  mapInstructorProfile,
  readCoursePolicy,
  readInstructorProfile,
  userId,
} from '../lib/courseMarketplaceShared.js';
import {
  assertLessonPlaybackAccess,
  createLessonPlaybackGrant,
} from '../lib/courseLessonPlayback.js';
import {
  buildRatingDistribution,
  deleteCourseReview,
  getEnrollmentReviewEligibility,
  getMyCourseReview,
  listCourseReviews as listCourseReviewsSvc,
  submitCourseReview as submitCourseReviewSvc,
  updateCourseReview,
} from '../lib/courseReviewService.js';
import {
  deleteCourseQaMessage,
  listCourseQaThreads,
  postCourseQaMessage,
  updateCourseQaMessage,
} from '../lib/courseQaService.js';
import { recommendCourseToTrainee } from '../lib/courseCoachRecommend.js';
import {
  getCoachTraineeCourseProgress,
  getContinueLearningCourses,
  getCourseProgressState,
  getUserCourseBadges,
  mapQuizForClient,
  saveLessonProgress,
  submitLessonQuiz,
  upsertLessonNote,
} from '../lib/courseLearningService.js';

function mapCourseOrderReceipt(row) {
  const meta = asJson(row.metadata, {});
  return {
    id: row.id,
    orderId: row.id,
    receiptNo: row.bill_no || `COURSE-${String(row.id || '').slice(0, 8).toUpperCase()}`,
    transactionNo: row.transaction_no || '',
    ledgerId: row.ledger_id || null,
    payoutLedgerId: row.payout_ledger_id || null,
    status: row.status || 'completed',
    refundStatus: row.refund_status || 'none',
    payoutStatus: row.payout_status || 'held',
    payoutReleaseAt: row.payout_release_at || null,
    payoutReleasedAt: row.payout_released_at || null,
    refundedAt: row.refunded_at || null,
    currency: row.currency || 'THB',
    gateway: row.gateway || 'wallet',
    createdAt: row.created_at,
    grossAmount: Number(row.gross_amount || 0),
    platformFee: Number(row.platform_fee || 0),
    instructorNet: Number(row.instructor_net || 0),
    whtWithheld: Number(meta.wht_withheld || 0),
    whtRatePercent: Number(meta.wht_rate_percent || 0),
    netReleasedAfterWht: Number(meta.wht_net_released || 0),
    whtEligibility: meta.wht_eligibility || null,
    course: {
      id: row.course_id,
      title: row.course_title || row.title || 'Course',
      subtitle: row.subtitle || '',
      imageUrl: row.image_url || '',
    },
    buyer: {
      id: row.user_id,
      name: row.buyer_name || 'ผู้เรียน',
    },
    instructor: {
      id: row.instructor_user_id,
      name: row.instructor_name || 'AQOND Instructor',
    },
    metadata: asJson(row.metadata, {}),
  };
}

function mapAdminCourseOrderRow(row) {
  const receipt = mapCourseOrderReceipt(row);
  return {
    ...receipt,
    buyer: {
      ...receipt.buyer,
      email: row.buyer_email || null,
    },
    instructor: {
      ...receipt.instructor,
      email: row.instructor_email || null,
    },
    course: {
      ...receipt.course,
      status: row.course_status || null,
    },
    payoutBlockReason: asJson(row.metadata, {}).payout_block_reason || null,
  };
}

async function respondInstructorDashboard(req, res, { recentLimit = 50 } = {}) {
  const uid = userId(req);
  const data = await loadInstructorDashboard(pool, uid, { recentLimit });
  res.json(mapInstructorDashboardResponse(data, mapCourseOrderReceipt));
}

function buildCourseRevenueDateFilters(req, { alias = 'o', paramStart = 1 } = {}) {
  const params = [];
  const clauses = [];
  let idx = paramStart;
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if (from && !Number.isNaN(from.getTime())) {
    params.push(from.toISOString());
    clauses.push(`${alias}.created_at >= $${idx++}`);
  }
  if (to && !Number.isNaN(to.getTime())) {
    params.push(to.toISOString());
    clauses.push(`${alias}.created_at <= $${idx++}`);
  }
  return { params, clauses, nextIdx: idx };
}

async function loadOrderForRefund(client, orderId) {
  const r = await client.query(
    `SELECT o.*, c.title AS course_title
     FROM course_purchase_orders o
     JOIN courses c ON c.id = o.course_id
     WHERE o.id = $1::uuid
     LIMIT 1`,
    [orderId],
  );
  return r.rows?.[0] || null;
}

async function appendCourseAuditLog(client, {
  courseId,
  adminUserId,
  action,
  beforeStatus,
  afterStatus,
  reason,
  metadata = {},
}) {
  try {
    await client.query(
      `INSERT INTO course_marketplace_audit_log
         (course_id, admin_user_id, action, before_status, after_status, reason, metadata)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb)`,
      [
        courseId,
        adminUserId || null,
        action,
        beforeStatus || null,
        afterStatus || null,
        reason || null,
        JSON.stringify(metadata),
      ],
    );
  } catch (e) {
    console.warn('[courseMarketplace] audit log skipped:', e?.message);
  }
}

async function trackFunnel(pool, payload) {
  trackCourseFunnelEvent(pool, payload).catch(() => {});
}

async function loadEnrollmentProgress(client, userId, courseId) {
  const r = await client.query(
    `SELECT progress_pct FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  return r.rows?.[0] || null;
}

function daysSince(dateValue) {
  if (!dateValue) return 9999;
  const ts = new Date(dateValue).getTime();
  if (!Number.isFinite(ts)) return 9999;
  return (Date.now() - ts) / 86400000;
}

function computeCourseBadges(row, { rankEnrolled = null, isCoachRecommended = false } = {}) {
  const badges = [];
  const enrolled = Number(row.total_enrolled || 0);
  const publishedDays = daysSince(row.published_at);

  if (publishedDays <= 30) badges.push({ id: 'new', label: 'ใหม่' });
  if (rankEnrolled != null && rankEnrolled <= 3 && enrolled >= 3) {
    badges.push({ id: 'bestseller', label: 'ขายดี' });
  }
  if (enrolled >= 5 && publishedDays <= 90) badges.push({ id: 'trending', label: 'Trending' });
  if (isCoachRecommended) badges.push({ id: 'coach_recommended', label: 'โค้ชแนะนำ' });
  if (String(row.instructor_provider_status || '').toUpperCase() === 'VERIFIED_PROVIDER') {
    badges.push({ id: 'provider_essential', label: 'Verified Provider' });
  }
  if (Number(row.instructor_coach_count || 0) > 0) {
    badges.push({ id: 'coach_instructor', label: 'Coach' });
  }
  return badges;
}

function buildTrustMeta(row, extras = {}) {
  const lessons = extras.lessons || [];
  const previewCount = lessons.filter((l) => l.isPreview || l.is_preview).length;
  const categoryEnrolled = Number(extras.categoryEnrolled || row.category_enrolled || 0);
  return {
    guaranteeDays: 7,
    hasPreview: previewCount > 0,
    previewCount,
    instructorVerified: String(row.instructor_provider_status || '').toUpperCase() === 'VERIFIED_PROVIDER',
    isCoachInstructor: Number(row.instructor_coach_count || 0) > 0,
    lastUpdated: row.updated_at || row.published_at || null,
    categoryEnrolled,
    socialProof: categoryEnrolled > 0
      ? `มีผู้เรียนในหมวด ${row.category || 'นี้'} แล้ว ${categoryEnrolled} คน`
      : 'เป็นคอร์สใหม่ในหมวดนี้ — เริ่มเรียนก่อนใคร',
    providerSocialProof: Number(row.instructor_completed_jobs || 0) > 0
      ? `ผู้สอนปิดงานสำเร็จ ${Number(row.instructor_completed_jobs || 0)} งานบน AQOND`
      : null,
  };
}

function enrichMarketplaceRow(row, extras = {}) {
  const course = mapCourse(row, extras);
  const badges = computeCourseBadges(row, {
    rankEnrolled: extras.rankEnrolled ?? null,
    isCoachRecommended: !!row.coach_recommended,
  });
  return {
    ...course,
    badges,
    trust: buildTrustMeta(row, extras),
  };
}

async function loadCategoryEnrolled(pool, category) {
  if (!category) return 0;
  try {
    const r = await pool.query(
      `SELECT COALESCE(SUM(c.total_enrolled), 0)::int AS n
       FROM courses c
       WHERE c.is_marketplace = TRUE AND c.status = 'published' AND c.category = $1`,
      [category],
    );
    return Number(r.rows?.[0]?.n || 0);
  } catch {
    return 0;
  }
}

async function loadCoachRecommendedCourseIds(pool, viewerId, courseIds = []) {
  if (!viewerId || !courseIds.length) return new Set();
  try {
    const r = await pool.query(
      `SELECT course_id FROM course_recommendations
       WHERE trainee_id = $1::uuid AND course_id = ANY($2::varchar[])`,
      [viewerId, courseIds],
    );
    return new Set((r.rows || []).map((row) => row.course_id));
  } catch {
    return new Set();
  }
}

export function registerCourseMarketplaceRoutes(app, {
  pool,
  authenticateToken,
  optionalAuth,
  adminAuthMiddleware,
  notifyCourseUser = null,
}) {
  if (!pool) return;
  app.set('courseMarketplaceRoutesRegistered', true);
  const maybeAuth = optionalAuth || authenticateToken;

  app.get('/api/course-marketplace/health', async (req, res) => {
    try {
      const { buildCourseMarketplaceReadiness } = await import('../lib/courseMarketplaceReadiness.js');
      const readiness = await buildCourseMarketplaceReadiness(pool, { app: req.app });
      let ledgerIntegrity = null;
      let securityAudit = null;
      if (readiness.tables?.courses) {
        const { checkCourseMarketplaceLedgerIntegrity } = await import('../lib/courseLedgerIntegrity.js');
        const { runCourseSecurityAudit } = await import('../lib/courseMarketplaceSecurity.js');
        ledgerIntegrity = await checkCourseMarketplaceLedgerIntegrity(pool);
        securityAudit = await runCourseSecurityAudit(pool);
      }
      const ok = readiness.ok && (securityAudit?.pass !== false);
      res.json({
        ...readiness,
        ok,
        purchaseRoutes: readiness.routes?.purchase,
        gatewayRoutes: readiness.routes?.gateway,
        studioRoutes: readiness.routes?.studio,
        marketplaceRoutes: readiness.routes?.marketplace,
        freeDemoCourseId: readiness.demoCourseIds?.free,
        paidDemoCourseId: readiness.demoCourseIds?.paid,
        ledgerIntegrity,
        securityAudit: securityAudit
          ? { pass: securityAudit.pass, checks: securityAudit.checks?.map((c) => ({ id: c.id, pass: c.pass })) }
          : null,
      });
    } catch (e) {
      console.error('GET /api/course-marketplace/health error:', e);
      res.status(500).json({ ok: false, error: 'Course marketplace readiness check failed' });
    }
  });

  app.get('/api/courses/marketplace/bundles', async (_req, res) => {
    try {
      const bundles = await loadActiveCourseBundles(pool, 12);
      res.json({ bundles });
    } catch (e) {
      console.error('GET /api/courses/marketplace/bundles error:', e);
      res.status(500).json({ error: 'Failed to load course bundles' });
    }
  });

  app.get('/api/courses/marketplace/saved-ids', authenticateToken, async (req, res) => {
    try {
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
      const r = await pool.query(
        `SELECT course_id AS id FROM saved_marketplace_courses WHERE user_id = $1::uuid ORDER BY created_at DESC`,
        [uid],
      );
      res.json({ ids: (r.rows || []).map((row) => row.id) });
    } catch (e) {
      console.error('GET /api/courses/marketplace/saved-ids error:', e);
      res.status(500).json({ error: 'Failed to load saved courses' });
    }
  });

  app.get('/api/courses/marketplace/saved', authenticateToken, async (req, res) => {
    try {
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
      const r = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name,
                u.provider_status AS instructor_provider_status,
                (SELECT COUNT(*)::int FROM coach_trainee_connections cc
                 WHERE cc.coach_id = c.instructor_user_id AND cc.status = 'active') AS instructor_coach_count,
                TRUE AS saved
         FROM saved_marketplace_courses s
         JOIN courses c ON c.id = s.course_id
         LEFT JOIN users u ON u.id = c.instructor_user_id
         WHERE s.user_id = $1::uuid
           AND c.is_marketplace = TRUE
           AND c.status = 'published'
         ORDER BY s.created_at DESC
         LIMIT 80`,
        [uid],
      );
      res.json({ courses: (r.rows || []).map((row) => enrichMarketplaceRow(row)) });
    } catch (e) {
      console.error('GET /api/courses/marketplace/saved error:', e);
      res.status(500).json({ error: 'Failed to load saved courses' });
    }
  });

  app.post('/api/courses/marketplace/:id/save', authenticateToken, async (req, res) => {
    try {
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
      const courseId = String(req.params.id || '').trim();
      const exists = await pool.query(
        `SELECT 1 FROM courses WHERE id = $1 AND is_marketplace = TRUE AND status = 'published' LIMIT 1`,
        [courseId],
      );
      if (!exists.rows?.[0]) return res.status(404).json({ error: 'Course not found' });
      await pool.query(
        `INSERT INTO saved_marketplace_courses (user_id, course_id)
         VALUES ($1::uuid, $2)
         ON CONFLICT (user_id, course_id) DO NOTHING`,
        [uid, courseId],
      );
      res.json({ ok: true, saved: true });
    } catch (e) {
      console.error('POST /api/courses/marketplace/:id/save error:', e);
      res.status(500).json({ error: 'Failed to save course' });
    }
  });

  app.delete('/api/courses/marketplace/:id/save', authenticateToken, async (req, res) => {
    try {
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
      await pool.query(
        `DELETE FROM saved_marketplace_courses WHERE user_id = $1::uuid AND course_id = $2`,
        [uid, req.params.id],
      );
      res.json({ ok: true, saved: false });
    } catch (e) {
      console.error('DELETE /api/courses/marketplace/:id/save error:', e);
      res.status(500).json({ error: 'Failed to unsave course' });
    }
  });

  app.get('/api/courses/marketplace', maybeAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const { where, params, order } = buildMarketplaceCatalogFilters(req.query);
      const viewerParam = uid ? params.length + 1 : null;
      const savedSelect = uid
        ? `EXISTS (SELECT 1 FROM saved_marketplace_courses s WHERE s.course_id = c.id AND s.user_id = $${viewerParam}::uuid) AS saved`
        : 'FALSE AS saved';
      const coachRecSelect = uid
        ? `EXISTS (SELECT 1 FROM course_recommendations cr WHERE cr.course_id = c.id AND cr.trainee_id = $${viewerParam}::uuid) AS coach_recommended`
        : 'FALSE AS coach_recommended';
      const queryParams = uid ? [...params, uid] : params;
      const r = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name,
                u.provider_status AS instructor_provider_status,
                (SELECT COUNT(*)::int FROM coach_trainee_connections cc
                 WHERE cc.coach_id = c.instructor_user_id AND cc.status = 'active') AS instructor_coach_count,
                ${savedSelect},
                ${coachRecSelect}
         FROM courses c
         LEFT JOIN users u ON u.id = c.instructor_user_id
         ${where}
         ORDER BY ${order}
         LIMIT 80`,
        queryParams,
      );
      const rows = r.rows || [];
      const rankSorted = [...rows].sort(
        (a, b) => Number(b.total_enrolled || 0) - Number(a.total_enrolled || 0),
      );
      const rankMap = new Map(rankSorted.map((row, index) => [row.id, index + 1]));
      res.json({
        courses: rows.map((row) =>
          enrichMarketplaceRow(row, { rankEnrolled: rankMap.get(row.id) ?? null }),
        ),
      });
    } catch (e) {
      console.error('GET /api/courses/marketplace error:', e);
      res.status(500).json({ error: 'Failed to load courses' });
    }
  });

  app.get('/api/courses/marketplace/:id', maybeAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const raw = await pool.query(
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
         WHERE c.id = $1 AND c.is_marketplace = TRUE AND c.status = 'published'
         LIMIT 1`,
        [req.params.id, uid || '00000000-0000-0000-0000-000000000000'],
      );
      if (!raw.rows?.[0]) return res.status(404).json({ error: 'Course not found' });
      const course = await loadCourseDetail(pool, req.params.id, uid);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      const categoryEnrolled = await loadCategoryEnrolled(pool, course.category);
      const policy = await readCoursePolicy(pool);
      const policyForQuote = { ...policy };
      const override = Number(raw.rows[0].platform_rate_override);
      if (Number.isFinite(override) && override >= 0 && override <= 0.9) {
        policyForQuote.platformRate = override;
      }
      const isCoachDirect = await isCoachDirectPurchase(pool, course.instructorUserId, uid);
      const quote = computeCoursePurchaseQuote({
        priceThb: course.priceThb,
        originalPriceThb: course.originalPriceThb,
        policy: policyForQuote,
        isCoachDirect,
      });
      const reviewRows = await pool.query(
        `SELECT rating FROM course_reviews WHERE course_id = $1`,
        [req.params.id],
      );
      const ratingDistribution = buildRatingDistribution(reviewRows.rows || []);
      let wallet = null;
      if (uid) {
        const bal = await pool.query(`SELECT wallet_balance FROM users WHERE id = $1::uuid`, [uid]);
        const balance = Number(bal.rows?.[0]?.wallet_balance || 0);
        const required = Number(quote.grossAmount || 0);
        wallet = {
          balance,
          required,
          canAfford: balance >= required,
          shortfall: Math.max(0, required - balance),
        };
      }
      const enriched = enrichMarketplaceRow(raw.rows[0], {
        lessons: course.lessons,
        categoryEnrolled,
        rankEnrolled: null,
      });
      const instructorProfile = mapInstructorProfile(
        await readInstructorProfile(pool, course.instructorUserId),
      );
      res.json({
        course: { ...enriched, sections: course.sections, lessons: course.lessons },
        quote,
        ratingDistribution,
        wallet,
        isCoachDirect,
        instructorProfile,
        conversion: await loadCourseDetailConversion(pool, raw.rows[0], uid),
      });
    } catch (e) {
      console.error('GET /api/courses/marketplace/:id error:', e);
      res.status(500).json({ error: 'Failed to load course' });
    }
  });

  app.get('/api/courses/marketplace/:id/recommendations', maybeAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const base = await pool.query(
        `SELECT id, category FROM courses WHERE id = $1 AND is_marketplace = TRUE AND status = 'published'`,
        [req.params.id],
      );
      if (!base.rows?.[0]) return res.status(404).json({ error: 'Course not found' });
      const category = base.rows[0].category;
      const sameCategory = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name,
                u.provider_status AS instructor_provider_status,
                (SELECT COUNT(*)::int FROM coach_trainee_connections cc
                 WHERE cc.coach_id = c.instructor_user_id AND cc.status = 'active') AS instructor_coach_count
         FROM courses c
         LEFT JOIN users u ON u.id = c.instructor_user_id
         WHERE c.is_marketplace = TRUE AND c.status = 'published'
           AND c.category = $1 AND c.id <> $2
         ORDER BY c.rating_avg DESC, c.total_enrolled DESC
         LIMIT 6`,
        [category, req.params.id],
      );
      const fromCoach = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name,
                u.provider_status AS instructor_provider_status,
                (SELECT COUNT(*)::int FROM coach_trainee_connections cc
                 WHERE cc.coach_id = c.instructor_user_id AND cc.status = 'active') AS instructor_coach_count,
                TRUE AS coach_recommended
         FROM course_recommendations cr
         JOIN courses c ON c.id = cr.course_id
         LEFT JOIN users u ON u.id = c.instructor_user_id
         WHERE cr.trainee_id = $1::uuid AND c.status = 'published' AND c.id <> $2
         ORDER BY cr.created_at DESC
         LIMIT 6`,
        [uid, req.params.id],
      );
      const careerBoost = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name,
                u.provider_status AS instructor_provider_status,
                (SELECT COUNT(*)::int FROM coach_trainee_connections cc
                 WHERE cc.coach_id = c.instructor_user_id AND cc.status = 'active') AS instructor_coach_count
         FROM courses c
         LEFT JOIN users u ON u.id = c.instructor_user_id
         WHERE c.is_marketplace = TRUE AND c.status = 'published'
           AND c.id <> $1
           AND c.category IN ('business', 'skills', 'service', 'career')
         ORDER BY c.total_enrolled DESC, c.rating_avg DESC
         LIMIT 6`,
        [req.params.id],
      );
      res.json({
        sameCategory: (sameCategory.rows || []).map((row) => enrichMarketplaceRow(row)),
        fromCoach: (fromCoach.rows || []).map((row) => enrichMarketplaceRow(row)),
        careerBoost: (careerBoost.rows || []).map((row) => enrichMarketplaceRow(row)),
      });
    } catch (e) {
      console.error('GET /api/courses/marketplace/:id/recommendations error:', e);
      res.status(500).json({ error: 'Failed to load recommendations' });
    }
  });

  app.get('/api/courses/orders/:orderId/receipt', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const uid = userId(req);
      const r = await client.query(
        `SELECT
           o.*,
           c.title AS course_title,
           c.subtitle,
           c.image_url,
           buyer.full_name AS buyer_name,
           instructor.full_name AS instructor_name,
           l.bill_no,
           l.transaction_no,
           l.gateway
         FROM course_purchase_orders o
         JOIN courses c ON c.id = o.course_id
         LEFT JOIN users buyer ON buyer.id = o.user_id
         LEFT JOIN users instructor ON instructor.id = o.instructor_user_id
         LEFT JOIN payment_ledger_audit l ON l.id = o.ledger_id
         WHERE o.id = $1::uuid
           AND (
             o.user_id = $2::uuid
             OR o.instructor_user_id = $2::uuid
             OR (o.metadata->>'purchased_by_user_id')::uuid = $2::uuid
           )
         LIMIT 1`,
        [req.params.orderId, uid],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Receipt not found' });
      const taxDocuments = await loadCourseOrderTaxDocuments(client, req.params.orderId, uid);
      res.json({
        receipt: mapCourseOrderReceipt(r.rows[0]),
        taxDocuments: taxDocuments.ok ? taxDocuments : null,
      });
    } catch (e) {
      console.error('GET /api/courses/orders/:orderId/receipt error:', e);
      res.status(500).json({ error: 'Failed to load course receipt' });
    } finally {
      client.release();
    }
  });

  app.get('/api/courses/orders/:orderId/tax-documents', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const data = await loadCourseOrderTaxDocuments(client, req.params.orderId, userId(req));
      if (!data.ok) {
        const status = data.code === 'forbidden' ? 403 : 404;
        return res.status(status).json({ error: data.code });
      }
      res.json(data);
    } catch (e) {
      console.error('GET tax-documents error:', e);
      res.status(500).json({ error: 'Failed to load tax documents' });
    } finally {
      client.release();
    }
  });

  app.get('/api/courses/orders/:orderId/tax-documents/:documentId/pdf', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const uid = userId(req);
      const taxPayload = await loadCourseOrderTaxDocuments(client, req.params.orderId, uid);
      if (!taxPayload.ok) {
        return res.status(taxPayload.code === 'forbidden' ? 403 : 404).json({ error: taxPayload.code });
      }
      const allowed = (taxPayload.documents || []).find((d) => String(d.id) === String(req.params.documentId));
      if (!allowed) return res.status(404).json({ error: 'Document not linked to this order' });
      if (!allowed.downloadable) {
        return res.status(404).json({
          error: 'เอกสารยังรอฝ่ายบัญชีออกเลข จึงยังดาวน์โหลด PDF ไม่ได้',
          status: allowed.status,
        });
      }
      const document = await getDocumentWithLines(client, req.params.documentId);
      if (!document || String(document.party_user_id) !== String(uid)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      await pipeFiscalDocumentPdf(document, res);
    } catch (e) {
      console.error('GET tax document pdf error:', e);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate fiscal PDF' });
    } finally {
      client.release();
    }
  });

  app.get('/api/courses/orders/:orderId/receipt.pdf', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const uid = userId(req);
      const docId = req.query.documentId || req.query.document_id || null;
      if (docId) {
        req.params.documentId = String(docId);
        // delegate to fiscal pdf handler above pattern inline
        const taxPayload = await loadCourseOrderTaxDocuments(client, req.params.orderId, uid);
        if (!taxPayload.ok) {
          return res.status(taxPayload.code === 'forbidden' ? 403 : 404).json({ error: taxPayload.code });
        }
        const allowed = (taxPayload.documents || []).find((d) => String(d.id) === String(docId));
        if (!allowed?.downloadable) {
          return res.status(404).json({ error: 'Fiscal document not ready', status: allowed?.status });
        }
        const document = await getDocumentWithLines(client, String(docId));
        if (!document || String(document.party_user_id) !== String(uid)) {
          return res.status(404).json({ error: 'Document not found' });
        }
        return pipeFiscalDocumentPdf(document, res);
      }

      const r = await client.query(
        `SELECT
           o.*,
           c.title AS course_title,
           c.subtitle,
           c.image_url,
           buyer.full_name AS buyer_name,
           instructor.full_name AS instructor_name,
           l.bill_no,
           l.transaction_no,
           l.gateway
         FROM course_purchase_orders o
         JOIN courses c ON c.id = o.course_id
         LEFT JOIN users buyer ON buyer.id = o.user_id
         LEFT JOIN users instructor ON instructor.id = o.instructor_user_id
         LEFT JOIN payment_ledger_audit l ON l.id = o.ledger_id
         WHERE o.id = $1::uuid
           AND (
             o.user_id = $2::uuid
             OR o.instructor_user_id = $2::uuid
             OR (o.metadata->>'purchased_by_user_id')::uuid = $2::uuid
           )
         LIMIT 1`,
        [req.params.orderId, uid],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Receipt not found' });
      const receipt = mapCourseOrderReceipt(r.rows[0]);
      const viewerRole = String(receipt.instructor?.id) === String(uid) ? 'instructor' : 'buyer';
      const preferFiscal = req.query.preferFiscal !== '0';
      if (preferFiscal) {
        const fiscal = await loadIssuedFiscalDocumentForOrder(client, req.params.orderId, uid, { viewerRole });
        if (fiscal.ok && fiscal.document) {
          res.setHeader('X-Course-Receipt-Source', 'fiscal');
          return pipeFiscalDocumentPdf(fiscal.document, res);
        }
      }
      const view = viewerRole;
      const pdf = await generateCourseOrderReceiptPdf(receipt, { view });
      const filename = `${view === 'instructor' ? 'seller-statement' : 'course-receipt'}-${receipt.receiptNo || receipt.orderId}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Course-Receipt-Source', 'operational');
      res.send(pdf);
    } catch (e) {
      console.error('GET receipt.pdf error:', e);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    } finally {
      client.release();
    }
  });

  app.get('/api/my/course-orders', authenticateToken, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const data = await loadBuyerCourseOrders(pool, userId(req), { limit, offset });
      res.json({
        orders: data.rows.map(mapCourseOrderReceipt),
        total: data.total,
        limit: data.limit,
        offset: data.offset,
      });
    } catch (e) {
      console.error('GET /api/my/course-orders error:', e);
      res.status(500).json({ error: 'Failed to load course orders' });
    }
  });

  app.get('/api/courses/orders/:orderId/refund-eligibility', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const client = await pool.connect();
    try {
      const order = await loadOrderForRefund(client, req.params.orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (
        String(order.user_id) !== String(uid)
        && String(order.instructor_user_id) !== String(uid)
        && String(order.metadata?.purchased_by_user_id || '') !== String(uid)
      ) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const enrollment = await loadEnrollmentProgress(client, order.user_id, order.course_id);
      const policy = normalizeCourseRefundPolicy(await readCourseRefundPolicy(client));
      const eligibility = evaluateCourseRefundEligibility({ order, enrollment, policy });
      res.json({
        orderId: order.id,
        status: order.status,
        refundStatus: order.refund_status,
        payoutStatus: order.payout_status,
        payoutReleaseAt: order.payout_release_at,
        eligibility,
        policy,
      });
    } catch (e) {
      console.error('GET refund-eligibility error:', e);
      res.status(500).json({ error: 'Failed to check refund eligibility' });
    } finally {
      client.release();
    }
  });

  app.post('/api/courses/orders/:orderId/refund', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await executeCourseRefund(client, {
        orderId: req.params.orderId,
        requesterId: uid,
        reasonCode: String(req.body?.reasonCode || 'buyer_request'),
        reasonNote: String(req.body?.reasonNote || '').trim(),
      });
      if (!result.ok) {
        await client.query('ROLLBACK');
        const status = result.code === 'forbidden' ? 403 : result.code === 'order_not_found' ? 404 : 400;
        return res.status(status).json({ error: result.error, code: result.code, eligibility: result.eligibility });
      }
      await client.query('COMMIT');
      res.json({
        ok: true,
        refundLedgerId: result.refundLedgerId,
        grossAmount: result.grossAmount,
        eligibility: result.eligibility,
      });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('POST refund error:', e);
      res.status(500).json({ error: 'Course refund failed' });
    } finally {
      client.release();
    }
  });

  app.post('/api/admin/courses/orders/:orderId/refund', adminAuthMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await executeCourseRefund(client, {
        orderId: req.params.orderId,
        requesterId: userId(req),
        adminOverride: true,
        reasonCode: String(req.body?.reasonCode || 'admin_override'),
        reasonNote: String(req.body?.reasonNote || req.body?.reason || '').trim(),
      });
      if (!result.ok) {
        await client.query('ROLLBACK');
        return res.status(result.code === 'order_not_found' ? 404 : 400).json({
          error: result.error,
          code: result.code,
          eligibility: result.eligibility,
        });
      }
      await client.query('COMMIT');
      res.json({ ok: true, refundLedgerId: result.refundLedgerId, grossAmount: result.grossAmount });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('POST admin refund error:', e);
      res.status(500).json({ error: 'Admin course refund failed' });
    } finally {
      client.release();
    }
  });

  app.post('/api/admin/courses/payouts/release', adminAuthMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await releaseEligibleCoursePayouts(client, {
        limit: Number(req.body?.limit || 50),
        actorId: userId(req) || 'admin',
        orderId: req.body?.orderId || null,
      });
      await client.query('COMMIT');
      await applyCoursePayoutSideEffects(pool, notifyCourseUser, result);
      res.json({ ok: true, ...result });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('POST payouts/release error:', e);
      res.status(500).json({ error: 'Course payout release failed' });
    } finally {
      client.release();
    }
  });

  app.get('/api/admin/courses/payouts/summary', adminAuthMiddleware, async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE payout_status = 'held' AND status = 'completed' AND refund_status = 'none')::int AS held,
           COUNT(*) FILTER (WHERE payout_status = 'released')::int AS released,
           COUNT(*) FILTER (WHERE payout_status = 'blocked')::int AS blocked,
           COALESCE(SUM(instructor_net) FILTER (WHERE payout_status = 'held' AND status = 'completed' AND refund_status = 'none'), 0)::numeric AS held_net,
           COALESCE(SUM(instructor_net) FILTER (WHERE payout_status = 'blocked'), 0)::numeric AS blocked_net
         FROM course_purchase_orders`,
      );
      res.json({ summary: r.rows?.[0] || {} });
    } catch (e) {
      console.error('GET admin payouts/summary error:', e);
      res.status(500).json({ error: 'Failed to load payout summary' });
    }
  });

  app.get('/api/admin/courses/revenue', adminAuthMiddleware, async (req, res) => {
    try {
      const { params, clauses } = buildCourseRevenueDateFilters(req, { alias: 'o' });
      const whereOrders = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const policyRaw = await readCoursePolicy(pool);
      const policy = normalizeCourseRevenuePolicy(policyRaw);

      const ledgerParams = [...params];
      let whereLedger = `WHERE event_type IN ('course_purchase', 'course_refund') AND status = 'completed'`;
      if (params.length) {
        whereLedger += ` AND created_at >= $1`;
        if (params.length > 1) whereLedger += ` AND created_at <= $2`;
      }
      const whereRevenue = `WHERE source_type = 'course_commission'${params.length ? ` AND created_at >= $1${params.length > 1 ? ' AND created_at <= $2' : ''}` : ''}`;

      const [ledger, revenues, orders, topInstructors, topCourses] = await Promise.all([
        pool.query(
          `SELECT event_type, COUNT(*)::int AS events, COALESCE(SUM(amount), 0)::numeric AS gross_flow
           FROM payment_ledger_audit ${whereLedger}
           GROUP BY event_type
           ORDER BY event_type`,
          ledgerParams,
        ),
        pool.query(
          `SELECT
             COALESCE(SUM(amount), 0)::numeric AS platform_fee_net,
             COALESCE(SUM(gross_amount), 0)::numeric AS course_gross_net,
             COUNT(*)::int AS rows
           FROM platform_revenues ${whereRevenue}`,
          ledgerParams,
        ),
        pool.query(
          `SELECT
             COUNT(*)::int AS total_orders,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_orders,
             COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_orders,
             COUNT(*) FILTER (WHERE payout_status = 'held')::int AS payouts_held,
             COUNT(*) FILTER (WHERE payout_status = 'released')::int AS payouts_released,
             COALESCE(SUM(gross_amount) FILTER (WHERE status = 'completed'), 0)::numeric AS gross_completed,
             COALESCE(SUM(platform_fee) FILTER (WHERE status = 'completed'), 0)::numeric AS platform_fee_orders,
             COALESCE(SUM(instructor_net) FILTER (WHERE status = 'completed'), 0)::numeric AS instructor_net_orders
           FROM course_purchase_orders o
           ${whereOrders}`,
          params,
        ),
        pool.query(
          `SELECT
             o.instructor_user_id,
             u.full_name AS instructor_name,
             u.email AS instructor_email,
             COUNT(*) FILTER (WHERE o.status = 'completed')::int AS orders,
             COALESCE(SUM(o.gross_amount) FILTER (WHERE o.status = 'completed'), 0)::numeric AS gross,
             COALESCE(SUM(o.platform_fee) FILTER (WHERE o.status = 'completed'), 0)::numeric AS platform_fee,
             COALESCE(SUM(o.instructor_net) FILTER (WHERE o.status = 'completed'), 0)::numeric AS instructor_net
           FROM course_purchase_orders o
           LEFT JOIN users u ON u.id = o.instructor_user_id
           ${whereOrders ? `${whereOrders} AND o.instructor_user_id IS NOT NULL` : 'WHERE o.instructor_user_id IS NOT NULL'}
           GROUP BY o.instructor_user_id, u.full_name, u.email
           ORDER BY platform_fee DESC NULLS LAST
           LIMIT 20`,
          params,
        ),
        pool.query(
          `SELECT
             o.course_id,
             c.title AS course_title,
             c.status AS course_status,
             o.instructor_user_id,
             u.full_name AS instructor_name,
             COUNT(*) FILTER (WHERE o.status = 'completed')::int AS orders,
             COALESCE(SUM(o.gross_amount) FILTER (WHERE o.status = 'completed'), 0)::numeric AS gross,
             COALESCE(SUM(o.platform_fee) FILTER (WHERE o.status = 'completed'), 0)::numeric AS platform_fee,
             COALESCE(SUM(o.instructor_net) FILTER (WHERE o.status = 'completed'), 0)::numeric AS instructor_net
           FROM course_purchase_orders o
           JOIN courses c ON c.id = o.course_id
           LEFT JOIN users u ON u.id = o.instructor_user_id
           ${whereOrders || 'WHERE 1=1'}
           GROUP BY o.course_id, c.title, c.status, o.instructor_user_id, u.full_name
           ORDER BY gross DESC NULLS LAST
           LIMIT 20`,
          params,
        ),
      ]);

      res.json({
        policy: {
          platformRate: policy.platformRate,
          platformRatePct: Math.round(policy.platformRate * 1000) / 10,
          coachDirectDiscountRate: policy.coachDirectDiscountRate,
          coachDirectPlatformRate: policy.coachDirectPlatformRate,
          coachDirectPlatformRatePct: Math.round(policy.coachDirectPlatformRate * 1000) / 10,
        },
        ledger: ledger.rows || [],
        platformRevenues: revenues.rows?.[0] || {},
        orders: orders.rows?.[0] || {},
        topInstructors: (topInstructors.rows || []).map((row) => ({
          instructorUserId: row.instructor_user_id,
          instructorName: row.instructor_name || 'Instructor',
          instructorEmail: row.instructor_email || null,
          orders: Number(row.orders || 0),
          gross: Number(row.gross || 0),
          platformFee: Number(row.platform_fee || 0),
          instructorNet: Number(row.instructor_net || 0),
        })),
        topCourses: (topCourses.rows || []).map((row) => ({
          courseId: row.course_id,
          courseTitle: row.course_title || row.course_id,
          courseStatus: row.course_status || null,
          instructorUserId: row.instructor_user_id,
          instructorName: row.instructor_name || null,
          orders: Number(row.orders || 0),
          gross: Number(row.gross || 0),
          platformFee: Number(row.platform_fee || 0),
          instructorNet: Number(row.instructor_net || 0),
        })),
      });
    } catch (e) {
      console.error('GET admin/courses/revenue error:', e);
      res.status(500).json({ error: 'Failed to load course revenue report' });
    }
  });

  app.get('/api/admin/courses/revenue/orders', adminAuthMiddleware, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const status = String(req.query.status || '').trim();
      const courseId = String(req.query.courseId || req.query.course_id || '').trim();
      const buyerId = String(req.query.buyerId || req.query.buyer_id || '').trim();
      const instructorId = String(req.query.instructorId || req.query.instructor_id || '').trim();
      const payoutStatus = String(req.query.payoutStatus || req.query.payout_status || '').trim();
      const q = String(req.query.q || '').trim().toLowerCase();

      const { params, clauses, nextIdx } = buildCourseRevenueDateFilters(req, { alias: 'o' });
      let idx = nextIdx;
      const filters = [...clauses];

      if (status && ['completed', 'refunded', 'pending'].includes(status)) {
        params.push(status);
        filters.push(`o.status = $${idx++}`);
      }
      if (courseId) {
        params.push(courseId);
        filters.push(`o.course_id = $${idx++}`);
      }
      if (buyerId) {
        params.push(buyerId);
        filters.push(`o.user_id = $${idx++}::uuid`);
      }
      if (instructorId) {
        params.push(instructorId);
        filters.push(`o.instructor_user_id = $${idx++}::uuid`);
      }
      if (payoutStatus && ['held', 'released', 'blocked'].includes(payoutStatus)) {
        params.push(payoutStatus);
        filters.push(`o.payout_status = $${idx++}`);
      }
      if (q) {
        params.push(`%${q}%`);
        const p = `$${idx++}`;
        filters.push(`(
          LOWER(c.title) LIKE ${p}
          OR LOWER(buyer.full_name) LIKE ${p}
          OR LOWER(buyer.email) LIKE ${p}
          OR LOWER(instructor.full_name) LIKE ${p}
          OR LOWER(instructor.email) LIKE ${p}
          OR LOWER(o.course_id) LIKE ${p}
          OR LOWER(o.id::text) LIKE ${p}
        )`);
      }

      const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

      const [countRes, rowsRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total
           FROM course_purchase_orders o
           JOIN courses c ON c.id = o.course_id
           LEFT JOIN users buyer ON buyer.id = o.user_id
           LEFT JOIN users instructor ON instructor.id = o.instructor_user_id
           ${whereSql}`,
          params,
        ),
        pool.query(
          `SELECT
             o.*,
             c.title AS course_title,
             c.subtitle,
             c.image_url,
             c.status AS course_status,
             buyer.full_name AS buyer_name,
             buyer.email AS buyer_email,
             instructor.full_name AS instructor_name,
             instructor.email AS instructor_email,
             l.bill_no,
             l.transaction_no,
             l.gateway
           FROM course_purchase_orders o
           JOIN courses c ON c.id = o.course_id
           LEFT JOIN users buyer ON buyer.id = o.user_id
           LEFT JOIN users instructor ON instructor.id = o.instructor_user_id
           LEFT JOIN payment_ledger_audit l ON l.id = o.ledger_id
           ${whereSql}
           ORDER BY o.created_at DESC
           LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limit, offset],
        ),
      ]);

      res.json({
        total: Number(countRes.rows?.[0]?.total || 0),
        limit,
        offset,
        orders: (rowsRes.rows || []).map(mapAdminCourseOrderRow),
      });
    } catch (e) {
      console.error('GET admin/courses/revenue/orders error:', e);
      res.status(500).json({ error: 'Failed to load course revenue orders' });
    }
  });

  app.get('/api/admin/users/:id/course-marketplace', adminAuthMiddleware, async (req, res) => {
    const uid = String(req.params.id || '').trim();
    if (!uid) return res.status(400).json({ error: 'User id required' });
    try {
      const userRes = await pool.query(
        `SELECT id, full_name, email, provider_status FROM users WHERE id = $1::uuid LIMIT 1`,
        [uid],
      );
      if (!userRes.rows?.[0]) return res.status(404).json({ error: 'User not found' });

      const sellEligibility = await assertCanSellCourses(pool, uid).catch(() => ({ ok: false, reason: 'check_failed' }));

      const [coursesRes, instructorSummary, buyerSummary, instructorOrders, buyerOrders, topSellingCourses] = await Promise.all([
        pool.query(
          `SELECT id, title, status, price_thb, total_enrolled, rating_avg, rating_count, published_at, created_at
           FROM courses
           WHERE is_marketplace = TRUE AND instructor_user_id = $1::uuid
           ORDER BY created_at DESC`,
          [uid],
        ),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'completed')::int AS orders,
             COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_orders,
             COALESCE(SUM(gross_amount) FILTER (WHERE status = 'completed'), 0)::numeric AS gross,
             COALESCE(SUM(platform_fee) FILTER (WHERE status = 'completed'), 0)::numeric AS platform_fee,
             COALESCE(SUM(instructor_net) FILTER (WHERE status = 'completed'), 0)::numeric AS instructor_net,
             COUNT(*) FILTER (WHERE payout_status = 'held' AND refund_status = 'none')::int AS payouts_pending,
             COALESCE(SUM(instructor_net) FILTER (WHERE payout_status = 'held' AND refund_status = 'none'), 0)::numeric AS pending_net
           FROM course_purchase_orders
           WHERE instructor_user_id = $1::uuid`,
          [uid],
        ),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'completed')::int AS purchases,
             COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_purchases,
             COALESCE(SUM(gross_amount) FILTER (WHERE status = 'completed'), 0)::numeric AS spent
           FROM course_purchase_orders
           WHERE user_id = $1::uuid`,
          [uid],
        ),
        pool.query(
          `SELECT
             o.*,
             c.title AS course_title,
             c.status AS course_status,
             buyer.full_name AS buyer_name,
             buyer.email AS buyer_email,
             instructor.full_name AS instructor_name,
             instructor.email AS instructor_email,
             l.bill_no,
             l.transaction_no,
             l.gateway
           FROM course_purchase_orders o
           JOIN courses c ON c.id = o.course_id
           LEFT JOIN users buyer ON buyer.id = o.user_id
           LEFT JOIN users instructor ON instructor.id = o.instructor_user_id
           LEFT JOIN payment_ledger_audit l ON l.id = o.ledger_id
           WHERE o.instructor_user_id = $1::uuid
           ORDER BY o.created_at DESC
           LIMIT 15`,
          [uid],
        ),
        pool.query(
          `SELECT
             o.*,
             c.title AS course_title,
             c.status AS course_status,
             buyer.full_name AS buyer_name,
             buyer.email AS buyer_email,
             instructor.full_name AS instructor_name,
             instructor.email AS instructor_email,
             l.bill_no,
             l.transaction_no,
             l.gateway
           FROM course_purchase_orders o
           JOIN courses c ON c.id = o.course_id
           LEFT JOIN users buyer ON buyer.id = o.user_id
           LEFT JOIN users instructor ON instructor.id = o.instructor_user_id
           LEFT JOIN payment_ledger_audit l ON l.id = o.ledger_id
           WHERE o.user_id = $1::uuid
           ORDER BY o.created_at DESC
           LIMIT 15`,
          [uid],
        ),
        pool.query(
          `SELECT
             o.course_id,
             c.title AS course_title,
             c.status AS course_status,
             COUNT(*) FILTER (WHERE o.status = 'completed')::int AS orders,
             COALESCE(SUM(o.gross_amount) FILTER (WHERE o.status = 'completed'), 0)::numeric AS gross,
             COALESCE(SUM(o.platform_fee) FILTER (WHERE o.status = 'completed'), 0)::numeric AS platform_fee,
             COALESCE(SUM(o.instructor_net) FILTER (WHERE o.status = 'completed'), 0)::numeric AS instructor_net
           FROM course_purchase_orders o
           JOIN courses c ON c.id = o.course_id
           WHERE o.instructor_user_id = $1::uuid
           GROUP BY o.course_id, c.title, c.status
           ORDER BY gross DESC NULLS LAST`,
          [uid],
        ),
      ]);

      const courses = coursesRes.rows || [];
      const publishedCourses = courses.filter((c) => c.status === 'published').length;
      const inst = instructorSummary.rows?.[0] || {};
      const buy = buyerSummary.rows?.[0] || {};

      res.json({
        user: {
          id: userRes.rows[0].id,
          name: userRes.rows[0].full_name,
          email: userRes.rows[0].email,
          providerStatus: userRes.rows[0].provider_status,
        },
        sellEligibility: {
          canSell: !!sellEligibility.ok,
          reason: sellEligibility.reason || sellEligibility.error || null,
          checks: sellEligibility.checks || null,
        },
        instructor: {
          coursesTotal: courses.length,
          coursesPublished: publishedCourses,
          orders: Number(inst.orders || 0),
          refundedOrders: Number(inst.refunded_orders || 0),
          gross: Number(inst.gross || 0),
          platformFee: Number(inst.platform_fee || 0),
          instructorNet: Number(inst.instructor_net || 0),
          payoutsPending: Number(inst.payouts_pending || 0),
          pendingNet: Number(inst.pending_net || 0),
          courses: courses.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            priceThb: Number(c.price_thb || 0),
            totalEnrolled: Number(c.total_enrolled || 0),
            ratingAvg: Number(c.rating_avg || 0),
            ratingCount: Number(c.rating_count || 0),
            publishedAt: c.published_at,
            createdAt: c.created_at,
          })),
          topSellingCourses: (topSellingCourses.rows || []).map((row) => ({
            courseId: row.course_id,
            courseTitle: row.course_title,
            courseStatus: row.course_status,
            orders: Number(row.orders || 0),
            gross: Number(row.gross || 0),
            platformFee: Number(row.platform_fee || 0),
            instructorNet: Number(row.instructor_net || 0),
          })),
          recentOrders: (instructorOrders.rows || []).map(mapAdminCourseOrderRow),
        },
        buyer: {
          purchases: Number(buy.purchases || 0),
          refundedPurchases: Number(buy.refunded_purchases || 0),
          spent: Number(buy.spent || 0),
          recentOrders: (buyerOrders.rows || []).map(mapAdminCourseOrderRow),
        },
      });
    } catch (e) {
      console.error('GET /api/admin/users/:id/course-marketplace error:', e);
      res.status(500).json({ error: 'Failed to load user course marketplace profile' });
    }
  });

  app.get('/api/instructor/dashboard', authenticateToken, (req, res) => {
    respondInstructorDashboard(req, res, { recentLimit: 50 }).catch((e) => {
      console.error('GET /api/instructor/dashboard error:', e);
      res.status(500).json({ error: 'Failed to load instructor dashboard' });
    });
  });

  app.get('/api/instructor/sales', authenticateToken, (req, res) => {
    respondInstructorDashboard(req, res, { recentLimit: 50 }).catch((e) => {
      console.error('GET /api/instructor/sales error:', e);
      res.status(500).json({ error: 'Failed to load instructor sales' });
    });
  });

  app.get('/api/instructor/earnings', authenticateToken, (req, res) => {
    respondInstructorDashboard(req, res, { recentLimit: 30 }).catch((e) => {
      console.error('GET /api/instructor/earnings error:', e);
      res.status(500).json({ error: 'Failed to load earnings' });
    });
  });

  app.get('/api/my/courses', authenticateToken, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT e.*, c.*, u.full_name AS instructor_name
         FROM course_enrollments e
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN users u ON u.id = c.instructor_user_id
         WHERE e.user_id = $1::uuid
         ORDER BY e.enrolled_at DESC`,
        [userId(req)],
      );
      res.json({
        courses: (r.rows || []).map((row) => mapCourse(row, {
          progressPct: Number(row.progress_pct || 0),
          completedAt: row.completed_at,
          lastLessonId: row.last_lesson_id,
          learningStreakDays: Number(row.learning_streak_days || 0),
          lastActivityAt: row.last_activity_at,
        })),
      });
    } catch (e) {
      console.error('GET /api/my/courses error:', e);
      res.status(500).json({ error: 'Failed to load enrolled courses' });
    }
  });

  app.get('/api/courses/continue-learning', authenticateToken, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 6, 12);
      const courses = await getContinueLearningCourses(pool, userId(req), limit);
      res.json({ courses });
    } catch (e) {
      console.error('GET /api/courses/continue-learning error:', e);
      res.status(500).json({ error: 'Failed to load continue learning' });
    }
  });

  app.get('/api/my/course-badges', authenticateToken, async (req, res) => {
    try {
      const badges = await getUserCourseBadges(pool, userId(req));
      res.json({ badges });
    } catch (e) {
      console.error('GET /api/my/course-badges error:', e);
      res.status(500).json({ error: 'Failed to load course badges' });
    }
  });

  app.get('/api/users/:id/course-badges', optionalAuth, async (req, res) => {
    try {
      const badges = await getUserCourseBadges(pool, req.params.id);
      res.json({ badges });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load course badges' });
    }
  });

  app.get('/api/coach/trainees/course-progress', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const trainees = await getCoachTraineeCourseProgress(pool, uid);
      res.json({ trainees });
    } catch (e) {
      console.error('GET /api/coach/trainees/course-progress error:', e);
      res.status(500).json({ error: 'Failed to load trainee course progress' });
    }
  });

  app.get('/api/courses/:id/progress', authenticateToken, async (req, res) => {
    try {
      const state = await getCourseProgressState(pool, userId(req), req.params.id);
      if (!state.enrolled && !req.query.preview) {
        return res.status(403).json({ error: 'Enroll before viewing progress', progress: state });
      }
      res.json({ progress: state });
    } catch (e) {
      console.error('GET /api/courses/:id/progress error:', e);
      res.status(500).json({ error: 'Failed to load progress' });
    }
  });

  app.get('/api/courses/:id/certificate', authenticateToken, async (req, res) => {
    try {
      const uid = userId(req);
      const r = await pool.query(
        `SELECT cert.*, c.title AS course_title, u.full_name AS learner_name
         FROM course_completion_certificates cert
         JOIN courses c ON c.id = cert.course_id
         JOIN users u ON u.id = cert.user_id
         WHERE cert.user_id = $1::uuid AND cert.course_id = $2 LIMIT 1`,
        [uid, req.params.id],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Certificate not found' });
      const row = r.rows[0];
      res.json({
        certificate: {
          id: row.id,
          courseId: row.course_id,
          courseTitle: row.course_title,
          learnerName: row.learner_name,
          verifyCode: row.verify_code,
          issuedAt: row.issued_at,
          metadata: asJson(row.metadata, {}),
        },
      });
    } catch (e) {
      console.error('GET /api/courses/:id/certificate error:', e);
      res.status(500).json({ error: 'Failed to load certificate' });
    }
  });

  app.get('/api/courses/certificates/verify/:code', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT cert.*, c.title AS course_title, u.full_name AS learner_name
         FROM course_completion_certificates cert
         JOIN courses c ON c.id = cert.course_id
         JOIN users u ON u.id = cert.user_id
         WHERE cert.verify_code = $1 LIMIT 1`,
        [String(req.params.code || '').trim().toUpperCase()],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Invalid verify code' });
      const row = r.rows[0];
      res.json({
        valid: true,
        courseTitle: row.course_title,
        learnerName: row.learner_name,
        issuedAt: row.issued_at,
        verifyCode: row.verify_code,
      });
    } catch (e) {
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  app.post('/api/courses/:id/progress', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const { lessonId, watchedSeconds, completed } = req.body || {};
    if (!lessonId) return res.status(400).json({ error: 'lessonId required' });
    try {
      const result = await saveLessonProgress(pool, uid, req.params.id, {
        lessonId,
        watchedSeconds: Number(watchedSeconds || 0),
        completed: !!completed,
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          error: result.error,
          code: result.code,
          requiredSeconds: result.requiredSeconds,
          watchedSeconds: result.watchedSeconds,
        });
      }
      res.json({
        ok: true,
        progressPct: result.progressPct,
        newlyCompleted: result.newlyCompleted,
        certificate: result.certificate,
        completedLessonIds: result.completedLessonIds,
        lessonProgress: result.lessonProgress,
      });
    } catch (e) {
      console.error('POST /api/courses/:id/progress error:', e);
      res.status(500).json({ error: 'Failed to save progress' });
    }
  });

  app.get('/api/courses/:id/lessons/:lessonId/playback', maybeAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const access = await assertLessonPlaybackAccess(pool, uid, req.params.id, req.params.lessonId);
      if (!access.ok) {
        return res.status(access.httpStatus || 403).json({ error: access.error, code: access.code });
      }
      const origin = String(req.headers.origin || req.headers.referer || '').split('/').slice(0, 3).join('/');
      const grant = createLessonPlaybackGrant(access.lesson, {
        origin,
        secret: process.env.JWT_SECRET || process.env.PLAYBACK_SIGNING_SECRET,
      });
      if (!grant.embedUrl) {
        return res.status(404).json({ error: 'No video for this lesson' });
      }
      res.json({
        ...grant,
        access: access.access,
        lessonTitle: access.lesson.title,
      });
    } catch (e) {
      console.error('GET lesson playback error:', e);
      res.status(500).json({ error: 'Failed to load playback' });
    }
  });

  app.put('/api/courses/:id/lessons/:lessonId/notes', authenticateToken, async (req, res) => {
    try {
      const result = await upsertLessonNote(
        pool,
        userId(req),
        req.params.id,
        req.params.lessonId,
        req.body?.body,
      );
      if (!result.ok) return res.status(result.httpStatus || 400).json({ error: result.error });
      res.json({ ok: true, note: result.note });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save note' });
    }
  });

  app.get('/api/courses/:id/lessons/:lessonId/quiz', authenticateToken, async (req, res) => {
    try {
      const lessonRes = await pool.query(
        `SELECT title, quiz_pass_percent FROM course_lessons WHERE id = $1::uuid AND course_id = $2 LIMIT 1`,
        [req.params.lessonId, req.params.id],
      );
      if (!lessonRes.rows?.[0]) return res.status(404).json({ error: 'Lesson not found' });
      const qRes = await pool.query(
        `SELECT id, question_text, options, correct_option_id FROM course_questions
         WHERE course_id = $1 ORDER BY sort_order, id`,
        [req.params.id],
      );
      res.json({
        quiz: mapQuizForClient(qRes.rows, lessonRes.rows[0].title, lessonRes.rows[0].quiz_pass_percent),
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load quiz' });
    }
  });

  app.post('/api/courses/:id/lessons/:lessonId/quiz/submit', authenticateToken, async (req, res) => {
    try {
      const result = await submitLessonQuiz(
        pool,
        userId(req),
        req.params.id,
        req.params.lessonId,
        req.body?.answers || {},
      );
      if (!result.ok) return res.status(result.httpStatus || 400).json({ error: result.error });
      res.json(result);
    } catch (e) {
      console.error('POST quiz/submit error:', e);
      res.status(500).json({ error: 'Quiz submit failed' });
    }
  });

  app.post('/api/courses/:id/reviews', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const result = await submitCourseReviewSvc(pool, uid, req.params.id, {
        rating: req.body?.rating,
        comment: req.body?.comment,
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          error: result.error,
          code: result.code,
          progressPct: result.progressPct,
          minProgressPct: result.minProgressPct,
        });
      }
      trackFunnel(pool, {
        userId: uid,
        courseId: req.params.id,
        eventType: 'course_review_submitted',
        metadata: { rating: result.review?.rating },
      });
      res.json({
        ok: true,
        review: result.review,
        ratingAvg: result.ratingAvg,
        ratingCount: result.ratingCount,
      });
    } catch (e) {
      console.error('POST /api/courses/:id/reviews error:', e);
      res.status(500).json({ error: 'Failed to save review' });
    }
  });

  app.get('/api/courses/:id/reviews/mine', authenticateToken, async (req, res) => {
    try {
      const uid = userId(req);
      const review = await getMyCourseReview(pool, uid, req.params.id);
      const eligibility = await getEnrollmentReviewEligibility(pool, uid, req.params.id);
      res.json({
        review,
        canReview: !!eligibility.canReview,
        progressPct: eligibility.progressPct ?? 0,
        minProgressPct: eligibility.minProgressPct,
        code: eligibility.code,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load review' });
    }
  });

  app.patch('/api/courses/:id/reviews/mine', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const result = await updateCourseReview(pool, uid, req.params.id, {
        rating: req.body?.rating,
        comment: req.body?.comment,
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          error: result.error,
          code: result.code,
          progressPct: result.progressPct,
          minProgressPct: result.minProgressPct,
        });
      }
      res.json({
        ok: true,
        review: result.review,
        ratingAvg: result.ratingAvg,
        ratingCount: result.ratingCount,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update review' });
    }
  });

  app.delete('/api/courses/:id/reviews/mine', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const result = await deleteCourseReview(pool, uid, req.params.id);
      if (!result.ok) {
        return res.status(result.httpStatus || 404).json({ error: result.error, code: result.code });
      }
      res.json({
        ok: true,
        ratingAvg: result.ratingAvg,
        ratingCount: result.ratingCount,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete review' });
    }
  });

  app.get('/api/courses/:id/reviews', async (req, res) => {
    try {
      const data = await listCourseReviewsSvc(pool, req.params.id, {
        limit: req.query.limit,
        offset: req.query.offset,
        sort: req.query.sort,
      });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load reviews' });
    }
  });

  app.get('/api/courses/:id/qa', async (req, res) => {
    try {
      const data = await listCourseQaThreads(pool, req.params.id, {
        lessonId: req.query.lessonId || null,
        limit: req.query.limit || 50,
      });
      res.json(data);
    } catch (e) {
      console.error('GET /api/courses/:id/qa error:', e);
      res.status(500).json({ error: 'Failed to load Q&A' });
    }
  });

  app.post('/api/courses/:id/qa', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const result = await postCourseQaMessage(pool, uid, req.params.id, {
        body: req.body?.body,
        lessonId: req.body?.lessonId || null,
        parentId: req.body?.parentId || null,
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({ error: result.error, code: result.code });
      }

      if (result.isNewRootQuestion) {
        trackFunnel(pool, {
          userId: uid,
          courseId: req.params.id,
          eventType: 'course_qa_posted',
          metadata: { lessonId: req.body?.lessonId || null },
        });
        notifyInstructorNewQaQuestion(pool, notifyCourseUser, {
          courseId: req.params.id,
          askerUserId: uid,
          askerName: result.askerName,
          lessonId: req.body?.lessonId || null,
          questionPreview: req.body?.body,
        }).catch((e) => console.warn('[courseQaNotify]', e?.message));
      }

      res.status(201).json({ message: result.message });
    } catch (e) {
      console.error('POST /api/courses/:id/qa error:', e);
      res.status(500).json({ error: 'Failed to post question' });
    }
  });

  app.patch('/api/courses/:id/qa/:messageId', authenticateToken, async (req, res) => {
    try {
      const result = await updateCourseQaMessage(pool, userId(req), req.params.id, req.params.messageId, {
        body: req.body?.body,
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({ error: result.error, code: result.code });
      }
      res.json({ message: result.message });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update Q&A' });
    }
  });

  app.delete('/api/courses/:id/qa/:messageId', authenticateToken, async (req, res) => {
    try {
      const result = await deleteCourseQaMessage(pool, userId(req), req.params.id, req.params.messageId);
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({ error: result.error, code: result.code });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete Q&A' });
    }
  });

  app.post('/api/courses/:id/recommend', authenticateToken, async (req, res) => {
    try {
      const coachId = userId(req);
      const result = await recommendCourseToTrainee(
        pool,
        coachId,
        req.params.id,
        req.body?.traineeId,
        req.body?.note || '',
      );
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          error: result.error,
          code: result.code,
        });
      }
      res.status(201).json({
        recommendation: result.recommendation,
        courseTitle: result.courseTitle,
      });
    } catch (e) {
      console.error('POST /api/courses/:id/recommend error:', e);
      res.status(500).json({ error: 'Failed to recommend course' });
    }
  });

  app.post('/api/courses/analytics/events', async (req, res) => {
    try {
      const events = Array.isArray(req.body?.events) ? req.body.events : [req.body || {}];
      const uid = userId(req);
      const results = [];
      for (const evt of events.slice(0, 20)) {
        const r = await trackCourseFunnelEvent(pool, {
          userId: uid || evt.userId || null,
          courseId: evt.courseId || evt.course_id,
          eventType: evt.eventType || evt.event_type,
          sessionId: evt.sessionId || evt.session_id || req.headers['x-course-session'],
          metadata: evt.metadata || {},
        });
        results.push(r);
      }
      res.json({ ok: true, results });
    } catch (e) {
      console.error('POST /api/courses/analytics/events error:', e);
      res.status(500).json({ error: 'Failed to track course analytics' });
    }
  });

  app.get('/api/admin/courses/marketplace/review-queue', adminAuthMiddleware, async (req, res) => {
    try {
      const status = String(req.query.status || 'in_review').trim();
      const allowed = ['in_review', 'published', 'rejected', 'unlisted', 'draft'];
      const filterStatus = allowed.includes(status) ? status : 'in_review';
      const r = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name, u.email AS instructor_email,
                p.headline AS instructor_headline, p.bio AS instructor_bio
         FROM courses c
         LEFT JOIN users u ON u.id = c.instructor_user_id
         LEFT JOIN course_instructor_profiles p ON p.user_id = c.instructor_user_id
         WHERE c.is_marketplace = TRUE AND c.status = $1
         ORDER BY c.submitted_at ASC NULLS LAST, c.updated_at DESC
         LIMIT 100`,
        [filterStatus],
      );
      const courses = [];
      for (const row of r.rows || []) {
        const lessonsRes = await pool.query(
          `SELECT id, title, is_preview, duration_min FROM course_lessons WHERE course_id = $1`,
          [row.id],
        );
        const instructorProfile = row.instructor_headline || row.instructor_bio
          ? { headline: row.instructor_headline, bio: row.instructor_bio }
          : null;
        const checklist = buildCourseQualityChecklist(row, lessonsRes.rows || [], instructorProfile);
        courses.push({
          course: mapCourse(row),
          checklist,
          instructorEmail: row.instructor_email || null,
        });
      }
      res.json({ status: filterStatus, courses });
    } catch (e) {
      console.error('GET review-queue error:', e);
      res.status(500).json({ error: 'Failed to load review queue' });
    }
  });

  app.get('/api/admin/courses/analytics/funnel', adminAuthMiddleware, async (req, res) => {
    try {
      const report = await getCourseFunnelReport(pool, {
        from: req.query.from || null,
        to: req.query.to || null,
        courseId: req.query.courseId || null,
      });
      res.json(report);
    } catch (e) {
      console.error('GET funnel analytics error:', e);
      res.status(500).json({ error: 'Failed to load funnel analytics' });
    }
  });

  app.get('/api/admin/courses/launch-checklist', adminAuthMiddleware, async (req, res) => {
    try {
      const checklist = await buildCourseLaunchChecklist(pool);
      res.json(checklist);
    } catch (e) {
      console.error('GET launch-checklist error:', e);
      res.status(500).json({ error: 'Failed to build launch checklist' });
    }
  });

  app.patch('/api/admin/courses/marketplace/:id/review', adminAuthMiddleware, async (req, res) => {
    const action = String(req.body?.action || '').trim();
    const allowed = ['approve', 'reject', 'unlist', 'takedown', 'feature', 'unfeature'];
    if (!allowed.includes(action)) return res.status(400).json({ error: 'Invalid action' });
    const adminId = userId(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT * FROM courses WHERE id = $1 AND is_marketplace = TRUE FOR UPDATE`,
        [req.params.id],
      );
      const before = cur.rows?.[0];
      if (!before) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Course not found' });
      }
      const beforeStatus = before.status;
      let afterStatus = beforeStatus;
      let bannerResult = null;

      if (action === 'approve') {
        afterStatus = 'published';
        await client.query(
          `UPDATE courses SET status = 'published', rejection_reason = NULL,
             published_at = COALESCE(published_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [req.params.id],
        );
      } else if (action === 'reject') {
        afterStatus = 'rejected';
        await client.query(
          `UPDATE courses SET status = 'rejected', rejection_reason = $2, updated_at = NOW() WHERE id = $1`,
          [req.params.id, req.body?.reason || null],
        );
      } else if (action === 'unlist' || action === 'takedown') {
        afterStatus = 'unlisted';
        await client.query(
          `UPDATE courses SET status = 'unlisted', rejection_reason = $2, updated_at = NOW() WHERE id = $1`,
          [req.params.id, req.body?.reason || 'admin_takedown'],
        );
      } else if (action === 'feature') {
        const rank = Number(req.body?.featuredRank ?? req.body?.featured_rank ?? 0);
        const nextRank = rank > 0 ? rank : Number(
          (await client.query(
            `SELECT COALESCE(MAX(featured_rank), 0) + 1 AS n FROM courses WHERE is_marketplace = TRUE AND status = 'published'`,
          )).rows?.[0]?.n || 1,
        );
        await client.query(
          `UPDATE courses SET featured_at = NOW(), featured_rank = $2, updated_at = NOW() WHERE id = $1`,
          [req.params.id, nextRank],
        );
        afterStatus = beforeStatus;
      } else if (action === 'unfeature') {
        await client.query(
          `UPDATE courses SET featured_at = NULL, featured_rank = 0, updated_at = NOW() WHERE id = $1`,
          [req.params.id],
        );
        afterStatus = beforeStatus;
      }

      const rateRaw = req.body?.platformRateOverride ?? req.body?.platform_rate_override;
      if (rateRaw !== undefined && rateRaw !== null && rateRaw !== '') {
        const rate = Number(rateRaw);
        if (Number.isFinite(rate) && rate >= 0 && rate <= 0.9) {
          await client.query(
            `UPDATE courses SET platform_rate_override = $2, updated_at = NOW() WHERE id = $1`,
            [req.params.id, rate],
          );
        }
      } else if (req.body?.clearPlatformRateOverride === true) {
        await client.query(
          `UPDATE courses SET platform_rate_override = NULL, updated_at = NOW() WHERE id = $1`,
          [req.params.id],
        );
      }

      await appendCourseAuditLog(client, {
        courseId: req.params.id,
        adminUserId: adminId,
        action,
        beforeStatus,
        afterStatus,
        reason: req.body?.reason || null,
        metadata: { bannerResult },
      });

      const updated = await client.query(`SELECT * FROM courses WHERE id = $1`, [req.params.id]);
      await client.query('COMMIT');
      await logCourseMarketplaceEvent(pool, {
        adminUserId: adminId,
        action: `course_${action}`,
        entityType: 'courses',
        entityId: req.params.id,
        courseId: req.params.id,
        beforeStatus,
        afterStatus,
        reason: req.body?.reason || null,
        metadata: {
          platformRateOverride: updated.rows?.[0]?.platform_rate_override ?? null,
          createBanner: req.body?.createBanner !== false,
        },
        stateBefore: { status: beforeStatus },
        stateAfter: { status: afterStatus },
      });
      if (action === 'approve' && req.body?.createBanner !== false) {
        bannerResult = await createCourseAnnouncementBannerDraft(pool, updated.rows[0], { adminUserId: adminId });
      }
      res.json({
        course: mapCourse(updated.rows[0]),
        action,
        banner: bannerResult,
      });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('PATCH /api/admin/courses/marketplace/:id/review error:', e);
      res.status(500).json({ error: 'Failed to review course' });
    } finally {
      client.release();
    }
  });

  app.get('/api/admin/courses/marketplace/audit-log', adminAuthMiddleware, async (req, res) => {
    try {
      const rows = await listCourseMarketplaceAuditLog(pool, {
        courseId: req.query.courseId || null,
        limit: req.query.limit || 50,
      });
      res.json({ rows });
    } catch (e) {
      console.error('GET audit-log error:', e);
      res.status(500).json({ error: 'Failed to load audit log' });
    }
  });

  app.get('/api/admin/courses/marketplace/:id/moderation', adminAuthMiddleware, async (req, res) => {
    try {
      const [reviews, qa] = await Promise.all([
        listAdminCourseReviews(pool, req.params.id, { includeHidden: true, limit: 50 }),
        listAdminCourseQa(pool, req.params.id, { limit: 50 }),
      ]);
      res.json({ reviews, qa });
    } catch (e) {
      console.error('GET moderation panel error:', e);
      res.status(500).json({ error: 'Failed to load moderation data' });
    }
  });

  app.patch('/api/admin/courses/marketplace/:id/reviews/:reviewId', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = userId(req);
      const action = String(req.body?.action || '').trim();
      const result = await moderateCourseReview(pool, {
        reviewId: req.params.reviewId,
        courseId: req.params.id,
        adminUserId: adminId,
        action,
        reason: req.body?.reason || null,
      });
      if (!result.ok) return res.status(result.httpStatus || 400).json({ error: result.error, code: result.code });
      res.json(result);
    } catch (e) {
      console.error('PATCH admin review moderate error:', e);
      res.status(500).json({ error: 'Failed to moderate review' });
    }
  });

  app.patch('/api/admin/courses/marketplace/:id/qa/:messageId', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = userId(req);
      const action = String(req.body?.action || '').trim();
      const result = await moderateCourseQaMessage(pool, {
        messageId: req.params.messageId,
        courseId: req.params.id,
        adminUserId: adminId,
        action,
        reason: req.body?.reason || null,
      });
      if (!result.ok) return res.status(result.httpStatus || 400).json({ error: result.error, code: result.code });
      res.json(result);
    } catch (e) {
      console.error('PATCH admin qa moderate error:', e);
      res.status(500).json({ error: 'Failed to moderate Q&A' });
    }
  });

  app.patch('/api/admin/courses/revenue/policy', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = userId(req);
      const body = req.body || {};
      const cur = await pool.query(
        `SELECT value_json FROM payout_config WHERE key = 'course_revenue_policy' LIMIT 1`,
      );
      const before = cur.rows?.[0]?.value_json || {};
      const next = { ...before };
      if (body.platformRate != null) next.platformRate = Number(body.platformRate);
      if (body.coachDirectDiscountRate != null) next.coachDirectDiscountRate = Number(body.coachDirectDiscountRate);
      if (body.coachDirectPlatformRate != null) next.coachDirectPlatformRate = Number(body.coachDirectPlatformRate);
      const normalized = normalizeCourseRevenuePolicy(next);
      await pool.query(
        `INSERT INTO payout_config (key, value_json, updated_at)
         VALUES ('course_revenue_policy', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
        [JSON.stringify(normalized)],
      );
      await logCourseMarketplaceEvent(pool, {
        adminUserId: adminId,
        action: 'course_revenue_policy_updated',
        entityType: 'payout_config',
        entityId: 'course_revenue_policy',
        courseId: null,
        stateBefore: before,
        stateAfter: normalized,
      });
      res.json({ policy: normalized });
    } catch (e) {
      console.error('PATCH revenue policy error:', e);
      res.status(500).json({ error: 'Failed to update revenue policy' });
    }
  });
}
