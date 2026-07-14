#!/usr/bin/env node
/** Apply escrow migrations 039+040+041+042 to commerce Postgres (staging/local). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  path.join(ROOT, '..', '..', '..', 'infra', 'postgres', 'migrations', '039_return_escrow_holds.sql'),
  path.join(ROOT, '..', '..', '..', 'infra', 'postgres', 'migrations', '040_return_escrow_idempotency.sql'),
  path.join(ROOT, '..', '..', '..', 'infra', 'postgres', 'migrations', '041_platform_commission_ledger.sql'),
  path.join(ROOT, '..', '..', '..', 'infra', 'postgres', 'migrations', '042_merchant_wallet_balance.sql'),
];

async function main() {
  const pgUrl =
    process.env.STOREFRONT_PG_URL ||
    process.env.DATABASE_URL ||
    (process.env.POSTGRES_HOST
      ? `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB_COMMERCE || 'commerce'}`
      : '');

  if (!pgUrl) {
    console.error('FAIL set STOREFRONT_PG_URL (e.g. postgresql://admin_boss:PASS@127.0.0.1:5433/commerce)');
    process.exit(2);
  }

  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: pgUrl, max: 1 });
  try {
    for (const file of MIGRATIONS) {
      if (!fs.existsSync(file)) throw new Error(`missing migration: ${file}`);
      const sql = fs.readFileSync(file, 'utf8');
      console.log('Applying', path.basename(file));
      await pool.query(sql);
    }
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'escrow_holds','payment_capture_events','order_auto_confirm_releases',
          'escrow_cutover_events','platform_commission_ledger',
          'merchant_wallet_balance','merchant_wallet_escrow_credits'
        )
      ORDER BY 1`);
    console.log('PASS migrations applied', { tables: tables.rows.map((r) => r.table_name) });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
