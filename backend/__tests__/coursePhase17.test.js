/**
 * Phase 17 — refund policy, ledger events, tax docs, payout lifecycle, platform revenue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  computePayoutReleaseAt,
  evaluateCourseRefundEligibility,
  normalizeCoursePayoutPolicy,
  normalizeCourseRefundPolicy,
} from '../lib/courseRefundEngine.js';
import { pickPrimaryTaxDocument } from '../lib/courseOrderTaxDocuments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

test('refund policy defaults: 7-day guarantee, 20% progress cap, admin override', () => {
  const policy = normalizeCourseRefundPolicy({});
  assert.equal(policy.guaranteeDays, 7);
  assert.equal(policy.maxProgressPct, 20);
  assert.equal(policy.allowAdminOverride, true);
});

test('payout policy defines hold window and withdrawable release', () => {
  const policy = normalizeCoursePayoutPolicy({ holdDays: 14, releaseToWithdrawable: true });
  assert.equal(policy.holdDays, 14);
  assert.equal(policy.releaseToWithdrawable, true);
  assert.equal(policy.blockOnRefund, true);
  const releaseAt = computePayoutReleaseAt('2026-06-01T00:00:00Z', policy);
  assert.equal(releaseAt.toISOString(), '2026-06-15T00:00:00.000Z');
});

test('admin override bypasses guarantee and progress limits', () => {
  const result = evaluateCourseRefundEligibility({
    order: { status: 'completed', refund_status: 'none', created_at: '2026-01-01T00:00:00Z' },
    enrollment: { progress_pct: 90 },
    now: Date.parse('2026-06-20T00:00:00Z'),
    adminOverride: true,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.code, 'admin_override');
});

test('pickPrimaryTaxDocument prefers buyer receipt for buyer view', () => {
  const doc = pickPrimaryTaxDocument(
    {
      ok: true,
      documents: [
        { id: '1', documentType: 'receipt', status: 'issued', purpose: 'buyer_receipt', downloadable: true },
        { id: '2', documentType: 'tax_invoice', status: 'issued', purpose: 'platform_fee_invoice', downloadable: true },
      ],
    },
    { viewerRole: 'buyer' },
  );
  assert.equal(doc?.id, '1');
});

test('Phase 17 payment hardening artifacts exist', () => {
  const refundSvc = readFileSync(join(root, 'backend', 'lib', 'courseRefundService.js'), 'utf8');
  assert.match(refundSvc, /'course_refund'/);
  assert.match(refundSvc, /course_commission/);
  assert.match(refundSvc, /INSERT INTO course_refunds/);

  const payoutSvc = readFileSync(join(root, 'backend', 'lib', 'coursePayoutService.js'), 'utf8');
  assert.match(payoutSvc, /course_instructor_payout/);
  assert.match(payoutSvc, /wallet_pending/);
  assert.match(payoutSvc, /payout_status = 'blocked'/);

  const fiscal = readFileSync(join(root, 'backend', 'lib', 'courseFiscalService.js'), 'utf8');
  assert.match(fiscal, /course_commission/);

  const routes = readFileSync(join(root, 'backend', 'routes', 'courseMarketplace.js'), 'utf8');
  assert.match(routes, /\/api\/courses\/orders\/:orderId\/refund/);
  assert.match(routes, /\/api\/admin\/courses\/orders\/:orderId\/refund/);
  assert.match(routes, /\/api\/admin\/courses\/revenue/);
  assert.match(routes, /tax-documents/);

  const receipt = readFileSync(join(root, 'mobile', 'pages', 'CourseOrderReceipt.tsx'), 'utf8');
  assert.match(receipt, /requestCourseRefund/);
  assert.match(receipt, /getCourseRefundEligibility/);

  const migration = readFileSync(
    join(root, 'backend', 'db', 'migrations', '237_course_marketplace_phase17.sql'),
    'utf8',
  );
  assert.match(migration, /course_refund_policy/);
  assert.match(migration, /course_payout_policy/);
  assert.match(migration, /course_refunds/);
});
