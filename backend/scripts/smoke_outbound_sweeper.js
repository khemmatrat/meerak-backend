/**
 * Smoke test: outbound sending sweeper resets stale `sending` → `pending`.
 *
 *   cd backend && node scripts/smoke_outbound_sweeper.js
 *
 * Requires DB with migration 190 (status retry_scheduled/dead + correlation columns optional).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  sweepOutboundStuckSending,
  claimOutboundEventsForSending,
  finalizeOutboundSent,
} from '../lib/outboundDomainDispatch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_DATABASE || 'meera',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || '',
});

const RUN = `smoke_outbound_${Date.now()}`;

async function main() {
  const client = await pool.connect();
  let rowId;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO outbound_domain_events (
         event_name, idempotency_key, payload, trace_id, payment_id,
         status, attempt_count, next_attempt_at, updated_at
       )
       VALUES ($1, $2, '{}'::jsonb, $3, $4, 'sending', 0, NOW(), NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [`${RUN}.ev`, `${RUN}.key`, RUN, RUN],
    );
    rowId = ins.rows[0].id;
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const ids = await sweepOutboundStuckSending(pool, { staleMinutes: 5 });
  if (!ids.map(String).includes(String(rowId))) {
    throw new Error(`sweeper did not return inserted id=${rowId}, got=${JSON.stringify(ids)}`);
  }

  const check = await pool.query(
    `SELECT status, attempt_count FROM outbound_domain_events WHERE id = $1::bigint`,
    [rowId],
  );
  const st = check.rows[0];
  if (st.status !== 'pending' || Number(st.attempt_count) !== 1) {
    throw new Error(`expected pending + attempt_count=1, got ${JSON.stringify(st)}`);
  }

  const claimed = await claimOutboundEventsForSending(pool, 50);
  const mine = claimed.find((r) => String(r.id) === String(rowId));
  if (!mine || mine.status !== 'sending') {
    throw new Error(`claim failed for id=${rowId}; claimed_sample=${claimed.map((c) => c.id).slice(0, 5)}`);
  }
  await finalizeOutboundSent(pool, rowId);

  await pool.query(`DELETE FROM outbound_domain_events WHERE id = $1::bigint`, [rowId]);

  console.log('smoke_outbound_sweeper: ok');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end().catch(() => {});
  process.exitCode = 1;
});
