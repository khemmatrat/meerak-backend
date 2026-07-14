/**
 * Phase 16 — buyer conversion & trust layer artifacts + conversion helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { anonymizeBuyerName, computeLimitedSeatsOffer } from '../lib/courseConversionService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

test('conversion social proof helpers work', () => {
  assert.equal(anonymizeBuyerName('สมหญิง รักเรียน'), 'สมหญิง ร.');
  const seats = computeLimitedSeatsOffer(40, 50);
  assert.ok(seats.seatsRemaining >= 3);
  assert.match(seats.urgencyLabel, /เหลือ/);
});

test('Phase 16 trust + wallet UX artifacts exist', () => {
  const detail = readFileSync(join(root, 'mobile', 'pages', 'CourseDetailMarketplace.tsx'), 'utf8');
  assert.match(detail, /guaranteeDays|การันตีคืนเงิน/);
  assert.match(detail, /ratingDistribution|RatingBars/);
  assert.match(detail, /BadgePill/);
  assert.match(detail, /savePendingCoursePurchase/);
  assert.match(detail, /CoursePurchaseSheet/);
  assert.match(detail, /shortfall/);
  assert.match(detail, /socialProof|providerSocialProof/);
  assert.match(detail, /getCourseRecommendations/);

  const marketplace = readFileSync(join(root, 'mobile', 'pages', 'CourseMarketplace.tsx'), 'utf8');
  assert.match(marketplace, /trendingCourses|bestsellerCourses|coachRecommended/);

  const pending = readFileSync(join(root, 'mobile', 'utils', 'coursePurchasePending.ts'), 'utf8');
  assert.match(pending, /TOPUP_HINT_KEY/);
  assert.match(pending, /consumeTopUpHintAmount/);

  const routes = readFileSync(join(root, 'backend', 'routes', 'courseMarketplace.js'), 'utf8');
  assert.match(routes, /computeCourseBadges/);
  assert.match(routes, /buildTrustMeta/);
  assert.match(routes, /\/api\/courses\/marketplace\/:id\/recommendations/);
});
