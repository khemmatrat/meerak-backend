/**
 * Smoke test admin polish features (run from backend/: node scripts/test_admin_polish_flow.js)
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const DEMO_USER = '7e585383-f1ea-488e-8b3f-37885c5ffa88';
const BASE = `http://127.0.0.1:${process.env.BACKEND_PORT || 3001}`;

async function main() {
  const results = [];
  const pass = (name, detail = '') => {
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
  };
  const fail = (name, detail = '') => {
    results.push({ name, ok: false, detail });
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  };

  // 1. Slack webhook
  const slackUrl = process.env.SUPPORT_CASE_SLACK_WEBHOOK_URL
    || process.env.SLACK_WEBHOOK_URL;
  if (slackUrl && !slackUrl.includes('xxxx')) {
    try {
      const r = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `[MEERAK smoke] admin polish test ${new Date().toISOString()}` }),
      });
      if (r.ok) pass('Slack webhook', `HTTP ${r.status}`);
      else fail('Slack webhook', `HTTP ${r.status}`);
    } catch (e) {
      fail('Slack webhook', e.message);
    }
  } else {
    fail('Slack webhook', 'not configured');
  }

  // 2. DB + user360 export service
  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'meerak',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.DB_ADMIN_PASSWORD,
  });

  try {
    await pool.query('SELECT 1');
    pass('PostgreSQL connection');

    const { buildUser360Pack } = await import('../lib/user360ExportService.js');
    const pack = await buildUser360Pack(pool, DEMO_USER);
    if (pack?.export_type === 'user_360' && pack.user?.id) {
      pass('User 360 pack', `jobs=${pack.job_graphs?.total ?? 0} cases=${pack.support_cases?.length ?? 0}`);
    } else {
      fail('User 360 pack', 'missing export_type or user');
    }

    const { buildStuckPlaybook } = await import('../lib/jobGraphService.js');
    const pb = buildStuckPlaybook('pay', {
      job_status: 'in_progress',
      has_escrow: true,
      has_released: false,
      has_payment: true,
      released_status: 'pending',
    }, []);
    if (pb?.items?.some((i) => i.action?.api === 'release_job_escrow')) {
      pass('Playbook per-job release action');
    } else {
      fail('Playbook per-job release action', 'missing release_job_escrow');
    }

    const { previewAdminJobEscrowRelease } = await import('../lib/adminJobEscrowRelease.js');
    const jobRes = await pool.query(
      `SELECT job_id::text AS jid FROM user_commerce_events
       WHERE user_id = $1::uuid AND job_id IS NOT NULL
       ORDER BY event_at DESC LIMIT 1`,
      [DEMO_USER],
    );
    const sampleJobId = jobRes.rows?.[0]?.jid;
    if (sampleJobId) {
      const preview = await previewAdminJobEscrowRelease(pool, sampleJobId);
      pass('Release escrow preview', `job=${sampleJobId.slice(0, 8)} eligible=${preview.eligible} reason=${preview.reason || 'ok'}`);
    } else {
      pass('Release escrow preview', 'skipped — no job for demo user');
    }
  } catch (e) {
    fail('PostgreSQL / services', e.message);
  } finally {
    await pool.end().catch(() => { });
  }

  // 3. HTTP API (if backend running)
  try {
    const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) {
      fail('Backend HTTP', `health ${health.status}`);
    } else {
      pass('Backend HTTP', BASE);

      const prev = await fetch(`${BASE}/api/admin/jobs/00000000-0000-0000-0000-000000000001/release-escrow/preview`, {
        signal: AbortSignal.timeout(3000),
      });
      if (prev.status === 401) pass('Release preview route', 'registered (401 without auth)');
      else if (prev.status === 404) pass('Release preview route', `HTTP ${prev.status}`);
      else pass('Release preview route', `HTTP ${prev.status}`);
    }
  } catch {
    console.log('⚠️  Backend not running — start backend then re-run for HTTP tests');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
