import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { composeIncubationOverlay, getOverlayTemplate } from '../lib/incubationCompose.js';

const tmp = process.argv[2];
if (!tmp) {
  console.error('Usage: node scripts/test-incubation-compose.mjs <dir-with-in.mp4>');
  process.exit(1);
}

const inPath = path.join(tmp, 'in.mp4');
if (!fs.existsSync(inPath)) {
  console.error('Missing', inPath);
  process.exit(1);
}

const buf = fs.readFileSync(inPath);
const tpl = getOverlayTemplate('pro_hire');
const r = await composeIncubationOverlay({
  inputBuffer: buf,
  template: tpl,
  headline: 'ช่างมืออาชีพ',
  subtitle: 'รับงานวันนี้',
  cta: 'จ้างงานคนนี้วันนี้ — ลด 20%',
  weekNo: 1,
});

console.log(JSON.stringify({ skipped: r.skippedOverlay, reason: r.reason, error: r.error, meta: r.meta }, null, 2));

if (!r.skippedOverlay) {
  const outPath = path.join(tmp, 'composed.mp4');
  fs.writeFileSync(outPath, r.buffer);
  console.log('OK ->', outPath);
}
