import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadInstructorCourseEarnings,
  loadInstructorDashboard,
  loadInstructorOrderSummary,
  loadInstructorPayoutForecast,
  loadInstructorWalletSnapshot,
} from '../lib/courseInstructorEarnings.js';
import { loadBuyerCourseOrders } from '../lib/courseBuyerOrders.js';
import { pickPrimaryTaxDocument } from '../lib/courseOrderTaxDocuments.js';
import { releaseEligibleCoursePayouts } from '../lib/coursePayoutService.js';
import { isFiscalDocumentPdfReady } from '../lib/fiscalDocumentPdf.js';
import { generateCourseOrderReceiptPdf } from '../lib/courseReceiptPdf.js';

test('loadInstructorWalletSnapshot maps wallet columns', async () => {
  const pool = {
    query: async () => ({
      rows: [{
        wallet_pending: '120.50',
        wallet_balance: '500',
        wallet_balance_withdrawable: '380.25',
      }],
    }),
  };
  const wallet = await loadInstructorWalletSnapshot(pool, 'u1');
  assert.equal(wallet.pending, 120.5);
  assert.equal(wallet.balance, 500);
  assert.equal(wallet.withdrawable, 380.25);
});

test('loadInstructorOrderSummary aggregates payout counters', async () => {
  const pool = {
    query: async () => ({
      rows: [{
        orders: 3,
        gross: '3000',
        platform_fee: '900',
        instructor_net: '2100',
        gross_today: '500',
        gross_month: '3000',
        instructor_net_today: '350',
        instructor_net_month: '2100',
        payouts_pending: 1,
        payouts_released: 2,
        payouts_blocked: 0,
        pending_net: '700',
        released_net: '1400',
      }],
    }),
  };
  const summary = await loadInstructorOrderSummary(pool, 'u1');
  assert.equal(summary.orders, 3);
  assert.equal(summary.platform_fee, 900);
  assert.equal(summary.payouts_pending, 1);
  assert.equal(summary.pending_net, 700);
});

test('loadInstructorCourseEarnings bundles wallet summary and recent rows', async () => {
  const pool = {
    query: async (sql) => {
      if (String(sql).includes('wallet_pending')) {
        return { rows: [{ wallet_pending: 0, wallet_balance: 100, wallet_balance_withdrawable: 100 }] };
      }
      if (String(sql).includes('COUNT(*)::int AS orders')) {
        return { rows: [{ orders: 1, gross: 100, platform_fee: 35, instructor_net: 65 }] };
      }
      if (String(sql).includes('FROM course_purchase_orders o')) {
        return { rows: [{ id: 'o1', course_title: 'Demo', gross_amount: 100 }] };
      }
      return { rows: [] };
    },
  };
  const data = await loadInstructorCourseEarnings(pool, 'u1', { recentLimit: 5 });
  assert.equal(data.wallet.withdrawable, 100);
  assert.equal(data.summary.orders, 1);
  assert.equal(data.recentRows.length, 1);
});

test('releaseEligibleCoursePayouts returns empty when no eligible orders', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push(String(sql));
      if (String(sql).includes('payout_config')) return { rows: [{ value_json: { releaseToWithdrawable: true } }] };
      if (String(sql).includes('FOR UPDATE SKIP LOCKED')) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await releaseEligibleCoursePayouts(client, { limit: 10, actorId: 'test' });
  assert.equal(result.count, 0);
  assert.deepEqual(result.released, []);
  assert.ok(calls.some((sql) => sql.includes('payout_status = \'held\'')));
});

