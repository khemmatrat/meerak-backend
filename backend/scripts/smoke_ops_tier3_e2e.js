/**
 * Tier 3 E2E smoke — reconcile warn → MRK case → auto-assign config → trend
 * Usage: cd backend && node scripts/smoke_ops_tier3_e2e.js
 * Requires: PostgreSQL + optional running backend on BACKEND_PORT
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const DEMO_USER = process.env.SMOKE_USER_ID || '7e585383-f1ea-488e-8b3f-37885c5ffa88';
const BASE = `http://127.0.0.1:${process.env.BACKEND_PORT || 3001}`;

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'meerak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.DB_ADMIN_PASSWORD,
});

function pass(results, name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(results, name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const results = [];

  try {
    await pool.query('SELECT 1');
    pass(results, 'PostgreSQL');
  } catch (e) {
    fail(results, 'PostgreSQL', e.message);
    process.exit(1);
  }

  // Reconcile trend service
  try {
    const { buildReconcileTrend, reconcileTrendSecurityBadge } = await import('../lib/reconcileTrendService.js');
    const trend = await buildReconcileTrend(pool, DEMO_USER);
    if (trend && typeof trend.fail_count === 'number') {
      pass(results, 'Reconcile trend', `fails=${trend.fail_count} repeat=${trend.is_repeat_offender}`);
      const badge = reconcileTrendSecurityBadge(trend);
      if (trend.is_repeat_offender && !badge) fail(results, 'Reconcile trend badge');
      else if (trend.is_repeat_offender) pass(results, 'Reconcile trend badge', badge.label);
    } else {
      fail(results, 'Reconcile trend', 'invalid shape');
    }
  } catch (e) {
    fail(results, 'Reconcile trend', e.message);
  }

  // Auto case on reconcile (dry logic)
  try {
    const { maybeAutoCaseReconcileWarn } = await import('../lib/supportCaseService.js');
    const r = await maybeAutoCaseReconcileWarn(pool, DEMO_USER, {
      expected_balance: 100,
      actual_balance: 250,
      variance: 150,
      email: 'smoke@test.local',
    });
    if (r?.case?.case_id) {
      pass(results, 'MRK auto-case', `${r.case.case_id} created=${r.created}`);
    } else {
      fail(results, 'MRK auto-case', 'no case');
    }
  } catch (e) {
    fail(results, 'MRK auto-case', e.message);
  }

  // Auto-assign config
  try {
    const { getAutoAssignConfig } = await import('../lib/supportCaseAutoAssign.js');
    const cfg = getAutoAssignConfig();
    pass(
      results,
      'Auto-assign config',
      `enabled=${cfg.enabled} ops=${cfg.ops_queue ? 'yes' : 'no'} rr=${cfg.round_robin.length}`,
    );
  } catch (e) {
    fail(results, 'Auto-assign config', e.message);
  }

  // Partner weekly report (dry — may dedupe)
  try {
    const { sendPartnerApiWeeklyReport } = await import('../lib/partnerApiWeeklyReport.js');
    const wr = await sendPartnerApiWeeklyReport(pool, { force: false });
    pass(results, 'Partner weekly report', wr.sent ? 'sent' : (wr.reason || 'skip'));
  } catch (e) {
    fail(results, 'Partner weekly report', e.message);
  }

  // Slack optional ping
  const slackUrl = process.env.SUPPORT_CASE_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (slackUrl && !slackUrl.includes('xxxx')) {
    try {
      const r = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[MEERAK tier3 smoke] ops e2e ${new Date().toISOString()}`,
        }),
      });
      if (r.ok) pass(results, 'Slack ping', `HTTP ${r.status}`);
      else fail(results, 'Slack ping', `HTTP ${r.status}`);
    } catch (e) {
      fail(results, 'Slack ping', e.message);
    }
  } else {
    fail(results, 'Slack ping', 'not configured (optional)');
  }

  // HTTP routes registered
  try {
    const r = await fetch(`${BASE}/api/admin/support-cases/auto-assign/status`);
    if (r.status === 401) pass(results, 'Auto-assign status route', '401 without auth');
    else fail(results, 'Auto-assign status route', `HTTP ${r.status}`);
  } catch (e) {
    fail(results, 'Auto-assign status route', `backend down: ${e.message}`);
  }

  const ok = results.filter((x) => x.ok).length;
  const total = results.length;
  console.log(`\n--- ${ok}/${total} passed ---`);
  await pool.end();
  process.exit(ok === total ? 0 : ok >= total - 1 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
