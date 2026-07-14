import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCoursePurchaseGate,
  canAffordWalletPurchase,
  COURSE_PURCHASE_SELF_DENIED_CODE,
} from '../lib/coursePurchaseService.js';
import { computeInstallmentPlan, buildInstallmentSchedule } from '../lib/courseInstallmentEngine.js';
import { hashPurchaseRequest } from '../lib/coursePurchaseIdempotency.js';
import { buildPurchaseSocialProof } from '../lib/coursePurchaseReceiptNotifier.js';

test('evaluateCoursePurchaseGate blocks self-purchase but allows gift', () => {
  const buyer = '11111111-1111-1111-1111-111111111111';
  const blocked = evaluateCoursePurchaseGate(
    { is_marketplace: true, status: 'published', instructor_user_id: buyer },
    buyer,
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, COURSE_PURCHASE_SELF_DENIED_CODE);

  const gift = evaluateCoursePurchaseGate(
    { is_marketplace: true, status: 'published', instructor_user_id: buyer },
    buyer,
    { isGift: true },
  );
  assert.equal(gift.ok, true);
});

test('canAffordWalletPurchase handles free courses', () => {
  assert.equal(canAffordWalletPurchase(0, 0), true);
});

test('computeInstallmentPlan splits wallet down and credit line', () => {
  const plan = computeInstallmentPlan({
    grossAmount: 1000,
    walletBalance: 200,
    creditLineLimit: 5000,
    creditLineUsed: 0,
    policy: { installment: { minGrossThb: 300, installmentCount: 3, downPaymentRate: 0.34 } },
  });
  assert.equal(plan.eligible, true);
  assert.equal(plan.walletDown, 200);
  assert.equal(plan.creditPrincipal, 800);
  assert.equal(plan.installmentCount, 3);
});

test('buildInstallmentSchedule creates due dates', () => {
  const rows = buildInstallmentSchedule(900, 3, new Date('2026-01-01T00:00:00Z'));
  assert.equal(rows.length, 3);
  assert.ok(rows[0].dueAt);
});

test('hashPurchaseRequest is stable for same payload', () => {
  const a = hashPurchaseRequest({ paymentMode: 'installment', recipientUserId: 'x' });
  const b = hashPurchaseRequest({ paymentMode: 'installment', recipientUserId: 'x' });
  assert.equal(a, b);
});

test('buildPurchaseSocialProof formats Thai message', () => {
  assert.match(buildPurchaseSocialProof(3)?.message || '', /คนที่ 3/);
});
