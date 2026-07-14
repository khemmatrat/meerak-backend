#!/usr/bin/env node
/**
 * Phase 16 check — trust signals, badges, wallet top-up UX, recommendation rails.
 * Usage: node scripts/run-course-phase16-check.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const checks = [
  ['mobile/pages/CourseDetailMarketplace.tsx', /CoursePurchaseSheet/],
  ['mobile/pages/CourseDetailMarketplace.tsx', /savePendingCoursePurchase/],
  ['mobile/utils/coursePurchasePending.ts', /consumeTopUpHintAmount/],
  ['mobile/pages/CourseMarketplace.tsx', /trendingCourses/],
  ['mobile/components/courseMarketplace/CoursePurchaseSheet.tsx', /onTopUp/],
  ['backend/routes/courseMarketplace.js', /buildTrustMeta/],
  ['backend/routes/courseMarketplace.js', /marketplace\/:id\/recommendations/],
];

function main() {
  console.log('=== Course Marketplace Phase 16 Check ===\n');
  for (const [rel, pattern] of checks) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (!pattern.test(text)) throw new Error(`Missing Phase 16: ${rel}`);
    console.log('✓', rel);
  }
  console.log('\nPhase 16: PASS');
}

main();
