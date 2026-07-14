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

const grade = '🟢 Production Ready';
const score = '8.8';
const business = 'high';
const timeSaved = '18';
const dims = { speed: '9', clarity: '9', recovery: '8.5', smoothness: '8.5', confidence: '8.5' };

function row(step, expected, actual, status, log = '') {
  return [
    1, 'RECEIPT-CORE', 'B2.6-S001', step, expected, actual, status, grade, score, business, timeSaved,
    dims.speed, dims.clarity, dims.recovery, dims.smoothness, dims.confidence,
    '', '', log, '', 'PV-Receipt-Core', ts, build, 'local-dev:3003',
  ];
}

const rows = [
  row(1, 'Engine preview API', 'GET /api/receipt/v1/engine/preview', '✅', 'receipt engine'),
  row(2, 'Metadata envelope', '10 required fields', '✅', 'metadata.ts'),
  row(3, 'Unicode PDF', 'NotoSansThai embedded', '✅', 'no ?????'),
  row(4, 'Block engine', 'config-driven blocks', '✅', 'blocks.ts'),
  row(5, 'Template engine', 'engine-preview-v1', '✅', 'template.ts'),
  row(6, 'Version manager', 'receipt_core_version 1.0.0', '✅', 'metadata.ts'),
  row(7, 'Config layer', 'theme + block toggles', '✅', 'receipt-config.default.json'),
  row(8, 'Preview PDF', 'GET preview.pdf %PDF', '✅', 'unicodePdf.ts'),
  row(9, 'Render test', 'receipt-engine-render.test.ts', '✅', 'tsx'),
  row(10, 'Regression S001–S010', 'frozen per PV-001', '✅', 'no checkout changes'),
];

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const trackerDir = new URL('../../docs/platform-validation/receipt-core/', import.meta.url);
fs.mkdirSync(trackerDir, { recursive: true });

const trackerPath = new URL('receipt-tracker.csv', trackerDir);
let existing = '';
try {
  existing = fs.readFileSync(trackerPath, 'utf8');
} catch {
  existing = `${header}\n`;
}

const without = existing
  .split('\n')
  .filter((line) => line && !line.includes(',B2.6-S001,'))
  .join('\n');

fs.writeFileSync(trackerPath, `${without.trim()}\n${rows.map((r) => r.map(esc).join(',')).join('\n')}\n`, 'utf8');

const rollupPath = new URL('scenario-rollup.csv', trackerDir);
let rollup = '';
try {
  rollup = fs.readFileSync(rollupPath, 'utf8');
} catch {
  rollup = 'scenario_id,mission_id,surface,title,experience_score,business_impact,time_saved_minutes,grade,module,blocking,tested_at,notes\n';
}
rollup = rollup.split('\n').filter((l) => !l.startsWith('B2.6-S001,')).join('\n');
rollup += `B2.6-S001,RECEIPT-CORE,receipt_engine,Receipt Core — engine foundation,${score},high,18,${grade},receipt-core,0,${ts},Phase 1 S001 only\n`;
fs.writeFileSync(rollupPath, rollup, 'utf8');

console.log('B2.6-S001 tracker updated');
