#!/usr/bin/env node
/**
 * Migrate escrow data SQLite → Postgres (dry-run by default).
 *
 *   node scripts/migrate-escrow-sqlite-to-pg.mjs --dry-run
 *   node scripts/migrate-escrow-sqlite-to-pg.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SQLITE = path.join(ROOT, '..', '.data', 'escrow.db');

function parseArgs(argv) {
  const out = { dryRun: true, sqlite: DEFAULT_SQLITE, pgUrl: process.env.STOREFRONT_PG_URL };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--apply') out.dryRun = false;
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--sqlite') out.sqlite = argv[++i];
    else if (argv[i] === '--pg-url') out.pgUrl = argv[++i];
  }
  return out;
}

function readSqlite(sqlitePath) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  const holds = db.prepare(`SELECT * FROM escrow_holds ORDER BY created_at ASC`).all();
  const captures = db.prepare(`SELECT * FROM payment_capture_events ORDER BY created_at ASC`).all();
  const releases = db.prepare(`SELECT * FROM order_auto_confirm_releases ORDER BY released_at ASC`).all();
  db.close();
  return { holds, captures, releases };
}

async function pgCounts(pool) {
  const held = await pool.query(`SELECT COUNT(*)::int AS c FROM escrow_holds WHERE status = 'held'`);
  const total = await pool.query(`SELECT COUNT(*)::int AS c FROM escrow_holds`);
  return { held: held.rows[0].c, total: total.rows[0].c };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.pgUrl) {
    console.error('FAIL set STOREFRONT_PG_URL');
    process.exit(2);
  }
  if (!fs.existsSync(args.sqlite)) {
    console.error('FAIL sqlite file missing', args.sqlite);
    process.exit(2);
  }

  const { holds, captures, releases } = readSqlite(args.sqlite);
  const sqliteHeld = holds.filter((h) => h.status === 'held').length;

  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: args.pgUrl, max: 2 });
  try {
    const before = await pgCounts(pool);
    const plan = {
      mode: args.dryRun ? 'dry-run' : 'apply',
      sqlite_path: args.sqlite,
      sqlite_holds: holds.length,
      sqlite_held: sqliteHeld,
      sqlite_capture_events: captures.length,
      sqlite_auto_confirm_releases: releases.length,
      postgres_holds_before: before.total,
      postgres_held_before: before.held,
    };

    if (args.dryRun) {
      console.log(JSON.stringify({ ok: true, ...plan, message: 'dry-run only — no writes' }, null, 2));
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const h of holds) {
        await client.query(
          `INSERT INTO escrow_holds
            (hold_id, order_id, amount_micro, reason, status, to_merchant_id, to_buyer_id, refund_reference, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (hold_id) DO NOTHING`,
          [
            h.hold_id,
            h.order_id,
            h.amount_micro,
            h.reason,
            h.status,
            h.to_merchant_id,
            h.to_buyer_id,
            h.refund_reference,
            h.created_at,
            h.updated_at,
          ],
        );
      }
      for (const c of captures) {
        await client.query(
          `INSERT INTO payment_capture_events (event_key, order_id, hold_id, created_at)
           VALUES ($1,$2,$3,$4) ON CONFLICT (event_key) DO NOTHING`,
          [c.event_key, c.order_id, c.hold_id, c.created_at],
        );
      }
      for (const r of releases) {
        await client.query(
          `INSERT INTO order_auto_confirm_releases (order_id, hold_id, merchant_id, amount_micro, released_at, job_run_id)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (order_id) DO NOTHING`,
          [r.order_id, r.hold_id, r.merchant_id, r.amount_micro, r.released_at, r.job_run_id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const after = await pgCounts(pool);
    const ok = after.held >= sqliteHeld;
    console.log(
      JSON.stringify(
        {
          ok,
          ...plan,
          postgres_holds_after: after.total,
          postgres_held_after: after.held,
          invariant_held_preserved: after.held >= sqliteHeld,
        },
        null,
        2,
      ),
    );
    if (!ok) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
