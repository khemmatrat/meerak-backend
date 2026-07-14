import test from 'node:test';
import assert from 'node:assert/strict';
import { canReviewFromProgress } from '../lib/courseReviewService.js';

test('canReviewFromProgress allows completed or 25%+ progress', () => {
  assert.equal(canReviewFromProgress(10), false);
  assert.equal(canReviewFromProgress(25), true);
  assert.equal(canReviewFromProgress(0, new Date()), true);
});

test('course funnel event types include qa and review', async () => {
  const { COURSE_FUNNEL_EVENTS, normalizeFunnelEventType } = await import('../lib/courseFunnelAnalytics.js');
  assert.ok(COURSE_FUNNEL_EVENTS.includes('course_qa_posted'));
  assert.ok(COURSE_FUNNEL_EVENTS.includes('course_review_submitted'));
  assert.equal(normalizeFunnelEventType('course_detail_view'), 'course_detail_view');
  assert.equal(normalizeFunnelEventType('invalid'), null);
});

test('getCourseFunnelReport computes conversion rates', async () => {
  const { getCourseFunnelReport } = await import('../lib/courseFunnelAnalytics.js');
  const pool = {
    query: async () => ({
      rows: [
        { event_type: 'course_impression', events: 100, unique_actors: 80 },
        { event_type: 'course_detail_view', events: 40, unique_actors: 35 },
        { event_type: 'course_purchase_intent', events: 10, unique_actors: 10 },
        { event_type: 'course_purchase_completed', events: 5, unique_actors: 5 },
      ],
    }),
  };
  const report = await getCourseFunnelReport(pool, {});
  assert.equal(report.funnel.course_impression, 100);
  assert.equal(report.funnel.course_purchase_completed, 5);
  assert.equal(report.conversion.detail_rate, 40);
  assert.equal(report.conversion.purchase_rate, 50);
});
