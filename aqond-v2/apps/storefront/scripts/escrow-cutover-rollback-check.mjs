#!/usr/bin/env node
/**
 * Automated rollback gate — true only when no escrow writes occurred after cutover timestamp.
 *
 * Usage:
 *   ESCROW_CUTOVER_AT=2026-07-04T12:00:00Z STOREFRONT_PG_URL=postgresql://... node scripts/escrow-cutover-rollback-check.mjs
 *   node scripts/escrow-cutover-rollback-check.mjs --cutover-at 2026-07-04T12:00:00Z --sqlite .data/escrow.db
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { cutoverAt: process.env.ESCROW_CUTOVER_AT, sqlite: path.join(ROOT, '..', '.data', 'escrow.db'), pgUrl: process.env.STOREFRONT_PG_URL };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--cutover-at') out.cutoverAt = argv[++i];
    else if (argv[i] === '--sqlite') out.sqlite = argv[++i];
    else if (argv[i] === '--pg-url') out.pgUrl = argv[++i];
  }
  return out;
}

function checkSqlite(sqlitePath, cutoverMs) {
  if (!fs.existsSync(sqlitePath)) {
    return { backend: 'sqlite', rollback_safe: true, reason: 'sqlite_file_missing', counts: {} };
  }
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  const q = (sql) => db.prepare(sql).get(cutoverMs);
  const counts = {
    holds_updated: q(`SELECT COUNT(*) AS c FROM escrow_holds WHERE updated_at > ?`).c,
    holds_created: q(`SELECT COUNT(*) AS c FROM escrow_holds WHERE created_at > ?`).c,
    capture_events: q(`SELECT COUNT(*) AS c FROM payment_capture_events WHERE created_at > ?`).c,
    auto_confirm: q(`SELECT COUNT(*) AS c FROM order_auto_confirm_releases WHERE released_at > ?`).c,
  };
  db.close();
  const writes = Object.values(counts).reduce((a, b) => a + b, 0);
  return { backend: 'sqlite', rollback_safe: writes === 0, counts };
}

async function checkPostgres(pgUrl, cutoverMs) {
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: pgUrl, max: 2 });
  try {
    const run = async (sql, params) => {
      const r = await pool.query(sql, params);
      return Number(r.rows[0]?.c ?? 0);
    };
    const cutoverIso = new Date(cutoverMs).toISOString();
    const counts = {
      holds_updated: await run(
        `SELECT COUNT(*)::int AS c FROM escrow_holds WHERE updated_at > $1::timestamptz`,
        [cutoverIso],
      ),
      holds_created: await run(
        `SELECT COUNT(*)::int AS c FROM escrow_holds WHERE created_at > $1::timestamptz`,
        [cutoverIso],
      ),
      capture_events: await run(
        `SELECT COUNT(*)::int AS c FROM payment_capture_events WHERE created_at > $1::timestamptz`,
        [cutoverIso],
      ),
      auto_confirm: await run(
        `SELECT COUNT(*)::int AS c FROM order_auto_confirm_releases WHERE released_at > $1::timestamptz`,
        [cutoverIso],
      ),
    };
    const writes = Object.values(counts).reduce((a, b) => a + b, 0);
    return { backend: 'postgres', rollback_safe: writes === 0, counts };
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.cutoverAt) {
    console.error('FAIL missing cutover timestamp (ESCROW_CUTOVER_AT or --cutover-at)');
    process.exit(2);
  }
  const cutoverMs = Date.parse(args.cutoverAt);
  if (Number.isNaN(cutoverMs)) {
    console.error('FAIL invalid cutover timestamp', args.cutoverAt);
    process.exit(2);
  }

  const backend = String(process.env.ESCROW_STORAGE_BACKEND || 'sqlite').toLowerCase();
  let result;
  if (backend === 'postgres') {
    if (!args.pgUrl) {
      console.error('FAIL postgres rollback check requires STOREFRONT_PG_URL');
      process.exit(2);
    }
    result = await checkPostgres(args.pgUrl, cutoverMs);
  } else {
    result = checkSqlite(args.sqlite, cutoverMs);
  }

  const payload = {
    ok: result.rollback_safe,
    cutover_at: new Date(cutoverMs).toISOString(),
    ...result,
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(result.rollback_safe ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
