/**
 * Phase 20 — backup & rollback plan verification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyCourseBackupRollbackPlan,
  BACKUP_ROLLBACK_CHECKS,
} from '../lib/courseBackupRollbackPlan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(__dirname, '..');

test('BACKUP_ROLLBACK_CHECKS includes deploy backup and rollback docs', () => {
  const ids = BACKUP_ROLLBACK_CHECKS.map((c) => c.id);
  assert.ok(ids.includes('deploy_script_backup'));
  assert.ok(ids.includes('rollback_docs'));
  assert.ok(ids.includes('pg_dump_available'));
});

test('deploy script and rollback docs exist', async () => {
  const report = await verifyCourseBackupRollbackPlan();
  const deploy = report.checks.find((c) => c.id === 'deploy_script_backup');
  const docs = report.checks.find((c) => c.id === 'rollback_docs');
  assert.equal(deploy?.pass, true);
  assert.equal(docs?.pass, true);
});

test('COURSE_MARKETPLACE_DEPLOY documents gunzip restore', () => {
  const doc = readFileSync(join(BACKEND, 'COURSE_MARKETPLACE_DEPLOY.txt'), 'utf8');
  assert.match(doc, /gunzip/i);
  assert.match(doc, /pre_course_marketplace_/);
});

test('run-course-marketplace-on-server.sh exists', () => {
  assert.equal(existsSync(join(BACKEND, 'scripts', 'run-course-marketplace-on-server.sh')), true);
});
