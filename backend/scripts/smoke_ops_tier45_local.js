/**
 * Tier 4 + 5 localhost smoke — lib + authenticated HTTP
 * Usage: cd backend && node scripts/smoke_ops_tier45_local.js
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { signAdminAccessToken } from '../lib/adminSecurity.js';

dotenv.config();

const DEMO_USER = process.env.SMOKE_USER_ID || '7e585383-f1ea-488e-8b3f-37885c5ffa88';
const BASE = `http://127.0.0.1:${process.env.BACKEND_PORT || 3001}`;
const JWT_SECRET = process.env.JWT_SECRET;

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

async function adminToken() {
  if (!JWT_SECRET) return null;
  let u = null;
  const r = await pool.query(
    `SELECT id, email, role FROM users
     WHERE UPPER(COALESCE(role, '')) IN ('ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'AUDITOR', 'DEVELOPER')
     ORDER BY created_at ASC LIMIT 1`,
  ).catch(() => ({ rows: [] }));
  u = r.rows?.[0];
  if (!u) {
    const r2 = await pool.query(
      `SELECT u.id, u.email, ur.role
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       WHERE UPPER(ur.role) IN ('ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'AUDITOR', 'DEVELOPER')
       LIMIT 1`,
    ).catch(() => ({ rows: [] }));
    u = r2.rows?.[0];
  }
  if (!u) {
    const dev = await pool.query(
      `SELECT id, email FROM users WHERE email ILIKE '%admin%' ORDER BY created_at ASC LIMIT 1`,
    ).catch(() => ({ rows: [] }));
    u = dev.rows?.[0];
    if (!u) return null;
    return {
      token: signAdminAccessToken(
        { id: u.id, role: 'ADMIN', email: u.email, permissions: [] },
        JWT_SECRET,
        false,
      ),
      email: `${u.email} (smoke ADMIN JWT)`,
    };
  }
  const role = String(u.role || 'ADMIN').toUpperCase();
  return {
    token: signAdminAccessToken(
      { id: u.id, role, email: u.email, permissions: [] },
      JWT_SECRET,
      false,
    ),
    email: u.email,
  };
}

async function authFetch(path, token, opts = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
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

  // --- Tier 5.1 batch reconcile ---
  try {
    const { batchReconcileSnapshots, isListReconcileEnabled } = await import('../lib/batchReconcileListService.js');
    if (!isListReconcileEnabled({})) fail(results, 'Reconcile snapshot enabled');
    else pass(results, 'Reconcile snapshot enabled');
    const snap = await batchReconcileSnapshots(pool, [DEMO_USER]);
    const row = snap.get(DEMO_USER);
    if (row?.reconcile_status && ['pass', 'warn', 'skip'].includes(row.reconcile_status)) {
      pass(results, 'Batch reconcile snapshot', `${row.reconcile_status} verdict=${row.reconcile_verdict || '—'}`);
    } else {
      fail(results, 'Batch reconcile snapshot', 'invalid shape');
    }
  } catch (e) {
    fail(results, 'Batch reconcile snapshot', e.message);
  }

  // --- Tier 4.1 users list + reconcile snapshot ---
  try {
    const { fetchAdminUsersList } = await import('../lib/adminUsersListService.js');
    const list = await fetchAdminUsersList(pool, { limit: 5, include_reconcile: '1' });
    if (!list?.users?.length) {
      fail(results, 'Users list service', 'empty');
    } else {
      const withRc = list.users.filter((u) => u.reconcile_status);
      pass(
        results,
        'Users list + reconcile',
        `${list.users.length} users, ${withRc.length} with RC snapshot`,
      );
    }
    const ops = await fetchAdminUsersList(pool, { ops_attention: '1', limit: 10 });
    pass(results, 'Ops attention filter', `total=${ops.pagination?.total ?? 0}`);
  } catch (e) {
    fail(results, 'Users list service', e.message);
  }

  // --- Tier 5 ops queue CSV ---
  try {
    const { exportOpsQueueCsv } = await import('../lib/adminUsersListService.js');
    const csv = await exportOpsQueueCsv(pool, { limit: 20 });
    const lines = csv.trim().split('\n');
    if (lines[0]?.includes('reconcile_status') && lines.length >= 1) {
      pass(results, 'Ops queue CSV export', `${lines.length - 1} data rows`);
    } else {
      fail(results, 'Ops queue CSV export', 'bad header');
    }
  } catch (e) {
    fail(results, 'Ops queue CSV export', e.message);
  }

  // --- Tier 4.4 SLA nudge ---
  try {
    const { runSupportCaseSlaNudge } = await import('../lib/supportCaseSlaNudge.js');
    const r = await runSupportCaseSlaNudge(pool, { force: false });
    pass(results, 'SLA nudge service', r.sent ? 'sent' : (r.reason || 'deduped/skip'));
  } catch (e) {
    fail(results, 'SLA nudge service', e.message);
  }

  // --- Tier 4.3 / 5.3 Ops digest ---
  try {
    const { sendOpsWeeklyDigest } = await import('../lib/opsWeeklyDigest.js');
    const r = await sendOpsWeeklyDigest(pool, { force: false });
    const detail = r.sent
      ? `slack=${r.slack_sent} email=${r.email_sent}`
      : (r.reason || 'deduped');
    pass(results, 'Ops weekly digest', detail);
  } catch (e) {
    fail(results, 'Ops weekly digest', e.message);
  }

  // --- Tier 5.2 Partner quota suspend (dry) ---
  try {
    const {
      isPartnerQuotaAutoSuspendEnabled,
      getPartnerQuotaSuspendMinDays,
      maybeAutoSuspendPartnerKeyOnQuota,
    } = await import('../lib/partnerApiQuotaSuspend.js');
    pass(
      results,
      'Partner quota suspend config',
      `enabled=${isPartnerQuotaAutoSuspendEnabled()} min_days=${getPartnerQuotaSuspendMinDays()}`,
    );
    const keyRes = await pool.query(
      `SELECT id, name FROM partner_api_keys WHERE is_active = true LIMIT 1`,
    ).catch(() => ({ rows: [] }));
    if (keyRes.rows?.[0]) {
      const r = await maybeAutoSuspendPartnerKeyOnQuota(pool, keyRes.rows[0], {
        weekly_quota: 100,
        weekly_used: 100,
      });
      pass(results, 'Partner quota suspend dry-run', r.reason || (r.suspended ? 'suspended' : 'ok'));
    } else {
      pass(results, 'Partner quota suspend dry-run', 'skipped — no active key');
    }
  } catch (e) {
    fail(results, 'Partner quota suspend', e.message);
  }

  // --- Tier 3 carry-over ---
  try {
    const { getAutoAssignConfig } = await import('../lib/supportCaseAutoAssign.js');
    const cfg = getAutoAssignConfig();
    pass(results, 'Auto-assign config', `enabled=${cfg.enabled} rr=${cfg.round_robin.length}`);
  } catch (e) {
    fail(results, 'Auto-assign config', e.message);
  }

  try {
    const { buildSupportCaseSla } = await import('../lib/supportCaseSlaService.js');
    const sla = await buildSupportCaseSla(pool);
    pass(results, 'Support case SLA', `open=${sla.counts?.open_total ?? '?'}`);
  } catch (e) {
    fail(results, 'Support case SLA', e.message);
  }

  // --- HTTP (backend must be running with latest code) ---
  let tokenPack = null;
  try {
    const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) {
      fail(results, 'Backend HTTP', `health ${health.status}`);
    } else {
      pass(results, 'Backend HTTP', BASE);
      tokenPack = await adminToken();
      if (!tokenPack) fail(results, 'Admin JWT', 'no admin user or JWT_SECRET');
      else pass(results, 'Admin JWT', tokenPack.email);
    }
  } catch (e) {
    fail(results, 'Backend HTTP', `down — restart backend: ${e.message}`);
  }

  const routeChecks = [
    ['GET', '/api/admin/users?limit=3', 'Users list API'],
    ['GET', '/api/admin/users?ops_attention=1&limit=5', 'Ops attention API'],
    ['GET', '/api/admin/users/ops-queue/export.csv?limit=10', 'Ops queue CSV route'],
    ['GET', '/api/admin/support-cases/sla', 'Support SLA API'],
    ['GET', '/api/admin/support-cases/auto-assign/status', 'Auto-assign status'],
    ['POST', '/api/admin/cron/support-case-sla-nudge/run', 'SLA nudge cron route'],
    ['POST', '/api/admin/cron/ops-weekly-digest/run', 'Ops digest cron route'],
  ];

  if (tokenPack?.token) {
    for (const [method, path, label] of routeChecks) {
      try {
        const r = await authFetch(path, tokenPack.token, {
          method,
          headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
          body: method === 'POST' ? JSON.stringify({ force: false }) : undefined,
        });
        if (r.status === 404) fail(results, label, '404 — restart backend with new code');
        else if (r.status >= 500) fail(results, label, `HTTP ${r.status}`);
        else pass(results, label, `HTTP ${r.status}`);
      } catch (e) {
        fail(results, label, e.message);
      }
    }

    // Users list reconcile fields
    try {
      const r = await authFetch('/api/admin/users?limit=5', tokenPack.token);
      const j = await r.json();
      const rc = (j.users || []).filter((u) => u.reconcile_status);
      if (r.ok && j.users?.length) {
        pass(results, 'HTTP users reconcile_snapshot', `${rc.length}/${j.users.length} have reconcile_status`);
      } else {
        fail(results, 'HTTP users reconcile_snapshot', `HTTP ${r.status}`);
      }
    } catch (e) {
      fail(results, 'HTTP users reconcile_snapshot', e.message);
    }

    // CSV content-type
    try {
      const r = await authFetch('/api/admin/users/ops-queue/export.csv?limit=5', tokenPack.token);
      const ct = r.headers.get('content-type') || '';
      const text = await r.text();
      if (r.ok && ct.includes('csv') && text.includes('user_id')) {
        pass(results, 'HTTP ops CSV body', `${text.split('\n').length - 1} rows`);
      } else {
        fail(results, 'HTTP ops CSV body', `HTTP ${r.status} ct=${ct}`);
      }
    } catch (e) {
      fail(results, 'HTTP ops CSV body', e.message);
    }
  } else {
    for (const [method, path, label] of routeChecks) {
      try {
        const r = await fetch(`${BASE}${path}`, {
          method,
          headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
          body: method === 'POST' ? JSON.stringify({ force: false }) : undefined,
          signal: AbortSignal.timeout(5000),
        });
        if (r.status === 401) pass(results, `${label} (no auth)`, '401 registered');
        else if (r.status === 404) fail(results, label, '404 — restart backend');
        else pass(results, `${label} (no auth)`, `HTTP ${r.status}`);
      } catch (e) {
        fail(results, label, e.message);
      }
    }
  }

  const failed = results.filter((x) => !x.ok);
  const ok = results.length - failed.length;
  console.log(`\n--- ${ok}/${results.length} passed ---`);
  if (failed.length) {
    console.log('Failed:', failed.map((f) => f.name).join(', '));
  }
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
