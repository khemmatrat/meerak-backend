#!/usr/bin/env node
/**
 * Manual QA checklist — แสดงรายการ sign-off หรือรัน automated runner
 *
 * Usage:
 *   node scripts/run-course-manual-qa-checklist.js          # แสดง checklist
 *   node scripts/run-course-manual-qa-checklist.js --run    # รัน 12 ขั้นอัตโนมัติ
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MANUAL_QA_STEPS } from '../lib/courseLaunchChecklist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (process.argv.includes('--run')) {
  const script = join(__dirname, 'run-course-manual-qa.js');
  const args = process.argv.slice(2).filter((a) => a !== '--run');
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

console.log('=== Course Marketplace — Manual QA Sign-off ===\n');
console.log('รันอัตโนมัติ (แนะนำก่อน deploy):');
console.log('  node scripts/run-course-manual-qa.js\n');
console.log('หรือ: node scripts/run-course-manual-qa-checklist.js --run\n');
console.log('รายการ 12 ขั้น:\n');
MANUAL_QA_STEPS.forEach((step, i) => {
  console.log(`  [ ] ${i + 1}. ${step.label}  (${step.id})`);
});
console.log('\nPayment regression + http_e2e รวมใน runner แล้ว');
console.log('Backup/rollback: ดู backend/COURSE_MARKETPLACE_DEPLOY.txt § G');
console.log('\nAutomated pre-check: node scripts/run-course-phase18-check.js');
