#!/usr/bin/env node
/**
 * Brand Adviser — daily activity check (single cron pipeline).
 * Suspends adviser_status → suspended when last qualifying activity exceeds inactivity_days.
 *
 *   node backend/scripts/brand-adviser-activity-cron.js
 *
 * ENV: same DB as backend (DB_* or DATABASE_URL via run script pattern — here: root .env DB_*)
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { runBrandAdviserSuspendWarnings, runBrandAdviserActivityCron } from '../lib/brandAdviser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;
const useUrl = process.env.DATABASE_URL;
const pool = useUrl
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
  });

async function main() {
  try {
    const warn = await runBrandAdviserSuspendWarnings(pool);
    const out = await runBrandAdviserActivityCron(pool);
    console.log('[brand-adviser-cron]', JSON.stringify({ warnings: warn, activity: out }));
    process.exit(0);
  } catch (e) {
    console.error('[brand-adviser-cron] fatal:', e?.message || e);
    process.exit(1);
  } finally {
    await pool.end().catch(() => { });
  }
}

main();
