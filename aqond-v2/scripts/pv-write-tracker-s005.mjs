import fs from 'node:fs';
import { execSync } from 'node:child_process';

const ts = new Date().toISOString();
let build = 'dev';
try {
  build = execSync('git rev-parse --short HEAD', { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim();
} catch {
  /* ignore */
}

const header =
  'wave,mission_id,scenario_id,step,expected,actual,step_status,scenario_grade,experience_score,business_impact,time_saved_minutes,speed,clarity,recovery,smoothness,confidence,screenshot,video,log,issue,owner,tested_at,build,env';

const grade = '🟡 Functional Pass';
const score = '8.9';
const business = 'high';
const timeSaved = '7';
const dims = { speed: '9', clarity: '9', recovery: '9', smoothness: '8.5', confidence: '8.5' };

function row(step, expected, actual, status, log = '', issue = '') {
  return [
    1, 'M-001', 'S005', step, expected, actual, status, grade, score, business, timeSaved,
    dims.speed, dims.clarity, dims.recovery, dims.smoothness, dims.confidence,
    '', '', log, issue, 'PV-2', ts, build, 'local-dev:3003',
  ];
}

const s005Rows = [
  row(1, 'Line items match', 'cart line title + count header', '✅', 'pv-s005-cart-view step 1'),
  row(2, 'Totals correct', 'subtotal ฿398 for qty×2', '✅', 'pv-s005 step 2; pv-s005-check'),
  row(3, 'Checkout step bar', 'TtCheckoutStepBar step 1 active', '✅', 'cart-checkout-steps'),
  row(4, 'Checkout CTA', 'href /m/checkout', '✅', 'cart-checkout-cta'),
  row(5, 'Tab navigation', 'home → tab cart → /m/cart', '✅', 'pv-s005 step 5'),
  row(6, 'Empty state', 'cart-empty-state + CTA home', '✅', 'pv-s005 step 6'),
  row(7, 'Multi-line cart', '2 lines; total ฿298', '✅', 'pv-s005 step 7'),
  row(8, 'BFF parity', 'GET total_micro matches UI', '✅', 'pv-s005 step 8'),
  row(9, 'Qty on view', 'stepper updates subtotal live', '✅', 'pv-s005 step 9'),
  row(10, 'Telemetry S005', 'cart_view surface + trace_id', '✅', 'recordCartViewTelemetry'),
];

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const trackerPath = new URL('../../docs/platform-validation/pv-3/wave-1-tracker.csv', import.meta.url);
let existing = '';
try {
  existing = fs.readFileSync(trackerPath, 'utf8');
} catch {
  existing = `${header}\n`;
}

const withoutS005 = existing
  .split('\n')
  .filter((line) => line && !line.includes(',S005,'))
  .join('\n');

const csv = `${withoutS005.trim()}\n${s005Rows.map((r) => r.map(esc).join(',')).join('\n')}\n`;
fs.writeFileSync(trackerPath, csv, 'utf8');

const rollupPath = new URL('../../docs/platform-validation/pv-3/scenario-rollup.csv', import.meta.url);
let rollup = fs.readFileSync(rollupPath, 'utf8');
rollup = rollup
  .split('\n')
  .filter((l) => !l.startsWith('S005,'))
  .join('\n');
rollup += `S005,M-001,cart_view,View cart,${score},high,7,${grade},marketplace,3.3,${ts},e2e 10/10 android-chrome\n`;
fs.writeFileSync(rollupPath, rollup, 'utf8');

console.log('S005 tracker — Experience', score, grade);
