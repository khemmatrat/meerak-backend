#!/usr/bin/env node
/**
 * RR1-4 — Food OS monitoring probe (run via cron / Task Scheduler).
 * Alerts when thresholds breached. Set FOOD_MONITOR_WEBHOOK for Slack/PagerDuty.
 *
 *   node scripts/food-os-monitor.mjs
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';
const WEBHOOK = process.env.FOOD_MONITOR_WEBHOOK || '';
const PENDING_WARN = Number(process.env.FOOD_OUTBOX_PENDING_WARN || 100);
const PENDING_CRIT = Number(process.env.FOOD_OUTBOX_PENDING_CRIT || 250);
const DLQ_CRIT = Number(process.env.FOOD_DLQ_CRIT || 1);

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function alert(severity, title, body) {
  const msg = `[${severity}] ${title}\n${body}`;
  console.error(msg);
  if (!WEBHOOK) return;
  await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: msg, severity, title, body }),
  }).catch((e) => console.error('webhook failed', e.message));
}

async function main() {
  const checks = [];
  let failed = false;

  const health = await fetchJson(`${BASE}/api/admin/food/orders?admin_key=${ADMIN_KEY}&limit=1`);
  checks.push({
    name: 'health_admin_orders',
    pass: health.ok,
    status: health.status,
  });
  if (!health.ok) {
    failed = true;
    await alert('CRITICAL', 'food_health_check_failed', `admin orders HTTP ${health.status}`);
  }

  const metrics = await fetchJson(`${BASE}/api/admin/events/metrics?admin_key=${ADMIN_KEY}`);
  checks.push({ name: 'health_metrics', pass: metrics.ok, status: metrics.status });
  if (!metrics.ok) {
    failed = true;
    await alert('CRITICAL', 'food_metrics_unreachable', `metrics HTTP ${metrics.status}`);
  } else {
    const pending = metrics.data.outbox?.counts?.pending ?? 0;
    const dlq = metrics.data.dlq?.total ?? 0;
    checks.push({ name: 'outbox_pending', value: pending, warn: PENDING_WARN, crit: PENDING_CRIT });
    checks.push({ name: 'dlq_total', value: dlq, crit: DLQ_CRIT });

    if (dlq > 0) {
      failed = true;
      await alert('CRITICAL', 'food_outbox_dlq_nonzero', `dlq.total=${dlq}`);
    }
    if (pending >= PENDING_CRIT) {
      failed = true;
      await alert('CRITICAL', 'food_outbox_pending_high', `pending=${pending}`);
    } else if (pending >= PENDING_WARN) {
      await alert('WARNING', 'food_outbox_pending_elevated', `pending=${pending}`);
    }
  }

  const replay = await fetchJson(`${BASE}/api/admin/events/replay?admin_key=${ADMIN_KEY}`, { method: 'POST' });
  checks.push({
    name: 'replay_smoke',
    pass: replay.ok && replay.data.ok !== false,
    status: replay.status,
    processed: replay.data.processed,
  });
  if (!replay.ok || replay.data.ok === false) {
    failed = true;
    await alert('CRITICAL', 'food_replay_failed', JSON.stringify(replay.data).slice(0, 500));
  }

  const out = {
    executed_at: new Date().toISOString(),
    base: BASE,
    webhook_configured: !!WEBHOOK,
    checks,
    pass: !failed,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  await alert('CRITICAL', 'food_monitor_crash', e.message);
  process.exit(1);
});