test('releaseEligibleCoursePayouts moves pending to withdrawable', async () => {
  const updates = [];
  const client = {
    query: async (sql, params) => {
      const s = String(sql);
      if (s.includes('payout_config')) return { rows: [{ value_json: { releaseToWithdrawable: true, applyProviderWht: false } }] };
      if (s.includes('FOR UPDATE SKIP LOCKED')) {
        return {
          rows: [{
            id: 'order-1',
            course_id: 'c1',
            instructor_user_id: 'inst-1',
            instructor_net: 650,
            platform_fee: 350,
            gross_amount: 1000,
          }],
        };
      }
      if (s.includes('SELECT id FROM payment_ledger_audit WHERE id')) return { rows: [] };
      if (s.includes('FROM users WHERE id')) {
        return { rows: [{ id: 'inst-1', wallet_pending: 650, wallet_balance: 0, wallet_balance_withdrawable: 0 }] };
      }
      if (s.startsWith('UPDATE users SET')) updates.push({ sql: s, params });
      if (s.startsWith('INSERT INTO payment_ledger_audit')) return { rows: [] };
      if (s.startsWith('UPDATE course_purchase_orders')) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await releaseEligibleCoursePayouts(client, { limit: 5, actorId: 'test' });
  assert.equal(result.count, 1);
  assert.equal(result.released[0].amount, 650);
  assert.ok(updates.some((u) => u.sql.includes('wallet_balance_withdrawable')));
});

test('loadInstructorPayoutForecast returns release schedule fields', async () => {
  const pool = {
    query: async () => ({
      rows: [{
        next_release_at: '2026-06-20T00:00:00Z',
        next_future_release_at: '2026-06-21T00:00:00Z',
        releasable_now_net: '500',
        held_until_future_net: '200',
        held_orders: 2,
      }],
    }),
  };
  const forecast = await loadInstructorPayoutForecast(pool, 'u1');
  assert.equal(forecast.releasableNowNet, 500);
  assert.equal(forecast.heldOrders, 2);
});

test('loadBuyerCourseOrders returns paginated buyer history', async () => {
  const pool = {
    query: async (sql) => {
      if (String(sql).includes('COUNT(*)')) return { rows: [{ total: 1 }] };
      return { rows: [{ id: 'o1', course_title: 'Demo', gross_amount: 100 }] };
    },
  };
  const data = await loadBuyerCourseOrders(pool, 'b1', { limit: 10, offset: 0 });
  assert.equal(data.total, 1);
  assert.equal(data.rows.length, 1);
});

test('generateCourseOrderReceiptPdf returns pdf buffer', async () => {
  const pdf = await generateCourseOrderReceiptPdf({
    id: 'o1',
    orderId: 'o1',
    receiptNo: 'R-001',
    status: 'completed',
    gateway: 'wallet',
    grossAmount: 1000,
    platformFee: 350,
    instructorNet: 650,
    course: { id: 'c1', title: 'Demo Course' },
    buyer: { id: 'b1', name: 'Buyer' },
    instructor: { id: 'i1', name: 'Instructor' },
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 100);
});

test('loadInstructorDashboard includes forecast and top courses', async () => {
  const pool = {
    query: async (sql) => {
      const s = String(sql);
      if (s.includes('wallet_pending')) return { rows: [{ wallet_pending: 0, wallet_balance: 0, wallet_balance_withdrawable: 0 }] };
      if (s.includes('COUNT(*)::int AS orders')) return { rows: [{ orders: 0 }] };
      if (s.includes('next_release_at')) return { rows: [{ held_orders: 0 }] };
      if (s.includes('GROUP BY o.course_id')) return { rows: [] };
      if (s.includes('FROM course_purchase_orders o')) return { rows: [] };
      return { rows: [] };
    },
  };
  const data = await loadInstructorDashboard(pool, 'u1');
  assert.ok(data.forecast);
  assert.ok(Array.isArray(data.topCourses));
});

test('pickPrimaryTaxDocument prefers issued WHT cert for instructor', () => {
  const payload = {
    documents: [
      { id: '1', purpose: 'instructor_earning_statement', downloadable: false, status: 'draft' },
      { id: '2', purpose: 'wht_certificate', downloadable: true, status: 'issued' },
    ],
  };
  const doc = pickPrimaryTaxDocument(payload, { viewerRole: 'instructor' });
  assert.equal(doc?.id, '2');
});

test('providerWhtEligibility requires verified tax profile for course instructors', () => {
  const blocked = providerWhtEligibility(null);
  assert.equal(blocked.eligible, false);
  const ok = providerWhtEligibility({
    legal_name: 'Instructor',
    tax_id: '1234567890123',
    registered_address: 'Bangkok',
    tax_entity_type: 'individual',
    verified_status: 'verified',
  });
  assert.equal(ok.eligible, true);
});

test('isFiscalDocumentPdfReady accepts issued status', () => {
  assert.equal(isFiscalDocumentPdfReady({ status: 'issued' }), true);
  assert.equal(isFiscalDocumentPdfReady({ status: 'draft' }), false);
});
