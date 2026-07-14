#!/usr/bin/env node
/**
 * Kernel Readiness Gate (053) — aggregate soak + chaos + memleak + long-context + attack-sim.
 *
 * Usage: node aqond-v2/guardian/scripts/readiness/readiness-report.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function loadJsonl(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function soakDays() {
  const rows = loadJsonl('soak-log.jsonl');
  const days = new Set(rows.map((r) => r.ts?.slice(0, 10)));
  const fail = rows.filter((r) => !r.pass).length;
  return { days: days.size, probes: rows.length, fail, ok: days.size >= 7 && fail === 0 };
}

function chaosOk() {
  const rows = loadJsonl('chaos-log.jsonl');
  if (!rows.length) return { ok: false, note: 'no chaos runs yet' };
  const fail = rows.filter((r) => r.pass === false).length;
  return { ok: fail === 0, runs: rows.length, fail };
}

function attackOk() {
  const rows = loadJsonl('attack-sim-log.jsonl');
  const last = rows.at(-1);
  return { ok: Boolean(last?.pass), runs: rows.length };
}

function longContextOk() {
  const rows = loadJsonl('long-context-log.jsonl');
  const last = rows.at(-1);
  return { ok: Boolean(last?.pass), requests: last?.requests };
}

function main() {
  const soak = soakDays();
  const chaos = chaosOk();
  const attack = attackOk();
  const longCtx = longContextOk();

  const memReport = spawnSync(process.execPath, [path.join(SCRIPTS, 'memleak-report.mjs'), '--hours', '72'], {
    encoding: 'utf8',
  });
  const memOk = memReport.status === 0;

  console.log('═══════════════════════════════════════');
  console.log('  AGK Kernel Readiness Gate (053)');
  console.log('  Phase 4 BLOCKED until all green');
  console.log('═══════════════════════════════════════\n');

  const gates = [
    ['7-day Soak', soak.ok, `days=${soak.days}/7 probes=${soak.probes} fail=${soak.fail}`],
    ['Chaos Engineering', chaos.ok, chaos.note || `runs=${chaos.runs} fail=${chaos.fail}`],
    ['72h Memleak', memOk, memOk ? 'heap stable' : memReport.stdout || memReport.stderr],
    ['Long Context', longCtx.ok, `last_requests=${longCtx.requests ?? 'n/a'}`],
    ['Attack Simulation', attack.ok, `runs=${attack.runs}`],
  ];

  let allGreen = true;
  for (const [name, ok, detail] of gates) {
    console.log(`${ok ? '✅' : '⬜'} ${name} — ${detail}`);
    if (!ok) allGreen = false;
  }

  console.log('\n' + (allGreen ? '✅ KERNEL READY — CTO may approve Phase 4 (AI Service Mesh)' : '⏳ KERNEL NOT READY — continue readiness program'));
  process.exit(allGreen ? 0 : 1);
}

main();
