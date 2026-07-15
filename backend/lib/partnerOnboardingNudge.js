/**
 * Partner onboarding nudge engine (Phase 3).
 *
 * Guardrails (do not weaken):
 *  - Frequency cap: a user is eligible only after NUDGE_STALL_HOURS of inactivity, at most one
 *    nudge per NUDGE_COOLDOWN_HOURS (=> ~1/day by default), and never more than NUDGE_MAX_TOTAL
 *    nudges for the same onboarding — even if they stay stuck forever.
 *  - Opt-out: rows with nudge_opt_out = TRUE are always skipped.
 *  - LINE: only sent when line_user_id AND line_consent_at are present (explicit consent).
 *  - Every send is written to audit_log (ONBOARDING_NUDGE_SENT).
 *
 * Channels degrade gracefully: FCM needs Firebase creds, LINE needs a channel token. When absent
 * the cycle still runs, targets the correct users, updates counters, and logs intent (dev-safe).
 */
import { createAuditService } from '../auditService.js';
import { sendFcmMulticast } from './fcmService.js';

const cfg = () => ({
  enabled: process.env.NUDGE_ENABLED === '1',
  stallHours: Number(process.env.NUDGE_STALL_HOURS || 24),
  cooldownHours: Number(process.env.NUDGE_COOLDOWN_HOURS || 24),
  maxPerDay: Number(process.env.NUDGE_MAX_PER_DAY || 1),
  maxTotal: Number(process.env.NUDGE_MAX_TOTAL || 3),
  batchLimit: Number(process.env.NUDGE_BATCH_LIMIT || 200),
});

const auditByPool = new WeakMap();
function auditFor(pool) {
  if (!pool) return { log: () => {} };
  let svc = auditByPool.get(pool);
  if (!svc) {
    svc = createAuditService(pool);
    auditByPool.set(pool, svc);
  }
  return svc;
}

const ZONE_LABEL = { rider: 'ไรเดอร์', merchant: 'ร้านค้า', partner_skill: 'พาร์ทเนอร์บริการ' };

function stepLabel(stepsSnapshot, currentStep) {
  const steps = Array.isArray(stepsSnapshot) ? stepsSnapshot : [];
  const found = steps.find((s) => s && s.id === currentStep);
  return { label: found?.label || 'ขั้นตอนต่อไป', href: found?.href || '/compass' };
}

function buildMessage(zone, step) {
  const zl = ZONE_LABEL[zone] || 'พาร์ทเนอร์';
  return {
    title: `สมัคร${zl}ค้างอยู่ครับ`,
    body: `เหลืออีกนิดเดียว! ทำขั้น “${step.label}” ต่อให้เสร็จ แล้วเริ่มใช้งานได้เลยครับ`,
  };
}

/** LINE push — real send only when a channel token is configured; otherwise degrade to log. */
async function sendLineNudge(lineUserId, msg) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN || '';
  if (!token || !lineUserId) return { ok: false, reason: token ? 'no_line_user' : 'no_token' };
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: `${msg.title}\n${msg.body}` }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: e?.message || 'line_error' };
  }
}

