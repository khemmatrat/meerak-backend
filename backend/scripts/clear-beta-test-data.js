/**
 * Reset closed-beta cohort flags / counter after testing (optional user deletion).
 *
 * Usage:
 *   node backend/scripts/clear-beta-test-data.js              # dry-run
 *   node backend/scripts/clear-beta-test-data.js --execute    # reset flags + counter (keeps user rows)
 *   node backend/scripts/clear-beta-test-data.js --execute --delete-users   # DELETE users WHERE is_beta_tester (dangerous; may fail on FK)
 *
 * Loads backend/.env when present.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const { Pool } = pg;

async function main() {
  const execute = process.argv.includes('--execute');
  const deleteUsers = process.argv.includes('--delete-users');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD != null && process.env.DB_PASSWORD !== '' ? String(process.env.DB_PASSWORD) : '',
  });

  try {
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users WHERE COALESCE(is_beta_tester, false) = true`
    );
    const n = cnt.rows?.[0]?.n ?? 0;
    console.log(`[dry-run] beta testers (is_beta_tester): ${n}`);

    const ctr = await pool.query(`SELECT max_slots, slots_used FROM beta_tester_counter WHERE id = 1`).catch(() => ({
      rows: [],
    }));
    if (ctr.rows?.[0]) {
      console.log(`[counter] max_slots=${ctr.rows[0].max_slots} slots_used=${ctr.rows[0].slots_used}`);
    } else {
      console.log('[counter] beta_tester_counter row missing — run migration 149');
    }

    if (!execute) {
      console.log('\nNo changes (dry-run). Pass --execute to reset cohort flags + counter.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (deleteUsers) {
        const del = await client.query(`DELETE FROM users WHERE COALESCE(is_beta_tester, false) = true RETURNING id`);
        console.log(`[execute] deleted ${del.rowCount} users (beta cohort)`);
      } else {
        const upd = await client.query(
          `UPDATE users SET is_beta_tester = false, beta_tester_number = NULL WHERE COALESCE(is_beta_tester, false) = true`
        );
        console.log(`[execute] cleared beta flags on ${upd.rowCount} rows`);
      }
      await client.query(
        `UPDATE beta_tester_counter SET slots_used = 0 WHERE id = 1`
      ).catch(() => { });
      await client.query('COMMIT');
      console.log('[execute] beta_tester_counter.slots_used reset to 0');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => { });
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
