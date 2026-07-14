import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoursePurchaseGatewayMetadata } from '../lib/coursePurchaseGateway.js';
import { coursePurchaseHandler } from '../lib/paymentBusinessActions/coursePurchaseHandler.js';
import { resolveHandler } from '../lib/paymentBusinessActions/index.js';

test('buildCoursePurchaseGatewayMetadata sets purpose course_purchase', () => {
  const meta = buildCoursePurchaseGatewayMetadata({
    courseId: 'course-abc',
    buyerId: '11111111-1111-1111-1111-111111111111',
    chargeId: '123456789012',
    paymentChannel: 'promptpay',
  });
  assert.equal(meta.purpose, 'course_purchase');
  assert.equal(meta.course_id, 'course-abc');
  assert.equal(meta.charge_id, '123456789012');
  assert.equal(meta.meerak_user_id, '11111111-1111-1111-1111-111111111111');
});

test('resolveHandler finds course_purchase handler', () => {
  const h = resolveHandler('course_purchase');
  assert.ok(h);
  assert.equal(typeof h.validate, 'function');
  assert.equal(typeof h.execute, 'function');
});

test('coursePurchaseHandler validate rejects missing charge', async () => {
  const v = await coursePurchaseHandler.validate(
    {
      amount_minor: 99000,
      metadata: {
        purpose: 'course_purchase',
        course_id: 'c1',
        user_id: 'u1',
      },
    },
    {},
  );
  assert.equal(v.ok, false);
  assert.equal(v.failure_code, 'course_purchase_missing_charge');
});

test('coursePurchaseHandler validate accepts gateway payment row', async () => {
  const v = await coursePurchaseHandler.validate(
    {
      amount_minor: 49900,
      external_ref: 'chg-001',
      metadata: {
        purpose: 'course_purchase',
        course_id: 'course-x',
        user_id: '22222222-2222-2222-2222-222222222222',
        charge_id: 'chg-001',
      },
    },
    { payment_id: 'chg-001' },
  );
  assert.equal(v.ok, true);
  assert.equal(v.chargeId, 'chg-001');
});

test('coursePurchaseHandler validate rejects wrong purpose', async () => {
  const v = await coursePurchaseHandler.validate(
    {
      amount_minor: 10000,
      metadata: { purpose: 'wallet_topup', course_id: 'c1', charge_id: 'x', user_id: 'u1' },
    },
    {},
  );
  assert.equal(v.ok, false);
  assert.equal(v.failure_code, 'course_purchase_wrong_purpose');
});
