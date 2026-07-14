#!/usr/bin/env node
/**
 * Phase 14 check — buyer/seller receipts + instructor sales dashboard.
 * Usage: node scripts/run-course-phase14-check.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mapInstructorDashboardResponse } from '../lib/courseInstructorEarnings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

function checkArtifacts() {
  const root = join(__dirname, '..', '..');
  const checks = [
    ['backend/routes/courseMarketplace.js', /\/api\/courses\/orders\/:orderId\/receipt/],
    ['backend/lib/courseReceiptPdf.js', /generateCourseOrderReceiptPdf/],
    ['mobile/pages/CourseOrderReceipt.tsx', /getCourseOrderReceipt/],
    ['mobile/pages/InstructorCourseSales.tsx', /getInstructorSalesDashboard/],
    ['mobile/pages/CourseStudio.tsx', /\/course-studio\/sales/],
  ];
  for (const [rel, pattern] of checks) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (!pattern.test(text)) throw new Error(`Missing Phase 14 artifact in ${rel}`);
  }
  return checks.map(([rel]) => rel);
}

async function main() {
  console.log('=== Course Marketplace Phase 14 Check ===\n');

  const artifacts = checkArtifacts();
  console.log('Artifacts OK:', artifacts.join(', '));

  const table = await pool.query(
    `SELECT to_regclass('public.course_purchase_orders') IS NOT NULL AS orders_ready`,
  );
  const ordersReady = !!table.rows?.[0]?.orders_ready;
  console.log('course_purchase_orders table:', ordersReady ? 'ready' : 'MISSING');

  const orderCount = await pool.query(
    `SELECT COUNT(*)::int AS n FROM course_purchase_orders WHERE status = 'completed'`,
  );
  const completedOrders = Number(orderCount.rows?.[0]?.n || 0);
  console.log('Completed orders (for live receipt demo):', completedOrders);

  const sample = mapInstructorDashboardResponse(
    {
      summary: { orders: 0, gross: 0, platform_fee: 0, instructor_net: 0 },
      wallet: { pending: 0, balance: 0, withdrawable: 0 },
      forecast: {},
      topCourses: [],
      recentRows: [],
    },
    (row) => ({ orderId: row.id }),
  );
  assertShape(sample);

  console.log('\nPhase 14 structure: PASS');
  console.log(completedOrders === 0
    ? 'Note: no completed orders yet — buy a demo course to test receipt UI end-to-end'
    : 'Receipt data available for manual QA');

  await pool.end();
  process.exit(ordersReady ? 0 : 1);
}

function assertShape(payload) {
  const required = ['summary', 'wallet', 'forecast', 'topCourses', 'recent'];
  for (const key of required) {
    if (!(key in payload)) throw new Error(`dashboard missing ${key}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
