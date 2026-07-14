#!/usr/bin/env node
/**
 * Verify ClickHouse ads warehouse connectivity (prod ops).
 * Usage: node backend/scripts/verify-ads-clickhouse.js [--ping-only]
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pingOnly = process.argv.includes('--ping-only');

function clickhouseUrl() {
  return String(process.env.CLICKHOUSE_URL || process.env.ADS_CLICKHOUSE_URL || '').replace(/\/$/, '');
}

function authHeaders() {
  const headers = {};
  if (process.env.CLICKHOUSE_USER) {
    const auth = Buffer.from(
      `${process.env.CLICKHOUSE_USER}:${process.env.CLICKHOUSE_PASSWORD || ''}`,
    ).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }
  return headers;
}

async function chQuery(sql) {
  const base = clickhouseUrl();
  if (!base) {
    console.log('SKIP: CLICKHOUSE_URL not set (postgres warehouse fallback only)');
    process.exit(0);
  }
  const url = `${base}/?query=${encodeURIComponent(sql)}`;
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error('FAIL', res.status, text.slice(0, 300));
    process.exit(1);
  }
  return text.trim();
}

try {
  const version = await chQuery('SELECT version()');
  console.log('OK ClickHouse ping:', version);

  const table = process.env.ADS_CLICKHOUSE_TABLE || 'ads_events';
  const exists = await chQuery(
    `SELECT count() FROM system.tables WHERE database = currentDatabase() AND name = '${table.replace(/'/g, "''")}'`,
  );
  if (exists === '0') {
    console.warn(`WARN: table ${table} missing — run scripts/clickhouse-ads-setup.sql`);
  } else {
    console.log(`OK table ${table} exists`);
  }

  if (!pingOnly) {
    const rows = await chQuery(`SELECT count() FROM ${table}`);
    console.log(`OK ${table} row count:`, rows);
  }
} catch (e) {
  console.error('FAIL', e?.message || e);
  process.exit(1);
}
