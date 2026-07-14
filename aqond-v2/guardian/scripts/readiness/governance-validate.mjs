#!/usr/bin/env node
/**
 * Phase 3.7 — Governance Validation (5 drills)
 *
 * Usage: node aqond-v2/guardian/scripts/readiness/governance-validate.mjs
 */
const GUARDIAN = (process.argv.includes('--guardian')
  ? process.argv[process.argv.indexOf('--guardian') + 1]
  : 'http://127.0.0.1:8200'
).replace(/\/$/, '');

async function post(path, body) {
  const res = await fetch(`${GUARDIAN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function get(path) {
  const res = await fetch(`${GUARDIAN}${path}`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Phase 3.7 Governance Validation — ${GUARDIAN}\n`);
  let failed = 0;

  const insider = await post('/guardian/v1/governance/insider-sim', {
    action: 'disable_audit',
    operator: 'admin-sim',
  });
  const insiderOk =
    insider.status === 200 &&
    insider.json?.data?.detected === true &&
    insider.json?.data?.policy_id;
  console.log(`${insiderOk ? 'PASS' : 'FAIL'} insider simulation → policy=${insider.json?.data?.policy_id}`);
  if (!insiderOk) failed += 1;

  const iso = await post('/guardian/v1/governance/tenant-check', {
    caller_tenant_id: 'restaurant-0001',
    target_service_id: 'food-v5-b',
  });
  const isoOk = iso.json?.data?.decision === 'deny' && iso.json?.data?.policy_id === 'P-3001';
  console.log(`${isoOk ? 'PASS' : 'FAIL'} tenant isolation A→B → ${iso.json?.data?.decision}`);
  if (!isoOk) failed += 1;

  const cert = await post('/guardian/v1/governance/cert-rotate', { count: 100 });
  const certOk = cert.json?.data?.rotated_count === 100 && cert.json?.data?.jarvis_disruption === false;
  console.log(`${certOk ? 'PASS' : 'FAIL'} cert rotation 100 → ${cert.json?.data?.duration_ms}ms`);
  if (!certOk) failed += 1;

  const dr = await post('/guardian/v1/governance/dr-failover', {
    primary_region: 'region-a',
    failover_region: 'region-b',
  });
  const drOk =
    dr.json?.data?.ok &&
    dr.json?.data?.bindings?.every((b) => b.ai_id_changed === false);
  console.log(`${drOk ? 'PASS' : 'FAIL'} DR failover AI_ID stable`);
  if (!drOk) failed += 1;

  const hitl = await get('/guardian/v1/governance/hitl-audit?sample_size=100');
  const hitlOk = hitl.json?.data?.pass === true && hitl.json?.data?.compliance_rate_pct === 100;
  console.log(`${hitlOk ? 'PASS' : 'FAIL'} HITL audit 100 samples → ${hitl.json?.data?.compliance_rate_pct}%`);
  if (!hitlOk) failed += 1;

  const resolve = await get('/guardian/v1/identity/resolve/jarvis-prod-01');
  const hierarchyOk =
    resolve.status === 200 &&
    resolve.json?.data?.tenant_id &&
    resolve.json?.data?.service_id;
  console.log(`${hierarchyOk ? 'PASS' : 'FAIL'} TENANT→SERVICE→AI resolve → ${resolve.json?.data?.tenant_id}/${resolve.json?.data?.service_id}`);
  if (!hierarchyOk) failed += 1;

  const enforce = await post('/guardian/v1/enforce', {
    agent_id: 'jarvis-prod-01',
    user_message: 'สวัสดี',
    trace_id: 'gov-policy-id-check',
  });
  const policyOk = enforce.json?.policy_id === 'P-1001' || enforce.json?.data?.policy_id === 'P-1001';
  console.log(`${policyOk ? 'PASS' : 'FAIL'} POLICY_ID on allow → ${enforce.json?.policy_id || enforce.json?.data?.policy_id}`);
  if (!policyOk) failed += 1;

  console.log(`\n${failed === 0 ? '✅' : '❌'} Governance ${7 - failed}/7`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
