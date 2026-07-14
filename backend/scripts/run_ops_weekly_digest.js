/**
 * Cron: Weekly Ops Digest → Slack.
 * Usage: cd backend && node scripts/run_ops_weekly_digest.js [--force]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { sendOpsWeeklyDigest } from '../lib/opsWeeklyDigest.js';

dotenv.config();

const force = process.argv.includes('--force');
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'meerak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.DB_ADMIN_PASSWORD,
});

try {
  const result = await sendOpsWeeklyDigest(pool, { force });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.sent || result.reason === 'deduped' ? 0 : 1);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
