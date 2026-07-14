/**
 * Phase 15 — creator wizard, quality checklist, revenue preview, upload hooks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildCourseQualityChecklist,
  buildRevenueProjections,
  evaluateSubmitReadiness,
} from '../lib/courseStudioHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

test('buildCourseQualityChecklist requires thumbnail, preview, paid lesson, bio, pricing', () => {
  const incomplete = buildCourseQualityChecklist(
    { title: 'T', priceThb: 0, duration: 5, learningOutcomes: ['a'] },
    [{ isPreview: true, sectionId: 's1', durationMin: 5 }],
    null,
  );
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.items.some((i) => i.id === 'thumbnail' && !i.ok));
  assert.ok(incomplete.items.some((i) => i.id === 'paid_lesson' && !i.ok));
  assert.ok(incomplete.items.some((i) => i.id === 'bio' && !i.ok));

  const complete = buildCourseQualityChecklist(
    {
      title: 'Demo',
      priceThb: 499,
      duration: 30,
      imageUrl: 'https://cdn.example/thumb.jpg',
      learningOutcomes: ['a', 'b'],
    },
    [
      { isPreview: true, sectionId: 's1', durationMin: 10 },
      { isPreview: false, sectionId: 's1', durationMin: 20 },
    ],
    { bio: 'Instructor bio' },
  );
  assert.equal(complete.ready, true);
  assert.equal(complete.score, 100);
});

test('buildRevenueProjections scales instructor net for 10/25/50 units', () => {
  const rows = buildRevenueProjections({
    grossAmount: 499,
    platformFee: 150,
    instructorNet: 349,
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].units, 10);
  assert.equal(rows[0].instructorNet, 3490);
  assert.equal(rows[2].units, 50);
  assert.equal(rows[2].instructorNet, 17450);
});

test('evaluateSubmitReadiness blocks incomplete checklist', () => {
  const blocked = evaluateSubmitReadiness({ ready: false, items: [] });
  assert.equal(blocked.allowed, false);
  const ok = evaluateSubmitReadiness({ ready: true, items: [] });
  assert.equal(ok.allowed, true);
});

test('Phase 15 wizard + upload artifacts exist', () => {
  const studio = readFileSync(join(root, 'mobile', 'pages', 'CourseStudio.tsx'), 'utf8');
  assert.match(studio, /WIZARD_STEPS/);
  assert.match(studio, /uploadCourseImage/);
  assert.match(studio, /uploadCourseVideo/);
  assert.match(studio, /ChecklistPanel/);
  assert.match(studio, /buildRevenueProjections|projections\.map/);
  assert.match(studio, /CourseMarketplaceCard|PreviewCard/);

  const routes = readFileSync(join(root, 'backend', 'routes', 'courseStudio.js'), 'utf8');
  assert.match(routes, /\/api\/course-studio\/courses\/:id\/wizard/);
  assert.match(routes, /buildCourseQualityChecklist/);
  assert.match(routes, /buildRevenueProjections/);
  assert.match(routes, /evaluateSubmitReadiness/);
});
