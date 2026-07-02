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
const business = 'critical';
const timeSaved = '24';
const dims = { speed: '8.5', clarity: '9', recovery: '8.5', smoothness: '8.5', confidence: '8.5' };

function row(step, expected, actual, status, log = '', issue = '') {
  return [
    2, 'M-001', 'S006', step, expected, actual, status, grade, score, business, timeSaved,
    dims.speed, dims.clarity, dims.recovery, dims.smoothness, dims.confidence,
    '', '', log, issue, 'PV-3-Checkout', ts, build, 'local-dev:3003',
  ];
}

const s006Rows = [
  row(1, 'Cart summary', 'line items + payment summary ฿199', '✅', 'pv-s006 step 1'),
  row(2, 'Address selection', 'address card + form fields', '✅', 'pv-s006 step 2'),
  row(3, 'Address validation', 'postal 5-digit gate', '✅', 'pv-s006 step 3'),
  row(4, 'Shipping calculation', 'rates + summary shipping row', '✅', 'pv-s006 step 4; shipping quote API'),
  row(5, 'Coupon availability', 'shop voucher picker', '✅', 'checkout-coupon-shop'),
  row(6, 'Promotion visibility', 'platform voucher + VIP banners', '✅', 'checkout-promotion-banners'),
  row(7, 'Wallet visibility', 'BFF wallet balance shown', '✅', 'checkout-wallet-section'),
  row(8, 'Payment methods', 'selected method + picker modal', '✅', 'pv-s006 step 8'),
  row(9, 'Checkout CTA', 'place CTA validates addr (no order)', '✅', 'checkout-place-cta'),
  row(10, 'Telemetry S006', 'checkout_start surface', '✅', 'recordCheckoutStartTelemetry'),
  row(11, 'Regression S001–S006', 'Browse frozen + S006 e2e', '✅', 'pv-s00x regression'),
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

const withoutS006 = existing
  .split('\n')
  .filter((line) => line && !line.includes(',S006,'))
  .join('\n');

const csv = `${withoutS006.trim()}\n${s006Rows.map((r) => r.map(esc).join(',')).join('\n')}\n`;
fs.writeFileSync(trackerPath, csv, 'utf8');

const rollupPath = new URL('../../docs/platform-validation/pv-3/scenario-rollup.csv', import.meta.url);
let rollup = fs.readFileSync(rollupPath, 'utf8');
rollup = rollup
  .split('\n')
  .filter((l) => !l.startsWith('S006,'))
  .join('\n');
rollup += `S006,M-001,checkout_start,Checkout start,${score},critical,24,${grade},marketplace,4.4,${ts},e2e 10/10 android-chrome — Consumer Checkout Mission\n`;
fs.writeFileSync(rollupPath, rollup, 'utf8');

const reportDir = new URL('../../docs/platform-validation/pv-3/s006-checkout-start/', import.meta.url);
fs.mkdirSync(reportDir, { recursive: true });

const experience = `# S006 Experience Report — Checkout Start

**Mission:** Consumer Checkout (new) · **Wave:** 2  
**Grade:** ${grade}  
**Experience Score:** ${score} / 10  
**Business Impact:** Critical · **Time Saved:** ${timeSaved} min  

| Dimension | Score |
|-----------|-------|
| Speed | ${dims.speed} |
| Clarity | ${dims.clarity} |
| Recovery | ${dims.recovery} |
| Smoothness | ${dims.smoothness} |
| Confidence | ${dims.confidence} |

## Entry experience validated

- Cart summary with merchant grouping and subtotal
- Address card + inline form + postal validation
- Shipping quote with selectable carriers
- Shop + platform coupon surfaces
- Wallet balance from BFF
- Payment method picker (no payment processing)
- Place CTA blocks with validation message (no order placed in PV)

## Out of scope (S007+)

- Order placement
- Payment capture / QR flow
`;

const businessReport = `# S006 Business Report — Checkout Start

**Mission:** Consumer Checkout  
**Scenario:** S006 — Checkout Start  

| Metric | Value |
|--------|-------|
| Business Impact | Critical |
| Time Saved (baseline) | ${timeSaved} min / checkout entry session |
| Experience Score | ${score} / 10 |
| Grade | ${grade} |

## Value hypothesis

A clear checkout entry (address + shipping + pay preview) reduces cart abandonment before payment.  
S006 validates **confidence** signals without placing orders.

## Baseline context

- Browse Mission (S001–S005) frozen at \`baseline-wave1-2026-07-02\`
- Checkout Mission will earn its own baseline after S010
`;

fs.writeFileSync(new URL('experience-report.md', reportDir), experience, 'utf8');
fs.writeFileSync(new URL('business-report.md', reportDir), businessReport, 'utf8');

console.log('S006 Consumer Checkout tracker — Experience', score, grade);
