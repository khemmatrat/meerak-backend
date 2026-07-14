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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testDefaultJsonContract() {
  const raw = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf8'));
  assert(raw.schema_version === 2, 'schema_version');
  assert(raw.max_pickup_radius_km === 12, 'radius');
  assert(raw.parcel_fallback_enabled === true, 'parcel fallback flag');
  assert(Array.isArray(raw.provinces) && raw.provinces.length === 15, 'provinces');

  const phase1 = raw.provinces.filter((p) => p.rollout_phase === 1);
  const phase2 = raw.provinces.filter((p) => p.rollout_phase === 2);
  assert(phase1.length === 5, 'phase1 count');
  assert(phase2.length === 10, 'phase2 count');
  assert(phase1.every((p) => p.express_enabled), 'phase1 express');
  assert(phase2.every((p) => !p.express_enabled), 'phase2 no express');
  assert(phase2.every((p) => p.parcel_fallback), 'phase2 parcel fallback');

  const caps = raw.capabilities || {};
  assert(caps.local_delivery?.enabled === true, 'local_delivery capability');
  assert(caps.express_rider?.enabled === true, 'express_rider capability');
  assert(caps.parcel_fallback?.enabled === true, 'parcel_fallback capability');
  assert(caps.food_rider?.enabled === false, 'food_rider disabled by default');

  const priorities = raw.matching?.sort_priority ?? [];
  assert(priorities[0] === 'distance_km', 'matching priority 1');
  assert(priorities.length === 5, 'matching priority count');
}

function testEnvPathOverrideShape() {
  const raw = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf8'));
  raw.max_pickup_radius_km = 9;
  const tmp = path.join(import.meta.dirname, '.tmp-delivery-config-test.json');
  fs.writeFileSync(tmp, JSON.stringify(raw));
  try {
    const loaded = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    assert(loaded.max_pickup_radius_km === 9, 'override radius');
  } finally {
    fs.unlinkSync(tmp);
  }
}

testDefaultJsonContract();
testEnvPathOverrideShape();
console.log(JSON.stringify({ suite: 'delivery-core-config', status: 'PASS', tests: 2 }, null, 2));
