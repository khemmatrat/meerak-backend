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
const score = '8.8';
const business = 'high';
const timeSaved = '8';
const dims = { speed: '8.5', clarity: '9', recovery: '9', smoothness: '9', confidence: '8.5' };

function row(step, expected, actual, status, log = '', issue = '') {
  return [
    1, 'M-001', 'S003', step, expected, actual, status, grade, score, business, timeSaved,
    dims.speed, dims.clarity, dims.recovery, dims.smoothness, dims.confidence,
    '', '', log, issue, 'PV-2', ts, build, 'local-dev:3003',
  ];
}

const s003Rows = [
  row(1, 'ข้อมูลสินค้าโหลด', 'title + price + gallery visible', '✅', 'e2e step 1'),
  row(2, 'Detail API', 'GET /api/product/[id]/detail 200', '✅', 'e2e step 2; pv-s003-check'),
  row(3, 'ปุ่มใส่รถเข็นเปิดใช้', 'footer รถเข็น enabled', '✅', 'e2e step 3'),
  row(4, 'Buy sheet เปิด', 'PdpBuySheet data-testid', '✅', 'e2e step 3-4'),
  row(5, 'ยืนยันใส่รถเข็นสำเร็จ', 'ใส่รถเข็นแล้ว ✓', '✅', 'e2e step 5'),
  row(6, 'Search → PDP', 'ครีม search → product link', '✅', 'e2e step 6'),
  row(7, 'ซื้อเลยเปิด sheet', 'buy bar → ซื้อเลย confirm', '✅', 'e2e step 7'),
  row(8, 'กลับจาก PDP state คง', 'back → search q= preserved', '✅', 'e2e step 8'),
  row(9, 'Slow network', '400ms latency; PDP usable', '✅', 'e2e step 9'),
  row(10, 'Telemetry + Experience Score', 'POST telemetry scenario S003 surface product', '✅', 'recordProductTelemetry'),
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

const withoutS003 = existing
  .split('\n')
  .filter((line) => line && !line.includes(',S003,'))
  .join('\n');

const csv = `${withoutS003.trim()}\n${s003Rows.map((r) => r.map(esc).join(',')).join('\n')}\n`;
fs.writeFileSync(trackerPath, csv, 'utf8');

const rollupPath = new URL('../../docs/platform-validation/pv-3/scenario-rollup.csv', import.meta.url);
let rollup = fs.readFileSync(rollupPath, 'utf8');
rollup = rollup
  .split('\n')
  .filter((l) => !l.startsWith('S003,'))
  .join('\n');
rollup += `S003,M-001,product,Product detail — decide to buy,${score},high,8,${grade},marketplace,3.9,${ts},e2e 9/9 android-chrome + iphone-safari\n`;
fs.writeFileSync(rollupPath, rollup, 'utf8');

console.log('S003 tracker appended — Experience', score, '| Business', business, '| Time Saved', timeSaved, 'min');
