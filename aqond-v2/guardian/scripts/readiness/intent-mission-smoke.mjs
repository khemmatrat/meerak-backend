#!/usr/bin/env node
/**
 * Phase 3.8 — Intent Layer + Mission Session smoke
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
  console.log(`Phase 3.8 Intent + Mission — ${GUARDIAN}\n`);
  let failed = 0;

  const intents = await get('/guardian/v1/intents');
  const intentsOk = intents.status === 200 && (intents.json?.data?.length || 0) >= 3;
  console.log(`${intentsOk ? 'PASS' : 'FAIL'} intent catalog → ${intents.json?.data?.length || 0} intents`);
  if (!intentsOk) failed += 1;

  const mission = await post('/guardian/v1/mission/create', {
    title: 'ช่วยจัดทริปเชียงใหม่ให้หน่อย',
    user_id: 'user-demo',
    ai_id: 'jarvis-prod-01',
  });
  const missionId = mission.json?.data?.mission_id;
  const missionOk = mission.status === 200 && missionId?.startsWith('mission-');
  console.log(`${missionOk ? 'PASS' : 'FAIL'} mission create → ${missionId}`);
  if (!missionOk) failed += 1;

  const auth = await post('/guardian/v1/intent/authorize', {
    user_message: 'หาร้านอาหารญี่ปุ่นใกล้ออฟฟิศ',
    ai_id: 'jarvis-prod-01',
    mission_id: missionId,
    trace_id: 'intent-smoke-1',
  });
  const authOk =
    auth.status === 200 &&
    auth.json?.data?.decision === 'allow' &&
    (auth.json?.data?.capabilities?.length || 0) >= 3;
  console.log(`${authOk ? 'PASS' : 'FAIL'} intent authorize find_restaurant → ${auth.json?.data?.capabilities?.length} caps`);
  if (!authOk) failed += 1;

  const order = await post('/guardian/v1/intent/authorize', {
    intent_id: 'intent.place_food_order',
    ai_id: 'jarvis-prod-01',
    mission_id: missionId,
  });
  const orderOk =
    order.json?.data?.decision === 'allow' &&
    order.json?.data?.hitl_before_pay === true &&
    order.json?.data?.capabilities?.some((c) => c.hitl_required);
  console.log(`${orderOk ? 'PASS' : 'FAIL'} intent place_food_order + HITL cap`);
  if (!orderOk) failed += 1;

  const timeline = await get(`/guardian/v1/mission/${missionId}/timeline`);
  const timelineOk =
    timeline.status === 200 &&
    (timeline.json?.data?.timeline?.length || 0) >= 2;
  console.log(`${timelineOk ? 'PASS' : 'FAIL'} mission timeline → ${timeline.json?.data?.timeline?.length} events`);
  if (!timelineOk) failed += 1;

  console.log(`\n${failed === 0 ? '✅' : '❌'} Intent+Mission ${5 - failed}/5`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
