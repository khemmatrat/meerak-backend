import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUserEligibleToSellCourses,
  COURSE_SELL_DENIED_CODE,
  COURSE_SELL_DENIED_MESSAGE,
} from '../lib/courseSellEligibility.js';

test('isUserEligibleToSellCourses respects can_sell_courses flag', () => {
  assert.equal(isUserEligibleToSellCourses({ can_sell_courses: true }), true);
  assert.equal(isUserEligibleToSellCourses({ can_sell_courses: false }), false);
});

test('isUserEligibleToSellCourses allows VERIFIED_PROVIDER', () => {
  assert.equal(
    isUserEligibleToSellCourses({ provider_status: 'VERIFIED_PROVIDER', can_sell_courses: false }),
    true,
  );
});

test('isUserEligibleToSellCourses allows verified KYC statuses', () => {
  assert.equal(isUserEligibleToSellCourses({ kyc_status: 'verified' }), true);
  assert.equal(isUserEligibleToSellCourses({ kyc_status: 'approved' }), true);
  assert.equal(isUserEligibleToSellCourses({ kyc_status: 'ai_verified' }), true);
  assert.equal(isUserEligibleToSellCourses({ kyc_status: 'pending' }), false);
});

test('isUserEligibleToSellCourses allows completed onboarding', () => {
  assert.equal(isUserEligibleToSellCourses({ onboarding_status: 'TRAINING_COMPLETE' }), true);
  assert.equal(isUserEligibleToSellCourses({ onboarding_status: 'QUALIFIED' }), true);
  assert.equal(isUserEligibleToSellCourses({ onboarding_status: 'NOT_STARTED' }), false);
});

test('isUserEligibleToSellCourses allows Apple Demo employer accounts', () => {
  assert.equal(
    isUserEligibleToSellCourses({
      firebase_uid: 'apple-demo-employer',
      full_name: 'Demo Employer (Apple Review)',
      can_sell_courses: false,
    }),
    true,
  );
});

test('isUserEligibleToSellCourses allows Apple Demo by test phone', () => {
  assert.equal(
    isUserEligibleToSellCourses({ phone: '0812345601', can_sell_courses: false }),
    true,
  );
});

test('denied constants are stable for API responses', () => {
  assert.equal(COURSE_SELL_DENIED_CODE, 'COURSE_SELL_NOT_ELIGIBLE');
  assert.match(COURSE_SELL_DENIED_MESSAGE, /Verified Provider|KYC/);
});
