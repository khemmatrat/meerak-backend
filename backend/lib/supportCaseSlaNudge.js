/**
 * SLA breach nudge — Slack ping for stale / unassigned urgent cases (Tier 4.4).
 * Env: SUPPORT_CASE_SLACK_WEBHOOK_URL, SUPPORT_CASE_OPS_QUEUE (mention in text)
 * Dedupe: support_case_sla_nudge_log (per case per day)
 */
import { buildSupportCaseSla } from './supportCaseSlaService.js';

function resolveWebhookUrl() {
  const urls = [
    process.env.SUPPORT_CASE_SLACK_WEBHOOK_URL,
    process.env.SUPPORT_SLACK_WEBHOOK_URL,
    process.env.SLACK_WEBHOOK_URL,
  ];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (url && !url.includes('xxxx')) return url;
  }
  return null;
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_case_sla_nudge_log (
      id BIGSERIAL PRIMARY KEY,
      nudge_key TEXT NOT NULL UNIQUE,
      case_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      http_status INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
}

async function postSlack(text) {
  const url = resolveWebhookUrl();
  if (!url) return { sent: false, reason: 'no_webhook' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 3900) }),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e?.message };
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ force?: boolean }} opts
 */
export async function runSupportCaseSlaNudge(pool, opts = {}) {
  const hook = resolveWebhookUrl();
  if (!hook) return { sent: 0, skipped: 0, reason: 'no_webhook' };

  const sla = await buildSupportCaseSla(pool);
  const day = new Date().toISOString().slice(0, 10);
  const opsQueue = String(process.env.SUPPORT_CASE_OPS_QUEUE || '').trim();
  const adminBase = String(process.env.ADMIN_APP_URL || '').replace(/\/$/, '');

  const targets = [
    ...(sla.stale_open_cases || []).map((c) => ({ ...c, kind: 'stale_24h' })),
    ...(sla.unassigned_urgent_cases || []).map((c) => ({ ...c, kind: 'unassigned_urgent' })),
  ];

  const seen = new Set();
  const unique = [];
  for (const c of targets) {
    if (!c.case_id || seen.has(c.case_id)) continue;
    seen.add(c.case_id);
    unique.push(c);
  }

  await ensureTable(pool);

  let sent = 0;
  let skipped = 0;
  const results = [];

  for (const c of unique.slice(0, 25)) {
    const nudgeKey = `${day}:${c.case_id}:${c.kind}`;
    if (!opts.force) {
      const dup = await pool.query(
        `SELECT 1 FROM support_case_sla_nudge_log WHERE nudge_key = $1`,
        [nudgeKey],
      ).catch(() => ({ rows: [] }));
      if (dup.rows?.length) {
        skipped += 1;
        results.push({ case_id: c.case_id, sent: false, reason: 'deduped' });
        continue;
      }
    }

    const lines = [
      '⏰ *MEERAK Support SLA nudge*',
      c.kind === 'stale_24h'
        ? `Case ค้าง >24h: \`${c.case_id}\``
        : `ยังไม่ assign (urgent/high): \`${c.case_id}\``,
      `Priority: ${c.priority || '—'} · User: ${c.user_name || c.user_email || c.user_id?.slice(0, 8) || '—'}`,
      c.subject ? `Subject: ${String(c.subject).slice(0, 120)}` : null,
      opsQueue ? `Queue: ${opsQueue}` : null,
      adminBase ? `Admin: ${adminBase}/?view=support-cases&caseId=${encodeURIComponent(c.case_id)}` : null,
    ].filter(Boolean);

    const r = await postSlack(lines.join('\n'));
    if (r.sent) {
      sent += 1;
      await pool.query(
        `INSERT INTO support_case_sla_nudge_log (nudge_key, case_id, payload, http_status)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (nudge_key) DO NOTHING`,
        [nudgeKey, c.case_id, JSON.stringify({ kind: c.kind, priority: c.priority }), r.status || 200],
      ).catch(() => { });
      results.push({ case_id: c.case_id, sent: true });
    } else {
      skipped += 1;
      results.push({ case_id: c.case_id, sent: false, reason: r.reason || 'slack_failed' });
    }
  }

  return {
    sent,
    skipped,
    total_candidates: unique.length,
    sla_counts: sla.counts,
    results,
  };
}
