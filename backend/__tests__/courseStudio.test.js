import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStudioCourseOwner,
  assertStudioCourseEditable,
} from '../lib/courseMarketplaceShared.js';
import {
  buildCourseQualityChecklist,
  evaluateSubmitReadiness,
  normalizeQuestionOptions,
} from '../lib/courseStudioHelpers.js';

test('assertStudioCourseOwner returns true when owner row exists', async () => {
  const pool = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
  assert.equal(await assertStudioCourseOwner(pool, 'course-1', 'user-1'), true);
});

test('assertStudioCourseOwner returns false when not owner', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  assert.equal(await assertStudioCourseOwner(pool, 'course-1', 'user-2'), false);
});

test('assertStudioCourseEditable blocks published courses', async () => {
  const pool = {
    query: async () => ({ rows: [{ status: 'published' }] }),
  };
  const gate = await assertStudioCourseEditable(pool, 'c1', 'u1');
  assert.equal(gate.ok, false);
  assert.equal(gate.httpStatus, 400);
  assert.equal(gate.code, 'COURSE_PUBLISHED_LOCKED');
});

test('assertStudioCourseEditable allows draft courses', async () => {
  const pool = {
    query: async () => ({ rows: [{ status: 'draft' }] }),
  };
  const gate = await assertStudioCourseEditable(pool, 'c1', 'u1');
  assert.equal(gate.ok, true);
});

test('buildCourseQualityChecklist requires section for submit readiness', () => {
  const checklist = buildCourseQualityChecklist(
    {
      title: 'Test',
      imageUrl: 'https://example.com/x.jpg',
      priceThb: 499,
      duration: 30,
      learningOutcomes: ['a', 'b'],
    },
    [
      { title: 'Preview', isPreview: true, durationMin: 10, sectionId: 'sec-1' },
      { title: 'Paid', isPreview: false, durationMin: 20, sectionId: 'sec-1' },
    ],
    { bio: 'Instructor bio' },
  );
  assert.equal(checklist.ready, true);
  assert.equal(checklist.stats.sectionCount, 1);
});

test('buildCourseQualityChecklist fails without section', () => {
  const checklist = buildCourseQualityChecklist(
    {
      title: 'Test',
      imageUrl: 'https://example.com/x.jpg',
      priceThb: 499,
      duration: 30,
      learningOutcomes: ['a', 'b'],
    },
    [
      { title: 'Preview', is_preview: true, duration_min: 10 },
      { title: 'Paid', is_preview: false, duration_min: 20 },
    ],
    { headline: 'Coach' },
  );
  assert.equal(checklist.ready, false);
  assert.equal(checklist.items.find((i) => i.id === 'section')?.ok, false);
});

test('evaluateSubmitReadiness blocks incomplete checklist', () => {
  const gate = evaluateSubmitReadiness({ ready: false, items: [] });
  assert.equal(gate.allowed, false);
});

test('evaluateSubmitReadiness allows complete checklist', () => {
  const gate = evaluateSubmitReadiness({ ready: true, items: [] });
  assert.equal(gate.allowed, true);
});

test('normalizeQuestionOptions accepts array of strings', () => {
  const opts = normalizeQuestionOptions(['Yes', 'No']);
  assert.equal(opts.length, 2);
  assert.equal(opts[0].id, 'A');
  assert.equal(opts[1].text, 'No');
});
