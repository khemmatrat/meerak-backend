#!/usr/bin/env node
/**
 * Phase 12 staging check — ledger integrity + launch checklist summary.
 * Usage: node scripts/run-course-phase12-check.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildCourseLaunchChecklist } from '../lib/courseLaunchChecklist.js';
import { checkCourseMarketplaceLedgerIntegrity } from '../lib/courseLedgerIntegrity.js';

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
  console.log('=== Course Marketplace Phase 12 Check ===\n');

  const integrity = await checkCourseMarketplaceLedgerIntegrity(pool);
  console.log('Ledger chain integrity:', JSON.stringify(integrity, null, 2));

  const checklist = await buildCourseLaunchChecklist(pool);
  console.log('\nLaunch checklist ready:', checklist.ready);
  console.log('Automated:', `${checklist.automated.pass}/${checklist.automated.total}`);
  for (const c of checklist.automated.checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}: ${c.label}`);
  }
  console.log('\nSign-off:', JSON.stringify(checklist.signOff, null, 2));

  await pool.end();
  process.exit(checklist.ready ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
