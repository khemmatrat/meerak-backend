import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeRuntimeMetrics } from './runtime-metrics.js';

const WINDOW_MS = Number(process.env.AGK_BLACKBOX_WINDOW_MS || 5 * 60 * 1000);
const MAX_ENTRIES = Number(process.env.AGK_BLACKBOX_MAX_ENTRIES || 10_000);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = process.env.AGK_DATA_DIR || path.join(ROOT, 'data');

const entries = [];
let hooked = false;

function trim() {
  const cutoff = Date.now() - WINDOW_MS;
  while (entries.length && entries[0].ts < cutoff) entries.shift();
  while (entries.length > MAX_ENTRIES) entries.shift();
}

export function blackboxRecord(kind, payload = {}) {
  entries.push({
    ts: Date.now(),
    kind,
    memory: computeRuntimeMetrics().memory,
    ...payload,
  });
  trim();
}

export function blackboxDump() {
  trim();
  return {
    window_ms: WINDOW_MS,
    count: entries.length,
    oldest_ts: entries[0]?.ts || null,
    newest_ts: entries.at(-1)?.ts || null,
    entries: [...entries],
  };
}

function flushCrash(reason, err) {
  const dump = {
    crashed_at: new Date().toISOString(),
    reason,
    error: err ? { message: err.message, stack: err.stack } : null,
    runtime: computeRuntimeMetrics(),
    blackbox: blackboxDump(),
  };
  try {
    fs.mkdirSync(DUMP_DIR, { recursive: true });
    const file = path.join(DUMP_DIR, `blackbox-crash-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(dump, null, 2));
    console.error(JSON.stringify({ type: 'agk.blackbox.crash', file, reason }));
  } catch {
    console.error(JSON.stringify({ type: 'agk.blackbox.crash', reason, dump_size: entries.length }));
  }
}

export function installBlackboxHooks() {
  if (hooked) return;
  hooked = true;
  process.on('uncaughtException', (err) => {
    flushCrash('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    flushCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
}

export function blackboxHealth() {
  trim();
  return { status: 'up', buffered: entries.length, window_ms: WINDOW_MS };
}
