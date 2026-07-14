#!/usr/bin/env node
/**
 * Phase 17 check — refund/payout policies, ledger events, platform revenue reporting.
 * Usage: node scripts/run-course-phase17-check.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function main() {
  console.log('=== Course Marketplace Phase 17 Check ===\n');

  const artifacts = [
    'backend/lib/courseRefundEngine.js',
    'backend/lib/courseRefundService.js',
    'backend/lib/coursePayoutService.js',
    'backend/lib/courseOrderTaxDocuments.js',
    'backend/lib/courseFiscalService.js',
    'backend/db/migrations/237_course_marketplace_phase17.sql',
    'mobile/pages/CourseOrderReceipt.tsx',
    'mobile/pages/AdminCourseAnalytics.tsx',
  ];
  for (const rel of artifacts) {
    readFileSync(join(__dirname, '..', '..', rel), 'utf8');
    console.log('✓', rel);
  }

  const tableNames = ['course_refunds', 'course_purchase_orders', 'platform_revenues', 'payout_config'];
  const tables = Object.fromEntries(
    await Promise.all(
      tableNames.map(async (name) => {
        const r = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS ready`, [`public.${name}`]);
        return [name, !!r.rows?.[0]?.ready];
      }),
    ),
  );
  console.log('\nTables:', tables);

  const policies = await pool.query(
    `SELECT key FROM payout_config
     WHERE key IN ('course_refund_policy', 'course_payout_policy', 'course_revenue_policy')`,
  );
  const policyKeys = (policies.rows || []).map((r) => r.key);
  console.log('Payout policies:', policyKeys);

  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'course_purchase_orders'
       AND column_name IN ('payout_status', 'payout_release_at', 'refund_status', 'refund_ledger_id')`,
  );
  console.log('Order lifecycle columns:', (cols.rows || []).map((r) => r.column_name));

  const ledgerEvents = await pool.query(
    `SELECT event_type, COUNT(*)::int AS n
     FROM payment_ledger_audit
     WHERE event_type IN ('course_purchase', 'course_refund', 'course_instructor_payout')
     GROUP BY event_type
     ORDER BY event_type`,
  );
  console.log('\nCourse ledger events:', Object.fromEntries((ledgerEvents.rows || []).map((r) => [r.event_type, r.n])));

  const commission = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS net, COUNT(*)::int AS rows
     FROM platform_revenues WHERE source_type = 'course_commission'`,
  );
  console.log('platform_revenues course_commission:', commission.rows?.[0]);

  const ok =
    tableNames.every((name) => tables[name])
    && policyKeys.includes('course_refund_policy')
    && policyKeys.includes('course_payout_policy')
    && (cols.rows || []).length >= 4;

  console.log('\nPhase 17 DB ready:', ok ? 'YES' : 'NO');
  if (!ok) {
    console.log('Run: node scripts/run-migration.js 237');
  }

  await pool.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
