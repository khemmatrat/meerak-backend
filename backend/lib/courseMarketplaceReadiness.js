/**
 * Phase 13 — runtime readiness for course marketplace + studio routes.
 */

import { evaluatePhase0Foundation, SEED_MARKETPLACE_COURSE_ID } from './courseSellEligibility.js';

export const FREE_PREVIEW_DEMO_COURSE_ID = 'aqond-marketplace-free-preview';

export const DEMO_COURSE_IDS = {
  paid: SEED_MARKETPLACE_COURSE_ID,
  free: FREE_PREVIEW_DEMO_COURSE_ID,
};

/** Minimum tables for buyer/seller flows after migrate. */
export const CORE_READINESS_TABLES = [
  'courses',
  'course_sections',
  'course_lessons',
  'course_enrollments',
  'course_purchase_orders',
];

export const EXTENDED_READINESS_TABLES = [
  ...CORE_READINESS_TABLES,
  'course_purchase_gateway_charges',
  'course_purchase_idempotency',
  'course_reviews',
  'course_refunds',
  'course_funnel_events',
  'course_marketplace_audit_log',
];

/**
 * @param {import('express').Application | { get?: (key: string) => unknown } | null | undefined} app
 */
export function readCourseRouteFlags(app) {
  return {
    marketplace: !!app?.get?.('courseMarketplaceRoutesRegistered'),
    studio: !!app?.get?.('courseStudioRoutesRegistered'),
    purchase: !!app?.get?.('coursePurchaseRoutesRegistered'),
    gateway: !!app?.get?.('courseGatewayRoutesRegistered'),
  };
}

/**
 * @param {{
 *   tables?: Record<string, boolean>,
 *   routes?: ReturnType<typeof readCourseRouteFlags>,
 *   publishedCourses?: number,
 *   previewLessons?: number,
 *   phase0Ok?: boolean,
 * }} input
 */
export function buildCourseReadinessHint(input = {}) {
  const routes = input.routes || {};
  const tables = input.tables || {};
  const coreOk = CORE_READINESS_TABLES.every((name) => tables[name] !== false);

  if (!routes.marketplace) {
    return 'restart backend — GET /api/courses/marketplace returned 404 (marketplace routes not registered)';
  }
  if (!routes.studio) {
    return 'restart backend — GET /api/course-studio/courses returned 404 (studio routes not registered)';
  }
  if (!routes.purchase) {
    return 'restart backend — purchase routes not registered';
  }
  if (!coreOk) {
    return 'run migrations 235–246, then restart backend (node server.js)';
  }
  if (input.phase0Ok === false) {
    return 'run migration 246 seed polish — published demo courses or preview lessons missing';
  }
  if (Number(input.publishedCourses || 0) === 0) {
    return 'empty_catalog — publish a course in Course Studio or run migration 246';
  }
  if (Number(input.previewLessons || 0) === 0) {
    return 'demo seed incomplete — no preview lessons; run migration 246';
  }
  return 'ready';
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ app?: import('express').Application | null, extendedTables?: boolean }} [opts]
 */
export async function buildCourseMarketplaceReadiness(pool, opts = {}) {
  const tableNames = opts.extendedTables !== false ? EXTENDED_READINESS_TABLES : CORE_READINESS_TABLES;
  const routes = readCourseRouteFlags(opts.app);

  let tables = {};
  let tablesOk = false;
  let publishedCourses = 0;
  let lessons = 0;
  let previewLessons = 0;
  let demoCourses = {};
  let phase0 = { ok: false, checks: [] };

  if (pool) {
    try {
      const tableStatus = await pool.query(
        `SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS ready
         FROM unnest($1::text[]) AS table_name`,
        [tableNames],
      );
      tables = Object.fromEntries((tableStatus.rows || []).map((row) => [row.table_name, !!row.ready]));
      tablesOk = CORE_READINESS_TABLES.every((name) => tables[name]);
    } catch (e) {
      tables = { error: e?.message || 'table probe failed' };
    }

    if (tablesOk) {
      try {
        const counts = await pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM courses WHERE is_marketplace = TRUE AND status = 'published') AS published_courses,
             (SELECT COUNT(*)::int FROM course_lessons
                WHERE course_id IN (SELECT id FROM courses WHERE is_marketplace = TRUE)) AS lessons,
             (SELECT COUNT(*)::int FROM course_lessons
                WHERE course_id IN (SELECT id FROM courses WHERE is_marketplace = TRUE)
                  AND is_preview = TRUE) AS preview_lessons`,
        );
        publishedCourses = Number(counts.rows?.[0]?.published_courses || 0);
        lessons = Number(counts.rows?.[0]?.lessons || 0);
        previewLessons = Number(counts.rows?.[0]?.preview_lessons || 0);
      } catch {
        /* counts optional */
      }

      try {
        const demo = await pool.query(
          `SELECT id, status, is_marketplace,
                  (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id) AS lesson_count,
                  (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id AND l.is_preview = TRUE) AS preview_count
           FROM courses c
           WHERE id = ANY($1::varchar[])`,
          [Object.values(DEMO_COURSE_IDS)],
        );
        demoCourses = Object.fromEntries(
          (demo.rows || []).map((row) => [
            row.id,
            {
              exists: true,
              status: row.status,
              isMarketplace: !!row.is_marketplace,
              lessonCount: Number(row.lesson_count || 0),
              previewCount: Number(row.preview_count || 0),
            },
          ]),
        );
      } catch {
        /* demo probe optional */
      }

      phase0 = await evaluatePhase0Foundation(pool);
    }
  }

  const routesOk = routes.marketplace && routes.studio && routes.purchase;
  const hint = buildCourseReadinessHint({
    tables,
    routes,
    publishedCourses,
    previewLessons,
    phase0Ok: phase0.ok,
  });

  const ok =
    tablesOk
    && routesOk
    && phase0.ok
    && publishedCourses >= 1
    && previewLessons >= 1;

  return {
    ok,
    route: 'course-marketplace',
    migration: '246+',
    hint,
    routes,
    tables,
    publishedCourses,
    lessons,
    previewLessons,
    demoCourseIds: DEMO_COURSE_IDS,
    demoCourses,
    phase0,
    emptyCatalogReason: ok
      ? null
      : !routesOk || !tablesOk
        ? 'api_unavailable'
        : publishedCourses === 0
          ? 'empty_catalog'
          : null,
    devRestartChecklist: [
      'Stop node server.js (Ctrl+C) and start again after migration or route changes',
      'GET /api/course-marketplace/health should return ok:true and hint:ready',
      'GET /api/courses/marketplace should not return 404',
      'GET /api/course-studio/courses requires auth — 401 is OK, 404 means routes missing',
    ],
  };
}
