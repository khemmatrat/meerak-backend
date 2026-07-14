import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCoursePurchaseQuote,
  normalizeCourseRevenuePolicy,
} from '../lib/courseFeeEngine.js';

test('courseFeeEngine computes default Udemy-style split', () => {
  const quote = computeCoursePurchaseQuote({ priceThb: 1000, originalPriceThb: 2000 });
  assert.equal(quote.grossAmount, 1000);
  assert.equal(quote.platformRate, 0.35);
  assert.equal(quote.platformFee, 350);
  assert.equal(quote.instructorNet, 650);
  assert.equal(quote.savingsAmount, 1000);
});

test('courseFeeEngine applies coach-direct discount and lower platform rate', () => {
  const quote = computeCoursePurchaseQuote({
    priceThb: 1000,
    originalPriceThb: 1000,
    isCoachDirect: true,
  });
  assert.equal(quote.grossAmount, 900);
  assert.equal(quote.platformRate, 0.25);
  assert.equal(quote.platformFee, 225);
  assert.equal(quote.instructorNet, 675);
});

test('normalizeCourseRevenuePolicy clamps invalid rates', () => {
  const policy = normalizeCourseRevenuePolicy({
    platformRate: 2,
    coachDirectDiscountRate: -1,
    coachDirectPlatformRate: 1.2,
  });
  assert.equal(policy.platformRate, 0.35);
  assert.equal(policy.coachDirectDiscountRate, 0.1);
  assert.equal(policy.coachDirectPlatformRate, 0.25);
});
