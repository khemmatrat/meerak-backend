import fs from 'node:fs';
import path from 'node:path';

const configPath = path.join(
  import.meta.dirname,
  '..',
  'packages',
  'return-core',
  'config',
  'return-config.default.json',
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testConfig() {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(raw.mission_id === 'RETURN-REFUND-CORE', 'mission_id');
  assert(raw.escrow.rewrite_allowed === false, 'escrow adapter only');
  assert(raw.auto_refund_policy.rules.length === 2, 'auto refund rules');
  assert(raw.order_tabs.includes('must_receive'), 'must_receive tab');
  assert(raw.order_tabs.includes('refund'), 'refund tab');
  assert(raw.capabilities.return_request.phase === 1, 'return phase 1');
  assert(raw.capabilities.return_request.enabled === true, 'return_request enabled S001');
  assert(raw.capabilities.refund_request.enabled === true, 'refund_request enabled S002');
  assert(raw.capabilities.escrow_refund.enabled === true, 'escrow_refund enabled S003');
  assert(raw.return_methods.home_pickup.provider === 'aqond_pickup', 'pickup provider');
}

testConfig();
console.log(JSON.stringify({ suite: 'return-core-config', status: 'PASS', phase: 0 }, null, 2));
