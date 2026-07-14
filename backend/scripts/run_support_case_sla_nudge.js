/**
 * Cron: SLA breach Slack nudge for support cases.
 * Usage: cd backend && node scripts/run_support_case_sla_nudge.js [--force]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { runSupportCaseSlaNudge } from '../lib/supportCaseSlaNudge.js';

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
  const result = await runSupportCaseSlaNudge(pool, { force });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
