#!/usr/bin/env node
/**
 * Run Manual QA 12 steps (automated where possible) before production deploy.
 *
 * Usage:
 *   node scripts/run-course-manual-qa.js
 *   node scripts/run-course-manual-qa.js --skip-e2e
 *   TEST_API_URL=http://127.0.0.1:3001 node scripts/run-course-manual-qa.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCourseManualQa, MANUAL_QA_STEPS } from '../lib/courseManualQaRunner.js';
import { buildCourseLaunchChecklist } from '../lib/courseLaunchChecklist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const skipE2e = process.argv.includes('--skip-e2e');
const jsonOut = process.argv.find((a) => a.startsWith('--json='))?.split('=')[1]
  || join(__dirname, '..', 'course-manual-qa-report.json');

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
  max: 5,
});

async function main() {
  console.log('=== Course Marketplace — Manual QA (12 steps) ===\n');
  console.log(`Steps: ${MANUAL_QA_STEPS.length} | E2E: ${skipE2e ? 'skipped' : 'included'}`);
  console.log(`API: ${process.env.TEST_API_URL || 'http://localhost:3001'}\n`);

  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('❌ PostgreSQL unavailable:', e?.message);
    process.exit(1);
  }

  const automated = await buildCourseLaunchChecklist(pool);
  console.log('Automated launch checklist:', `${automated.automated.pass}/${automated.automated.total}`);
  for (const c of automated.automated.checks.filter((x) => !x.pass)) {
    console.log(`  ⚠ ${c.id}: ${JSON.stringify(c.detail)}`);
  }
  console.log('');

  const report = await runCourseManualQa(pool, { skipE2e });
  report.automatedLaunch = {
    pass: automated.automated.pass,
    total: automated.automated.total,
    ready: automated.ready,
  };

  for (let i = 0; i < report.results.length; i++) {
    const r = report.results[i];
    const icon = r.pass ? '✓' : '✗';
    console.log(`${icon} ${i + 1}. ${r.label || r.id}`);
    if (r.detail && (!r.pass || process.argv.includes('--verbose'))) {
      console.log('   ', JSON.stringify(r.detail));
    }
  }

  console.log('\n--- Sign-off ---');
  console.log(JSON.stringify(report.signOff, null, 2));
  console.log(`\nManual QA: ${report.passCount}/${report.total} PASS`);
  console.log('Deploy ready:', report.signOff.deployReady && automated.ready ? 'YES' : 'NO');

  writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nReport saved: ${jsonOut}`);

  if (!report.pass) {
    console.log('\nFix failing steps, restart backend if http_e2e failed, then re-run.');
  } else if (!automated.ready) {
    console.log('\nManual QA passed but automated launch checklist needs review (migrations/ledger).');
  } else {
    console.log('\nNext: .\\scripts\\deploy-course-marketplace-production.ps1');
  }

  await pool.end();
  process.exit(report.pass && automated.ready ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
