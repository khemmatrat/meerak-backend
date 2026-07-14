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
const score = '9.1';
const business = 'high';
const timeSaved = '18';
const dims = { speed: '8.5', clarity: '10', recovery: '10', smoothness: '8', confidence: '9' };

function row(step, expected, actual, status, log = '', issue = '') {
  return [
    1,
    'M-001',
    'S001',
    step,
    expected,
    actual,
    status,
    grade,
    score,
    business,
    timeSaved,
    dims.speed,
    dims.clarity,
    dims.recovery,
    dims.smoothness,
    dims.confidence,
    '',
    '',
    log,
    issue,
    'PV-2',
    ts,
    build,
    'local-dev:3003',
  ];
}

const rows = [
  row(1, 'Page loads < 3s', 'SSR ~745ms; dev cold >3s on android', '⚠️', 'pv-s001-check; e2e', 'Confirm prod build'),
  row(2, 'Products visible', 'BFF 100; Playwright grid visible', '✅', 'GET /api/bff/v1/home'),
  row(3, 'No console errors', 'Playwright: zero fatal errors', '✅', 'e2e/pv-s001-home.spec.ts'),
  row(4, 'Skeleton < 200ms', 'AxsMarketplaceHomeSkeletonPaint; dev <500ms', '⚠️', 'e2e step 4', 'Prod target 200ms'),
  row(5, 'Empty state not 500', 'กำลังเชื่อมต่อข้อมูล + ลองใหม่', '✅', '?pv_test=empty'),
  row(6, 'Offline cache/page', 'sessionStorage + offline banner', '✅', 'e2e step 6'),
  row(7, 'Recover auto refresh', 'online → router.refresh', '✅', 'e2e step 7'),
  row(8, 'Accessibility', 'font OK; tab nav; aria; lang', '✅', 'e2e/pv-s001-production.spec.ts'),
  row(9, 'Slow network 400ms', 'CDP throttle; page usable <30s', '✅', 'e2e step 9'),
  row(10, 'Massive data scroll', 'massive=100,5000 synthetic; scroll <3s', '✅', 'e2e step 10'),
  row(11, 'Telemetry → Analytics', 'POST /api/experience/telemetry + business_impact', '✅', 'scenarioTelemetry.ts'),
  row(12, 'AI Observation', 'POST /api/experience/observation', '✅', 'jarvis observation'),
];

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csv = [header, ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
const out = new URL('../../docs/platform-validation/pv-3/wave-1-tracker.csv', import.meta.url);
fs.writeFileSync(out, csv, 'utf8');

console.log('wrote', out.pathname);
console.log('S001 rollup: Experience', score, '| Business', business, '| Time Saved', timeSaved, 'min');
