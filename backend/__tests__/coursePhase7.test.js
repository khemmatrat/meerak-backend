import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertActiveCoachTraineeLink,
  recommendCourseToTrainee,
} from '../lib/courseCoachRecommend.js';
import { computeCoursePurchaseQuote } from '../lib/courseFeeEngine.js';

test('assertActiveCoachTraineeLink rejects missing ids', async () => {
  const r = await assertActiveCoachTraineeLink(null, null, null);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'missing_ids');
});

test('coach-direct quote applies discount and platform rate', () => {
  const q = computeCoursePurchaseQuote({
    priceThb: 1000,
    policy: { coachDirectDiscountRate: 0.1, coachDirectPlatformRate: 0.25, platformRate: 0.35 },
    isCoachDirect: true,
  });
  assert.equal(q.grossAmount, 900);
  assert.equal(q.platformRate, 0.25);
  assert.ok(q.instructorNet > 0);
});

test('recommendCourseToTrainee validates published course', async () => {
  const pool = {
    query: async (sql, params) => {
      if (String(sql).includes('coach_trainee_connections')) {
        return { rows: [{ id: 'conn-1' }] };
      }
      if (String(sql).includes('FROM courses')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const r = await recommendCourseToTrainee(pool, 'c1', 'course-x', 't1', 'note');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'course_not_found');
});
