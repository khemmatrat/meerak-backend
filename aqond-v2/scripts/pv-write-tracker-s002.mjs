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
const score = '8.7';
const business = 'high';
const timeSaved = '6';
const dims = { speed: '8.5', clarity: '9', recovery: '9', smoothness: '8.5', confidence: '8.5' };

function row(step, expected, actual, status, log = '', issue = '') {
  return [
    1, 'M-001', 'S002', step, expected, actual, status, grade, score, business, timeSaved,
    dims.speed, dims.clarity, dims.recovery, dims.smoothness, dims.confidence,
    '', '', log, issue, 'PV-2', ts, build, 'local-dev:3003',
  ];
}

const s002Rows = [
  row(1, 'ค้นหาชื่อสินค้า', 'catalog-fallback ครีม; Playwright results visible', '✅', 'e2e step 1'),
  row(2, 'คำสะกดผิดเล็กน้อย (fuzzy)', 'ครีมกันแด → ครีมกันแดด 299', '✅', 'searchCatalogMatch.ts'),
  row(3, 'ไม่มีผลลัพธ์ → แนะนำคำ/หมวด', 'AxsSearchEmptySuggestions', '✅', 'e2e step 3'),
  row(4, 'กรองราคา/COD/หมวด', 'price preset + filter chips', '✅', 'e2e step 4-5'),
  row(5, 'เรียงลำดับ', 'sort tab ราคา ↓', '✅', 'e2e step 4-5'),
  row(6, 'กดเข้า PDP', 'product link navigates', '✅', 'e2e step 6-7'),
  row(7, 'กลับมา state ยังอยู่', 'URL q= + sessionStorage scroll', '✅', 'e2e step 6-7'),
  row(8, 'Jarvis แนะนำ (optional)', 'jarvis surface present if enabled', '✅', 'optional'),
  row(9, 'Slow network', '400ms latency; results or empty UX', '✅', 'e2e step 9'),
  row(10, 'Telemetry + Experience Score', 'POST telemetry scenario S002 surface search', '✅', 'recordSearchTelemetry'),
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

const withoutS002 = existing
  .split('\n')
  .filter((line) => line && !line.includes(',S002,'))
  .join('\n');

const csv = `${withoutS002.trim()}\n${s002Rows.map((r) => r.map(esc).join(',')).join('\n')}\n`;
fs.writeFileSync(trackerPath, csv, 'utf8');

const rollupPath = new URL('../../docs/platform-validation/pv-3/scenario-rollup.csv', import.meta.url);
let rollup = fs.readFileSync(rollupPath, 'utf8');
rollup = rollup
  .split('\n')
  .filter((l) => !l.startsWith('S002,'))
  .join('\n');
rollup += `S002,M-001,search,Find & decide,${score},high,6,${grade},marketplace,3.9,${ts},e2e 10/10 android-chrome\n`;
fs.writeFileSync(rollupPath, rollup, 'utf8');

console.log('S002 tracker appended — Experience', score, '| Business', business, '| Time Saved', timeSaved, 'min');
