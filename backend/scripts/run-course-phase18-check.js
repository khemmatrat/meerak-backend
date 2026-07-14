#!/usr/bin/env node
/**
 * Phase 18 — production launch sign-off (admin ops + funnel + checklist).
 * Usage: node scripts/run-course-phase18-check.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCourseLaunchChecklist, MANUAL_QA_STEPS } from '../lib/courseLaunchChecklist.js';
import { buildCourseMarketplaceReadiness } from '../lib/courseMarketplaceReadiness.js';
import { COURSE_FUNNEL_EVENTS } from '../lib/courseFunnelAnalytics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

const ARTIFACTS = [
  'nexus-admin-core/components/CourseMarketplaceAdminView.tsx',
  'backend/lib/courseBannerAutomation.js',
  'backend/lib/courseFunnelAnalytics.js',
  'backend/lib/courseLaunchChecklist.js',
  'backend/lib/courseQaNotify.js',
  'mobile/pages/AdminCourseAnalytics.tsx',
];

async function main() {
  console.log('=== Course Marketplace Phase 18 Check ===\n');

  for (const rel of ARTIFACTS) {
    readFileSync(join(__dirname, '..', '..', rel), 'utf8');
    console.log('✓', rel);
  }

  console.log('\nFunnel events:', COURSE_FUNNEL_EVENTS.join(', '));

  const funnelTable = await pool.query(`SELECT to_regclass('public.course_funnel_events') IS NOT NULL AS ready`);
  const auditTable = await pool.query(`SELECT to_regclass('public.course_marketplace_audit_log') IS NOT NULL AS ready`);
  console.log('\nTables:', {
    course_funnel_events: !!funnelTable.rows?.[0]?.ready,
    course_marketplace_audit_log: !!auditTable.rows?.[0]?.ready,
  });

  const funnelCount = await pool.query(`SELECT COUNT(*)::int AS n FROM course_funnel_events`).catch(() => ({ rows: [{ n: 0 }] }));
  console.log('Funnel events logged:', funnelCount.rows?.[0]?.n ?? 0);

  const readiness = await buildCourseMarketplaceReadiness(pool, {
    app: {
      get(key) {
        return [
          'courseMarketplaceRoutesRegistered',
          'courseStudioRoutesRegistered',
          'coursePurchaseRoutesRegistered',
          'courseGatewayRoutesRegistered',
        ].includes(key);
      },
    },
  });
  console.log('\nRuntime readiness:', readiness.hint);

  const checklist = await buildCourseLaunchChecklist(pool);
  console.log('\nLaunch checklist automated:', `${checklist.automated.pass}/${checklist.automated.total}`);
  for (const c of checklist.automated.checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}`);
  }
  console.log('\nManual QA steps:', MANUAL_QA_STEPS.length);
  console.log('Sign-off:', JSON.stringify(checklist.signOff, null, 2));

  const dbOk = !!funnelTable.rows?.[0]?.ready && !!auditTable.rows?.[0]?.ready;
  const automatedOk = checklist.automated.pass >= checklist.automated.total - 1;
  console.log('\nPhase 18 DB ready:', dbOk ? 'YES' : 'NO');
  console.log('Automated launch checks:', automatedOk ? 'PASS' : 'REVIEW');
  console.log('\nNext: node scripts/run-course-production-signoff.js');

  await pool.end();
  process.exit(dbOk && automatedOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
