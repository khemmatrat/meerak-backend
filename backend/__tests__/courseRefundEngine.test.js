import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePayoutReleaseAt,
  evaluateCourseRefundEligibility,
  normalizeCourseRefundPolicy,
  normalizeCoursePayoutPolicy,
} from '../lib/courseRefundEngine.js';

test('normalizeCourseRefundPolicy clamps values', () => {
  const policy = normalizeCourseRefundPolicy({ guaranteeDays: 999, maxProgressPct: -5 });
  assert.equal(policy.guaranteeDays, 90);
  assert.equal(policy.maxProgressPct, 20);
});

test('refund eligible within guarantee and low progress', () => {
  const now = Date.parse('2026-06-10T12:00:00Z');
  const order = { status: 'completed', refund_status: 'none', created_at: '2026-06-08T12:00:00Z' };
  const enrollment = { progress_pct: 10 };
  const result = evaluateCourseRefundEligibility({ order, enrollment, now });
  assert.equal(result.eligible, true);
  assert.equal(result.code, 'eligible');
});

test('refund denied when progress exceeds threshold', () => {
  const now = Date.parse('2026-06-10T12:00:00Z');
  const order = { status: 'completed', refund_status: 'none', created_at: '2026-06-09T12:00:00Z' };
  const enrollment = { progress_pct: 25 };
  const result = evaluateCourseRefundEligibility({ order, enrollment, now });
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'progress_exceeded');
});

test('refund denied after guarantee window', () => {
  const now = Date.parse('2026-06-20T12:00:00Z');
  const order = { status: 'completed', refund_status: 'none', created_at: '2026-06-01T12:00:00Z' };
  const result = evaluateCourseRefundEligibility({ order, enrollment: { progress_pct: 0 }, now });
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'guarantee_expired');
});

test('admin override bypasses guarantee and progress', () => {
  const now = Date.parse('2026-06-20T12:00:00Z');
  const order = { status: 'completed', refund_status: 'none', created_at: '2026-06-01T12:00:00Z' };
  const result = evaluateCourseRefundEligibility({
    order,
    enrollment: { progress_pct: 80 },
    now,
    adminOverride: true,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.code, 'admin_override');
});

test('computePayoutReleaseAt respects hold days', () => {
  const purchasedAt = '2026-06-01T00:00:00Z';
  const releaseAt = computePayoutReleaseAt(purchasedAt, normalizeCoursePayoutPolicy({ holdDays: 7 }));
  assert.equal(releaseAt.toISOString(), '2026-06-08T00:00:00.000Z');
});
