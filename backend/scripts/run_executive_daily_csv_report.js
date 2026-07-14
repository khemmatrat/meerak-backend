/**
 * Cron: Executive Daily CSV report email.
 * Usage: cd backend && node scripts/run_executive_daily_csv_report.js [--force] [--date=YYYY-MM-DD]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import {
  getExecutiveDailyReportSchedule,
  sendExecutiveDailyCsvReport,
} from '../lib/executiveDailyCsvReport.js';

dotenv.config();

const force = process.argv.includes('--force');
const dateArg = process.argv.find((arg) => arg.startsWith('--date=')) || '';
const reportDate = dateArg.slice('--date='.length).trim() || undefined;
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'meerak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.DB_ADMIN_PASSWORD,
});

try {
  const schedule = await getExecutiveDailyReportSchedule(pool);
  const result = await sendExecutiveDailyCsvReport(pool, {
    force,
    reportDate,
    windowDays: schedule.window_days,
    recipients: schedule.recipients,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.sent || result.reason === 'deduped' ? 0 : 1);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
