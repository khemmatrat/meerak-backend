/**
 * Phase 12 — unit tests: security, idempotency, fee engine, playback signatures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditCoursePublicPayload,
  evaluateCoursePurchaseGate,
  evaluateCourseRefundEligibility,
  COURSE_SECURITY_CONTROLS,
} from '../lib/courseMarketplaceSecurity.js';
import {
  redactLessonForViewer,
  signPlaybackPayload,
  verifyPlaybackSignature,
} from '../lib/courseLessonPlayback.js';
import { hashPurchaseRequest } from '../lib/coursePurchaseIdempotency.js';
import { computeCoursePurchaseQuote } from '../lib/courseFeeEngine.js';
import { parseIntegrityResult } from '../lib/courseLedgerIntegrity.js';

test('COURSE_SECURITY_CONTROLS documents Phase 12 focus areas', () => {
  assert.ok(COURSE_SECURITY_CONTROLS.length >= 5);
  assert.ok(COURSE_SECURITY_CONTROLS.some((c) => c.id === 'playback_gated'));
  assert.ok(COURSE_SECURITY_CONTROLS.some((c) => c.id === 'refund_abuse'));
});

test('auditCoursePublicPayload detects leaked video URLs', () => {
  const bad = auditCoursePublicPayload({
    lessons: [{ id: 'l1', videoUrl: 'https://youtube.com/watch?v=abc', isPreview: true }],
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.issues[0].issue, 'video_url_leaked');

  const good = auditCoursePublicPayload({
    lessons: [{ id: 'l1', hasVideo: true, isPreview: true }],
  });
  assert.equal(good.ok, true);
});

test('redactLessonForViewer strips videoUrl from catalog JSON', () => {
  const out = redactLessonForViewer(
    { id: 'x', video_url: 'https://example.com/v.mp4', title: 'T' },
    { allowVideoUrl: false },
  );
  assert.equal(out.videoUrl, undefined);
  assert.equal(out.hasVideo, true);
});

test('playback token rejects tampered signature', () => {
  const token = signPlaybackPayload({ lessonId: 'l1', exp: new Date().toISOString() }, 'secret');
  const tampered = token.replace(/.$/, token.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyPlaybackSignature(tampered, 'secret'), null);
  assert.ok(verifyPlaybackSignature(token, 'secret'));
});

test('hashPurchaseRequest differs when payment mode changes', () => {
  const a = hashPurchaseRequest({ paymentMode: 'wallet' });
  const b = hashPurchaseRequest({ paymentMode: 'installment', installmentCount: 3 });
  assert.notEqual(a, b);
});

test('evaluateCourseRefundEligibility blocks high progress refund abuse', () => {
  const r = evaluateCourseRefundEligibility({
    order: { status: 'completed', created_at: new Date(), refund_status: 'none' },
    enrollment: { progress_pct: 55 },
    policy: { guaranteeDays: 7, maxProgressPct: 20 },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.code, 'progress_exceeded');
});

test('evaluateCoursePurchaseGate blocks instructor self-buy', () => {
  const buyer = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const g = evaluateCoursePurchaseGate(
    { is_marketplace: true, status: 'published', instructor_user_id: buyer },
    buyer,
  );
  assert.equal(g.ok, false);
});

test('courseFeeEngine purchase quote is stable for regression', () => {
  const q = computeCoursePurchaseQuote({ priceThb: 799, originalPriceThb: 999 });
  assert.equal(q.grossAmount, 799);
  assert.equal(q.platformFee, 279.65);
});

test('parseIntegrityResult handles JSONB object', () => {
  const p = parseIntegrityResult({ valid: true, total_rows: 42 });
  assert.equal(p.valid, true);
  assert.equal(p.totalRows, 42);
});
