import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCourseConversionAdjustments,
  normalizeCourseConversionPolicy,
} from '../lib/courseFeeEngine.js';
import {
  anonymizeBuyerName,
  computeLimitedSeatsOffer,
} from '../lib/courseConversionService.js';

test('anonymizeBuyerName masks Thai names', () => {
  assert.equal(anonymizeBuyerName('สมชาย ใจดี'), 'สมชาย ใ.');
  assert.equal(anonymizeBuyerName(''), 'ผู้เรียน');
});

test('computeLimitedSeatsOffer returns urgency label', () => {
  const offer = computeLimitedSeatsOffer(12, 50);
  assert.ok(offer.seatsRemaining >= 3);
  assert.match(offer.urgencyLabel, /เหลือ \d+ ที่นั่ง/);
});

test('normalizeCourseConversionPolicy clamps values', () => {
  const policy = normalizeCourseConversionPolicy({
    firstPurchaseDiscountRate: 2,
    firstPurchaseBonusPoints: -5,
    limitedSeatsBase: 3,
  });
  assert.equal(policy.firstPurchaseDiscountRate, 0.05);
  assert.equal(policy.firstPurchaseBonusPoints, 50);
  assert.equal(policy.limitedSeatsBase, 50);
});

test('applyCourseConversionAdjustments stacks coupon and first purchase', () => {
  const base = {
    currency: 'THB',
    listPrice: 1000,
    anchorPrice: 1500,
    discountRate: 0,
    grossAmount: 1000,
    platformRate: 0.35,
    platformFee: 350,
    instructorNet: 650,
    savingsAmount: 500,
  };
  const adjusted = applyCourseConversionAdjustments(base, {
    couponDiscountRate: 0.1,
    firstPurchaseDiscountRate: 0.05,
    voucherDiscountThb: 50,
    platformRate: 0.35,
  });
  assert.equal(adjusted.grossAmount, 805);
  assert.equal(adjusted.conversionApplied, true);
  assert.ok(adjusted.platformFee < 350);
});

test('applyCourseConversionAdjustments with no extras keeps quote', () => {
  const base = {
    grossAmount: 500,
    anchorPrice: 500,
    platformRate: 0.35,
    platformFee: 175,
    instructorNet: 325,
  };
  const adjusted = applyCourseConversionAdjustments(base, { platformRate: 0.35 });
  assert.equal(adjusted.grossAmount, 500);
  assert.equal(adjusted.conversionApplied, false);
});
