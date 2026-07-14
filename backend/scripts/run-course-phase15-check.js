#!/usr/bin/env node
/**
 * Phase 15 check — creator wizard, checklist, revenue preview, S3 upload hooks.
 * Usage: node scripts/run-course-phase15-check.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCourseQualityChecklist, buildRevenueProjections } from '../lib/courseStudioHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const checks = [
  ['mobile/pages/CourseStudio.tsx', /WIZARD_STEPS[\s\S]*ส่งตรวจ/],
  ['mobile/pages/CourseStudio.tsx', /uploadCourseImage/],
  ['mobile/services/courseMarketplaceService.ts', /\/upload\/image/],
  ['backend/routes/courseStudio.js', /courses\/:id\/wizard/],
  ['backend/lib/courseStudioHelpers.js', /buildCourseQualityChecklist/],
  ['backend/lib/courseStudioHelpers.js', /buildRevenueProjections/],
];

function main() {
  console.log('=== Course Marketplace Phase 15 Check ===\n');
  for (const [rel, pattern] of checks) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (!pattern.test(text)) throw new Error(`Missing Phase 15: ${rel}`);
    console.log('✓', rel);
  }

  const sampleChecklist = buildCourseQualityChecklist(
    { title: 'X', priceThb: 99, duration: 20, imageUrl: 'u', learningOutcomes: ['a', 'b'] },
    [
      { isPreview: true, sectionId: 's', durationMin: 10 },
      { isPreview: false, sectionId: 's', durationMin: 10 },
    ],
    { headline: 'Coach' },
  );
  const projections = buildRevenueProjections({ instructorNet: 70 });
  console.log('\nChecklist ready (sample):', sampleChecklist.ready);
  console.log('Revenue @10 sales:', projections[0]?.instructorNet);
  console.log('\nPhase 15: PASS');
  console.log('Note: lesson resource files use URL field; thumbnail/promo upload via /api/upload/*');
}

main();
