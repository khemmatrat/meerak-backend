/**
 * Phase 13 — runtime readiness, seed constants, empty-state hints.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCourseReadinessHint,
  CORE_READINESS_TABLES,
  DEMO_COURSE_IDS,
  FREE_PREVIEW_DEMO_COURSE_ID,
  readCourseRouteFlags,
} from '../lib/courseMarketplaceReadiness.js';
import { SEED_MARKETPLACE_COURSE_ID } from '../lib/courseSellEligibility.js';

test('DEMO_COURSE_IDS matches seed course constants', () => {
  assert.equal(DEMO_COURSE_IDS.paid, SEED_MARKETPLACE_COURSE_ID);
  assert.equal(DEMO_COURSE_IDS.free, FREE_PREVIEW_DEMO_COURSE_ID);
  assert.equal(FREE_PREVIEW_DEMO_COURSE_ID, 'aqond-marketplace-free-preview');
});

test('CORE_READINESS_TABLES includes buyer flow tables', () => {
  assert.ok(CORE_READINESS_TABLES.includes('courses'));
  assert.ok(CORE_READINESS_TABLES.includes('course_enrollments'));
  assert.ok(CORE_READINESS_TABLES.includes('course_purchase_orders'));
});

test('readCourseRouteFlags reads express app flags', () => {
  const app = {
    get(key) {
      return key === 'courseMarketplaceRoutesRegistered';
    },
  };
  const flags = readCourseRouteFlags(app);
  assert.equal(flags.marketplace, true);
  assert.equal(flags.studio, false);
});

test('buildCourseReadinessHint prioritizes missing marketplace routes', () => {
  const hint = buildCourseReadinessHint({
    routes: { marketplace: false, studio: true, purchase: true },
    tables: Object.fromEntries(CORE_READINESS_TABLES.map((t) => [t, true])),
    publishedCourses: 2,
    phase0Ok: true,
  });
  assert.match(hint, /restart backend/i);
  assert.match(hint, /marketplace/i);
});

test('buildCourseReadinessHint distinguishes empty catalog', () => {
  const hint = buildCourseReadinessHint({
    routes: { marketplace: true, studio: true, purchase: true },
    tables: Object.fromEntries(CORE_READINESS_TABLES.map((t) => [t, true])),
    publishedCourses: 0,
    previewLessons: 0,
    phase0Ok: true,
  });
  assert.match(hint, /empty_catalog/i);
});

test('buildCourseReadinessHint returns ready when all checks pass', () => {
  const hint = buildCourseReadinessHint({
    routes: { marketplace: true, studio: true, purchase: true, gateway: true },
    tables: Object.fromEntries(CORE_READINESS_TABLES.map((t) => [t, true])),
    publishedCourses: 2,
    previewLessons: 1,
    phase0Ok: true,
  });
  assert.equal(hint, 'ready');
});
