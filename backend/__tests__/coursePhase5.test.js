import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQaThreads,
  mapQaRow,
} from '../lib/courseQaService.js';
import {
  buildRatingDistribution,
  canReviewFromProgress,
  MIN_REVIEW_PROGRESS_PCT,
  normalizeReviewSort,
} from '../lib/courseReviewService.js';
import { notifyInstructorNewQaQuestion } from '../lib/courseQaNotify.js';

test('buildQaThreads nests replies under root', () => {
  const instructorId = '11111111-1111-1111-1111-111111111111';
  const rows = [
    { id: 'q1', course_id: 'c1', lesson_id: null, user_id: 'u1', user_name: 'A', parent_id: null, body: 'Q?', created_at: '2026-01-02', updated_at: '2026-01-02' },
    { id: 'a1', course_id: 'c1', lesson_id: null, user_id: instructorId, user_name: 'Inst', parent_id: 'q1', body: 'A!', created_at: '2026-01-03', updated_at: '2026-01-03' },
  ];
  const threads = buildQaThreads(rows, instructorId);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].replies.length, 1);
  assert.equal(threads[0].replies[0].isInstructor, true);
});

test('mapQaRow flags instructor', () => {
  const row = mapQaRow(
    { id: '1', course_id: 'c', user_id: 'u', user_name: 'X', body: 'hi', created_at: 'x', updated_at: 'x' },
    { instructorUserId: 'u' },
  );
  assert.equal(row.isInstructor, true);
});

test('canReviewFromProgress requires min pct unless completed', () => {
  assert.equal(canReviewFromProgress(10, null), false);
  assert.equal(canReviewFromProgress(MIN_REVIEW_PROGRESS_PCT, null), true);
  assert.equal(canReviewFromProgress(5, '2026-01-01'), true);
  assert.equal(canReviewFromProgress(100, null), true);
});

test('buildRatingDistribution counts stars', () => {
  const d = buildRatingDistribution([{ rating: 5 }, { rating: 5 }, { rating: 3 }]);
  assert.equal(d.total, 3);
  assert.equal(d.dist[5], 2);
  assert.equal(d.dist[3], 1);
});

test('normalizeReviewSort defaults and validates', () => {
  assert.equal(normalizeReviewSort(undefined), 'newest');
  assert.equal(normalizeReviewSort('rating_high'), 'rating_high');
  assert.equal(normalizeReviewSort('invalid'), 'newest');
});

test('notifyInstructorNewQaQuestion skips without notifier', async () => {
  const r = await notifyInstructorNewQaQuestion(null, null, { courseId: 'c1', askerUserId: 'u1' });
  assert.equal(r.skipped, true);
});