async function fcmTokensForUser(pool, userId) {
  try {
    const r = await pool.query(`SELECT token FROM fcm_tokens WHERE user_id = $1`, [userId]);
    return r.rows.map((x) => x.token).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Find stalled onboarding rows that are eligible for a nudge (all caps + opt-out applied in SQL).
 */
export async function findEligible(pool, c = cfg()) {
  const r = await pool.query(
    `SELECT p.id, p.user_id, p.zone, p.primary_intent, p.current_step, p.steps_snapshot,
            p.nudge_count, p.last_nudge_at, p.line_user_id, p.line_consent_at
       FROM partner_onboarding_progress p
      WHERE p.status = 'in_progress'
        AND p.nudge_opt_out = FALSE
        AND p.current_step IS NOT NULL
        AND p.user_id IS NOT NULL
        AND p.nudge_count < $1
        AND p.last_activity_at < (now() - ($2 || ' hours')::interval)
        AND (p.last_nudge_at IS NULL OR p.last_nudge_at < (now() - ($3 || ' hours')::interval))
        AND (p.last_nudge_at IS NULL OR p.last_nudge_at::date < (now())::date)
      ORDER BY p.last_activity_at ASC
      LIMIT $4`,
    [c.maxTotal, String(c.stallHours), String(c.cooldownHours), c.batchLimit],
  );
  return r.rows;
}

/**
 * Run one nudge cycle.
 * @param {object} pool
 * @param {{ dryRun?: boolean, force?: boolean }} [opts] force=true bypasses NUDGE_ENABLED gate (cron/admin)
 */
export async function runNudgeCycle(pool, opts = {}) {
  const c = cfg();
  const { dryRun = false, force = false } = opts;
  if (!pool) return { ok: false, reason: 'no_pool' };
  if (!c.enabled && !force) {
    console.log('[nudge] disabled (NUDGE_ENABLED != 1) — skipping cycle');
    return { ok: false, reason: 'disabled' };
  }

  console.log(
    `[nudge] cycle start dryRun=${dryRun} stall=${c.stallHours}h cooldown=${c.cooldownHours}h maxPerDay=${c.maxPerDay} maxTotal=${c.maxTotal}`,
  );

  let eligible = [];
  try {
    eligible = await findEligible(pool, c);
  } catch (e) {
    console.error('[nudge] eligibility query failed:', e?.message || e);
    return { ok: false, reason: 'query_failed', error: e?.message };
  }

  const sent = [];
  const audit = auditFor(pool);

  for (const row of eligible) {
    const step = stepLabel(row.steps_snapshot, row.current_step);
    const msg = buildMessage(row.zone, step);
    const channels = {};

    if (dryRun) {
      console.log(
        `[nudge] (dry) would send user=${row.user_id} zone=${row.zone} step=${row.current_step} nudge#${row.nudge_count + 1}`,
      );
      sent.push({ userId: row.user_id, zone: row.zone, step: row.current_step, dryRun: true });
      continue;
    }

    // FCM
    const tokens = await fcmTokensForUser(pool, row.user_id);
    if (tokens.length) {
      const fcmRes = await sendFcmMulticast(tokens, {
        title: msg.title,
        body: msg.body,
        link: step.href,
        data: { kind: 'onboarding_nudge', zone: row.zone, step: row.current_step, open_path: step.href },
      });
      channels.fcm = { tokens: tokens.length, ...fcmRes };
    } else {
      channels.fcm = { tokens: 0, skipped: 'no_token' };
    }

    // LINE (only with explicit consent)
    if (row.line_user_id && row.line_consent_at) {
      channels.line = await sendLineNudge(row.line_user_id, msg);
    } else {
      channels.line = { skipped: row.line_user_id ? 'no_consent' : 'no_line_user' };
    }

    // update counters (advances cooldown + lifetime cap; mark 'stalled')
    await pool.query(
      `UPDATE partner_onboarding_progress
         SET nudge_count = nudge_count + 1, last_nudge_at = now(), status = 'stalled', updated_at = now()
       WHERE id = $1`,
      [row.id],
    );

    audit.log(
      String(row.user_id),
      'ONBOARDING_NUDGE_SENT',
      {
        entityName: 'partner_onboarding',
        entityId: row.zone,
        new: { step: row.current_step, nudge_no: row.nudge_count + 1, channels },
      },
      { actorRole: 'System', status: 'Success' },
    );

    console.log(
      `[nudge] SEND user=${row.user_id} zone=${row.zone} step=${row.current_step} nudge#${row.nudge_count + 1} channels=${JSON.stringify(channels)}`,
    );
    sent.push({ userId: row.user_id, zone: row.zone, step: row.current_step, channels });
  }

  const summary = { ok: true, scanned: eligible.length, sent: sent.length, items: sent };
  console.log(`[nudge] cycle done scanned=${summary.scanned} sent=${summary.sent}`);
  return summary;
}

/** Set opt-out flag for a user's onboarding rows (all zones). */
export async function setNudgeOptOut(pool, userId, optOut) {
  const r = await pool.query(
    `UPDATE partner_onboarding_progress SET nudge_opt_out = $2, updated_at = now()
      WHERE user_id = $1 RETURNING zone, nudge_opt_out`,
    [userId, !!optOut],
  );
  return r.rows;
}

/** Record explicit LINE messaging consent (with line user id) for a user's onboarding rows. */
export async function setLineConsent(pool, userId, lineUserId) {
  const r = await pool.query(
    `UPDATE partner_onboarding_progress
        SET line_user_id = $2, line_consent_at = now(), updated_at = now()
      WHERE user_id = $1 RETURNING zone, line_user_id, line_consent_at`,
    [userId, String(lineUserId || '').slice(0, 64) || null],
  );
  return r.rows;
}

export { cfg as nudgeConfig };
