import fs from 'node:fs';
import path from 'node:path';

const defaultJsonPath = path.join(
  import.meta.dirname,
  '..',
  'packages',
  'delivery-core',
  'config',
  'delivery-config.default.json',
);

const INITIAL_EN = [
  'Bangkok',
  'Nonthaburi',
  'Pathum Thani',
  'Samut Prakan',
  'Samut Sakhon',
  'Phuket',
  'Krabi',
  'Chiang Mai',
  'Nakhon Ratchasima',
  'Khon Kaen',
  'Surat Thani',
  'Hat Yai',
  'Ratchaburi',
  'Chonburi',
  'Rayong',
];

function norm(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, '');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testProvinceRolloutJson() {
  const raw = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf8'));
  assert(raw.schema_version === 2, 'schema_version 2');
  assert(raw.max_pickup_radius_km === 12, 'radius 12');
  assert(Array.isArray(raw.provinces), 'provinces array');

  const enabled = raw.provinces.filter((p) => p.enabled);
  assert(enabled.length === 15, `15 enabled provinces, got ${enabled.length}`);

  const names = new Set(enabled.map((p) => norm(p.name_en)));
  const aliases = new Set(
    enabled.filter((p) => p.alias_en).map((p) => norm(p.alias_en)),
  );

  for (const name of INITIAL_EN) {
    const key = norm(name);
    assert(names.has(key) || aliases.has(key), `missing enabled province: ${name}`);
  }

  const hatYai = raw.provinces.find((p) => norm(p.alias_en || '') === norm('Hat Yai'));
  assert(hatYai?.province_code === '90', 'Hat Yai alias on Songkhla');
  assert(hatYai?.enabled === true, 'Hat Yai/Songkhla enabled');
}

function testExpressFlagsByRollout() {
  const raw = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf8'));
  const phase1 = raw.provinces.filter((p) => p.rollout_phase === 1);
  const phase2 = raw.provinces.filter((p) => p.rollout_phase === 2);
  assert(phase1.every((p) => p.enabled && p.express_enabled), 'phase1 express');
  assert(phase2.every((p) => p.enabled && !p.express_enabled), 'phase2 no express yet');
}

testProvinceRolloutJson();
testExpressFlagsByRollout();

console.log(
  JSON.stringify({ suite: 'delivery-province-config', status: 'PASS', tests: 2 }, null, 2),
);
