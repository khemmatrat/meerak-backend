/**
 * Phase 18 — admin ops, analytics funnel, banner automation, production launch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COURSE_FUNNEL_EVENTS,
  getCourseFunnelReport,
  normalizeFunnelEventType,
} from '../lib/courseFunnelAnalytics.js';
import { MANUAL_QA_STEPS } from '../lib/courseLaunchChecklist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

test('COURSE_FUNNEL_EVENTS covers full Phase 18 funnel including Q&A', () => {
  const required = [
    'course_impression',
    'course_detail_view',
    'course_preview_play',
    'course_purchase_intent',
    'course_purchase_completed',
    'course_lesson_completed',
    'course_review_submitted',
    'course_qa_posted',
  ];
  for (const step of required) {
    assert.ok(COURSE_FUNNEL_EVENTS.includes(step), `missing ${step}`);
    assert.equal(normalizeFunnelEventType(step), step);
  }
});

test('getCourseFunnelReport exposes qa_posted in funnel summary', async () => {
  const pool = {
    query: async () => ({
      rows: [
        { event_type: 'course_purchase_completed', events: 4, unique_actors: 4 },
        { event_type: 'course_qa_posted', events: 2, unique_actors: 2 },
      ],
    }),
  };
  const report = await getCourseFunnelReport(pool, {});
  assert.equal(report.funnel.course_qa_posted, 2);
  assert.equal(report.conversion.qa_rate, 50);
});

test('MANUAL_QA_STEPS includes production sign-off scenarios', () => {
  const ids = MANUAL_QA_STEPS.map((s) => s.id);
  assert.ok(ids.includes('purchase_wallet'));
  assert.ok(ids.includes('purchase_gateway'));
  assert.ok(ids.includes('refund_edge'));
  assert.ok(ids.includes('seller_dashboard'));
  assert.ok(ids.includes('http_e2e'));
});

test('Phase 18 admin ops artifacts exist', () => {
  const adminView = readFileSync(
    join(root, 'nexus-admin-core', 'components', 'CourseMarketplaceAdminView.tsx'),
    'utf8',
  );
  assert.match(adminView, /getCourseMarketplaceReviewQueue/);
  assert.match(adminView, /reviewCourseMarketplace/);
  assert.match(adminView, /getCourseLaunchChecklist/);
  assert.match(adminView, /getCourseMarketplaceFunnel/);

  const banner = readFileSync(join(root, 'backend', 'lib', 'courseBannerAutomation.js'), 'utf8');
  assert.match(banner, /createCourseAnnouncementBannerDraft/);
  assert.match(banner, /isActive: false/);

  const qaNotify = readFileSync(join(root, 'backend', 'lib', 'courseQaNotify.js'), 'utf8');
  assert.match(qaNotify, /notifyInstructorNewQaQuestion/);

  const routes = readFileSync(join(root, 'backend', 'routes', 'courseMarketplace.js'), 'utf8');
  assert.match(routes, /\/api\/admin\/courses\/marketplace\/review-queue/);
  assert.match(routes, /\/api\/admin\/courses\/launch-checklist/);
  assert.match(routes, /createCourseAnnouncementBannerDraft/);
  assert.match(routes, /course_qa_posted/);
});
