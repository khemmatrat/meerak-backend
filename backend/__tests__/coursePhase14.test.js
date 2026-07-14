/**
 * Phase 14 — receipts + instructor sales dashboard verification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInstructorDashboardResponse } from '../lib/courseInstructorEarnings.js';
import { generateCourseOrderReceiptPdf } from '../lib/courseReceiptPdf.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function mockMapReceipt(row) {
  return {
    orderId: row.id,
    receiptNo: row.bill_no || `COURSE-${String(row.id).slice(0, 8)}`,
    grossAmount: Number(row.gross_amount || 0),
    platformFee: Number(row.platform_fee || 0),
    instructorNet: Number(row.instructor_net || 0),
    ledgerId: row.ledger_id || null,
    course: { id: row.course_id, title: row.course_title || 'Course' },
    buyer: { id: row.user_id, name: row.buyer_name || 'Buyer' },
    instructor: { id: row.instructor_user_id, name: row.instructor_name || 'Instructor' },
    createdAt: row.created_at,
  };
}

test('mapInstructorDashboardResponse exposes sales summary + recent orders', () => {
  const payload = mapInstructorDashboardResponse(
    {
      summary: {
        orders: 2,
        gross: 998,
        platform_fee: 299,
        instructor_net: 699,
        gross_today: 499,
        gross_month: 998,
        instructor_net_today: 350,
        instructor_net_month: 699,
      },
      wallet: { pending: 350, balance: 700, withdrawable: 350 },
      forecast: { releasableNowNet: 350, heldOrders: 1 },
      topCourses: [{ course_id: 'c1', title: 'Demo', orders: 2, gross: 998, instructor_net: 699 }],
      recentRows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          course_id: 'c1',
          course_title: 'Demo Course',
          user_id: '22222222-2222-2222-2222-222222222222',
          instructor_user_id: '33333333-3333-3333-3333-333333333333',
          gross_amount: 499,
          platform_fee: 150,
          instructor_net: 349,
          ledger_id: '44444444-4444-4444-4444-444444444444',
          buyer_name: 'Buyer A',
          instructor_name: 'Instructor B',
          created_at: '2026-06-17T00:00:00.000Z',
        },
      ],
    },
    mockMapReceipt,
  );

  assert.equal(payload.summary.orders, 2);
  assert.equal(payload.summary.gross_today, 499);
  assert.ok(Array.isArray(payload.recent));
  assert.equal(payload.recent[0].grossAmount, 499);
  assert.equal(payload.recent[0].ledgerId, '44444444-4444-4444-4444-444444444444');
  assert.equal(payload.topCourses[0].title, 'Demo');
});

test('generateCourseOrderReceiptPdf produces buyer and seller views', async () => {
  const receipt = {
    orderId: '11111111-1111-1111-1111-111111111111',
    receiptNo: 'COURSE-11111111',
    grossAmount: 499,
    platformFee: 150,
    instructorNet: 349,
    currency: 'THB',
    createdAt: '2026-06-17T00:00:00.000Z',
    course: { title: 'Demo Course' },
    buyer: { name: 'Buyer A' },
    instructor: { name: 'Instructor B' },
  };
  const buyerPdf = await generateCourseOrderReceiptPdf(receipt, { view: 'buyer' });
  const sellerPdf = await generateCourseOrderReceiptPdf(receipt, { view: 'instructor' });
  assert.ok(Buffer.isBuffer(buyerPdf));
  assert.ok(Buffer.isBuffer(sellerPdf));
  assert.ok(buyerPdf.length > 100);
  assert.ok(sellerPdf.length > 100);
});

test('Phase 14 mobile + API artifacts exist', () => {
  const appTsx = readFileSync(join(root, 'mobile', 'App.tsx'), 'utf8');
  assert.match(appTsx, /CourseOrderReceipt/);
  assert.match(appTsx, /InstructorCourseSales/);
  assert.match(appTsx, /\/courses\/orders\/:orderId\/receipt/);
  assert.match(appTsx, /\/course-studio\/sales/);

  const routes = readFileSync(join(root, 'backend', 'routes', 'courseMarketplace.js'), 'utf8');
  assert.match(routes, /\/api\/courses\/orders\/:orderId\/receipt/);
  assert.match(routes, /\/api\/instructor\/sales/);
  assert.match(routes, /mapCourseOrderReceipt/);
});
