import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMarkLessonComplete,
  isLessonSequentiallyLocked,
  requiredWatchSeconds,
  scoreQuizAnswers,
} from '../lib/courseLearningService.js';

test('requiredWatchSeconds uses explicit threshold', () => {
  assert.equal(requiredWatchSeconds({ watched_seconds_required: 120, duration_min: 5 }), 120);
});

test('requiredWatchSeconds defaults to half duration for video', () => {
  assert.equal(requiredWatchSeconds({ step_type: 'video', duration_min: 10 }), 300);
});

test('canMarkLessonComplete blocks early completion', () => {
  const r = canMarkLessonComplete({
    lesson: { step_type: 'video', duration_min: 10, watched_seconds_required: 60 },
    watchedSeconds: 30,
    completed: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'watch_requirement_not_met');
});

test('isLessonSequentiallyLocked respects prior completion', () => {
  const lessons = [
    { id: 'a', sort_order: 1, is_preview: false },
    { id: 'b', sort_order: 2, is_preview: false },
  ];
  assert.equal(
    isLessonSequentiallyLocked({
      lessons,
      completedLessonIds: new Set(),
      targetLessonId: 'b',
      sequentialUnlock: true,
    }),
    true,
  );
  assert.equal(
    isLessonSequentiallyLocked({
      lessons,
      completedLessonIds: new Set(['a']),
      targetLessonId: 'b',
      sequentialUnlock: true,
    }),
    false,
  );
});

test('scoreQuizAnswers computes percentage', () => {
  const questions = [
    { id: 'q1', correct_option_id: 'A' },
    { id: 'q2', correct_option_id: 'B' },
  ];
  const r = scoreQuizAnswers(questions, { q1: 'A', q2: 'C' });
  assert.equal(r.score, 50);
  assert.equal(r.correct, 1);
});
