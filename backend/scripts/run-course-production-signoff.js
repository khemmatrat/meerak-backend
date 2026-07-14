#!/usr/bin/env node
/**
 * Full production sign-off — Phase 18 automated + Manual QA + Phase 19 + Phase 20.
 *
 * Usage:
 *   node scripts/run-course-production-signoff.js
 *   node scripts/run-course-production-signoff.js --run-manual-qa
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCourseProductionSignOff } from '../lib/courseProductionSignOff.js';

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
  if (process.argv.includes('--run-manual-qa')) {
    console.log('Running manual QA first...\n');
    const r = spawnSync(process.execPath, [join(__dirname, 'run-course-manual-qa.js')], {
      stdio: 'inherit',
      env: process.env,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  console.log('\n=== Course Marketplace — Production Sign-off ===\n');
  const report = await buildCourseProductionSignOff(pool);

  console.log('Automated checklist:', `${report.checklist.automated.pass}/${report.checklist.automated.total}`);
  console.log('Manual QA:', report.signOff.manualQa, report.signOff.manualQaDetail);
  console.log('Payment regression:', report.signOff.paymentRegression, report.signOff.paymentRegressionDetail);
  console.log('Backup/rollback:', report.signOff.backupRollbackPlan, report.signOff.backupRollbackDetail);
  console.log('\nSign-off:', JSON.stringify(report.signOff, null, 2));
  console.log('\nDEPLOY READY:', report.deployReady ? 'YES ✅' : 'NO ❌');

  const out = join(__dirname, '..', 'course-production-signoff.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nSaved: ${out}`);

  if (!report.deployReady) {
    console.log('\nFix items above, then re-run.');
    if (report.signOff.manualQa === 'run_required') {
      console.log('  → node scripts/run-course-manual-qa.js');
    }
    if (report.signOff.paymentRegression !== 'automated_pass') {
      console.log('  → node scripts/run-course-phase19-check.js');
    }
    if (!['verified', 'verified_with_warnings'].includes(report.signOff.backupRollbackPlan)) {
      console.log('  → node scripts/run-course-phase20-check.js');
    }
  } else {
    console.log('\nNext: .\\scripts\\deploy-course-marketplace-production.ps1');
  }

  await pool.end();
  process.exit(report.deployReady ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
