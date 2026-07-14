#!/usr/bin/env node
/**
 * Phase 20 — Backup & rollback plan verification.
 * Usage: node scripts/run-course-phase20-check.js [--create-backup]
 */
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyCourseBackupRollbackPlan, BACKUP_ROLLBACK_CHECKS } from '../lib/courseBackupRollbackPlan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
  const createBackup = process.argv.includes('--create-backup');
  console.log('=== Course Marketplace Phase 20 — Backup & Rollback ===\n');
  console.log('Checks defined:', BACKUP_ROLLBACK_CHECKS.length);
  if (createBackup) console.log('Mode: --create-backup enabled\n');

  const report = await verifyCourseBackupRollbackPlan({ createLocalBackup: createBackup });
  for (const c of report.checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}`);
    if (!c.pass || process.argv.includes('--verbose')) {
      console.log('    ', JSON.stringify(c.detail));
    }
  }

  console.log('\nRollback steps:');
  report.rollbackSteps.forEach((s) => console.log(' ', s));

  const out = join(__dirname, '..', 'course-backup-rollback-report.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: ${out}`);
  console.log('Result:', `${report.passCount}/${report.total}`, report.pass ? 'PASS' : 'FAIL');
  console.log('Sign-off status:', report.pass ? 'verified' : 'manual_required');

  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
