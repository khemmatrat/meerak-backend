import fs from 'node:fs';
import path from 'node:path';

const configPath = path.join(
  import.meta.dirname,
  '..',
  'packages',
  'receipt-core',
  'config',
  'receipt-config.default.json',
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testConfig() {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(raw.receipt_core_version === '1.0.0', 'receipt_core_version');
  assert(raw.theme.brand_title === 'AQOND', 'brand');
  assert(raw.blocks.verify.enabled === true, 'verify enabled S002/S003');
  assert(raw.blocks.jarvis_audit.enabled === true, 'jarvis enabled S004');
  assert(raw.templates['engine-preview-v1'].enabled === true, 'preview template');
  assert(raw.templates['marketplace-v1'].enabled === true, 'marketplace enabled S002');
}

testConfig();
console.log(JSON.stringify({ suite: 'receipt-engine-config', status: 'PASS', tests: 1 }, null, 2));
