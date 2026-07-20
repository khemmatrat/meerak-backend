#!/usr/bin/env node
/**
 * Wrapper: preflight + k6 (must be on PATH).
 * Usage: node scripts/war-room-k6.mjs <load|stress|ladder> <baseUrl> [ladderStep]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , kind, baseUrl, ladderStep] = process.argv;
const scripts = {
  load: 'war-room-w2-load.js',
  stress: 'war-room-w2-stress.js',
  ladder: 'war-room-w2-ladder.js',
};
if (!kind || !baseUrl || !scripts[kind]) {
  console.error('Usage: war-room-k6.mjs <load|stress|ladder> <baseUrl> [100|500|1000]');
  process.exit(2);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const pre = spawnSync(process.execPath, [path.join(dir, 'war-room-w2-preflight.mjs'), baseUrl], {
  stdio: 'inherit',
});
if (pre.status !== 0) process.exit(pre.status ?? 1);

const k6Script = path.join(dir, 'k6', scripts[kind]);
const env = { ...process.env, BASE_URL: baseUrl.replace(/\/$/, '') };
if (kind === 'ladder' && ladderStep) env.LADDER_STEP = ladderStep;

const evidenceDir = path.resolve(dir, '../../docs/war-room/evidence');
const summaryName =
  kind === 'ladder' && ladderStep
    ? `w2-summary-ladder-${ladderStep}.json`
    : `w2-summary-${kind}.json`;
const summaryPath = path.join(evidenceDir, summaryName);

const k6Args = ['run', k6Script, '-e', `BASE_URL=${env.BASE_URL}`, '--summary-export', summaryPath];
if (kind === 'ladder' && ladderStep) k6Args.push('-e', `LADDER_STEP=${ladderStep}`);

const k6 = spawnSync('k6', k6Args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
if (k6.error && k6.error.code === 'ENOENT') {
  console.error('\n[k6 not found] Install k6 and ensure it is on PATH. See docs/war-room/W2_LOAD_STRESS_RUNBOOK.md');
  process.exit(127);
}
process.exit(k6.status ?? 1);
