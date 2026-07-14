/**
 * Growth Incubation — 90-day weekly briefs (Hermes) + ffmpeg overlay compose
 */

import { uploadToS3 } from './s3-client.js';
import { getGrowthStatus, GROWTH_CAMPAIGNS, ensureEntitlements } from './growthEngine.js';
import { ruleBasedIncubationBrief } from './incubationBriefRules.js';
import {
  composeIncubationOverlay,
  getOverlayTemplate,
  OVERLAY_TEMPLATES,
  INCUBATION_OVERLAY_VERSION,
} from './incubationCompose.js';

const INCUBATION_DAYS = 90;
const INCUBATION_WEEKS = 13;
const AI_CORE_BASE = () =>
  (process.env.AI_CORE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
const AI_CORE_KEY = () => process.env.AI_CORE_API_KEY || '';

async function resolveUserId(pool, userId) {
  const r = await pool.query(
    `SELECT id, full_name, expert_category FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

function isGrowthDevBypass() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.GROWTH_DEV_UNLOCK === '1' ||
    process.env.GROWTH_DEV_UNLOCK === 'true'
  );
}

/** Local dev — auto-start incubation so compose/brief can be tested without 10/10 referrals */
async function ensureIncubationDevBypass(pool, userId) {
  if (!isGrowthDevBypass()) return false;
  const ctx = await ensureEntitlements(pool, userId);
  if (!ctx?.user?.id) return false;

  await pool.query(
    `UPDATE growth_entitlements SET
       incubation_started_at = COALESCE(incubation_started_at, NOW()),
       ai_video_credits = GREATEST(COALESCE(ai_video_credits, 0), 2),
       updated_at = NOW()
     WHERE user_id = $1`,
    [ctx.user.id],
  );

  await pool.query(
    `UPDATE growth_referral_milestones SET
       qualified_count = GREATEST(qualified_count, target_count),
       unlocked_at = COALESCE(unlocked_at, NOW()),
       updated_at = NOW()
     WHERE user_id = $1 AND campaign = $2`,
    [ctx.user.id, GROWTH_CAMPAIGNS.TALENT_AI],
  );

  return true;
}

export function computeIncubationWeek(incubationStartedAt, now = new Date()) {
  if (!incubationStartedAt) return 0;
  const start = new Date(incubationStartedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const diffMs = now.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  const day = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (day >= INCUBATION_DAYS) return 0;
  return Math.min(INCUBATION_WEEKS, Math.floor(day / 7) + 1);
}

export function isIncubationActive(entitlements) {
  if (!entitlements?.incubationStartedAt) return false;
  const week = computeIncubationWeek(entitlements.incubationStartedAt);
  return week > 0;
}

async function fetchHermesBrief(ctx) {
  const headers = { 'Content-Type': 'application/json' };
  const key = AI_CORE_KEY();
  if (key) headers['x-ai-core-api-key'] = key;

  const res = await fetch(`${AI_CORE_BASE()}/v1/growth/incubation-brief`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ctx),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ai-core brief ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function getIncubationStatus(pool, userId) {
  await ensureIncubationDevBypass(pool, userId);
  const status = await getGrowthStatus(pool, userId);
  if (!status.found) return { found: false };

  const startedAt = status.entitlements?.incubationStartedAt;
  const currentWeek = computeIncubationWeek(startedAt);
  const talentUnlocked = !!status.milestones?.[GROWTH_CAMPAIGNS.TALENT_AI]?.unlocked;
  const active = currentWeek > 0 && talentUnlocked;

  let weeks = [];
  if (active && status.userId) {
    const wr = await pool.query(
      `SELECT week_no, brief_text, brief_generated_at, raw_upload_url, composed_url, status, updated_at
       FROM growth_incubation_weeks WHERE user_id = $1 ORDER BY week_no`,
      [status.userId],
    );
    weeks = wr.rows;
  }

  return {
    found: true,
    active,
    locked: !talentUnlocked,
    incubationStartedAt: startedAt,
    currentWeek,
    totalWeeks: INCUBATION_WEEKS,
    daysRemaining: startedAt
      ? Math.max(0, INCUBATION_DAYS - Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000))
      : 0,
    weeks,
    templates: OVERLAY_TEMPLATES.map((t) => ({
      id: t.id,
      nameTh: t.nameTh,
      preview: t.preview,
    })),
  };
}

export async function getOrCreateWeeklyBrief(pool, userId, opts = {}) {
  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  await ensureIncubationDevBypass(pool, userId);

  const status = await getGrowthStatus(pool, userId);
  const startedAt = status.entitlements?.incubationStartedAt;
  if (!startedAt) {
    throw Object.assign(new Error('Incubation not started — unlock AI Resume first'), {
      status: 403,
      code: 'INCUBATION_LOCKED',
    });
  }

  const weekNo = opts.weekNo || computeIncubationWeek(startedAt);
  if (!weekNo) {
    throw Object.assign(new Error('Incubation period ended'), { status: 410, code: 'INCUBATION_ENDED' });
  }

  const existing = await pool.query(
    `SELECT * FROM growth_incubation_weeks WHERE user_id = $1 AND week_no = $2`,
    [user.id, weekNo],
  );

  if (existing.rows[0]?.brief_text && !opts.forceRefresh) {
    const row = existing.rows[0];
    let parsed = null;
    try {
      parsed = JSON.parse(row.brief_text);
    } catch {
      parsed = { headline_th: row.brief_text };
    }
    return {
      weekNo,
      brief: parsed,
      status: row.status,
      composedUrl: row.composed_url,
      rawUploadUrl: row.raw_upload_url,
      generatedAt: row.brief_generated_at,
      source: parsed?.source || 'cache',
    };
  }

  let briefPayload;
  let source = 'rules';
  try {
    const ai = await fetchHermesBrief({
      week_no: weekNo,
      talent_name: user.full_name,
      category_hint: user.expert_category || 'general services',
    });
    briefPayload = ai.brief || ai;
    source = ai.source || 'hermes';
  } catch (e) {
    console.warn('[incubation] Hermes brief fallback:', e?.message || e);
    briefPayload = ruleBasedIncubationBrief({
      week_no: weekNo,
      talent_name: user.full_name,
      category_hint: user.expert_category || 'general services',
    });
    source = briefPayload.source || 'rules';
  }

  briefPayload.source = source;
  briefPayload.week_no = weekNo;
  const briefJson = JSON.stringify(briefPayload);

  await pool.query(
    `INSERT INTO growth_incubation_weeks (user_id, week_no, brief_text, brief_generated_at, status)
     VALUES ($1, $2, $3, NOW(), 'brief_ready')
     ON CONFLICT (user_id, week_no) DO UPDATE SET
       brief_text = EXCLUDED.brief_text,
       brief_generated_at = NOW(),
       status = CASE
         WHEN growth_incubation_weeks.status = 'composed' THEN growth_incubation_weeks.status
         ELSE 'brief_ready'
       END,
       updated_at = NOW()`,
    [user.id, weekNo, briefJson],
  );

  await pool.query(
    `UPDATE growth_entitlements SET incubation_week = GREATEST(incubation_week, $2), updated_at = NOW()
     WHERE user_id = $1`,
    [user.id, weekNo],
  );

  return {
    weekNo,
    brief: briefPayload,
    status: 'brief_ready',
    generatedAt: new Date().toISOString(),
    source,
    notifyRecommended: !existing.rows[0]?.brief_text,
  };
}

export async function composeIncubationClip(pool, userId, payload) {
  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  await ensureIncubationDevBypass(pool, userId);

  const { raw_upload_url, template_id, cta_th, week_no } = payload || {};
  if (!raw_upload_url) {
    throw Object.assign(new Error('raw_upload_url required'), { status: 400 });
  }

  const status = await getGrowthStatus(pool, userId);
  const startedAt = status.entitlements?.incubationStartedAt;
  if (!startedAt) {
    throw Object.assign(new Error('Incubation not started'), { status: 403, code: 'INCUBATION_LOCKED' });
  }

  const weekNo = week_no || computeIncubationWeek(startedAt);
  if (!weekNo) {
    throw Object.assign(new Error('Incubation period ended'), { status: 410 });
  }

  const briefRow = await getOrCreateWeeklyBrief(pool, userId, { weekNo }).catch(() => null);
  const brief = briefRow?.brief || {};
  const template = getOverlayTemplate(template_id || brief.template_hint || 'pro_hire');
  const ctaText = cta_th || brief.cta_th || null;
  const talentName = user.full_name || user.fullName || '';

  const inputBuf = await downloadToBuffer(raw_upload_url);
  const { buffer: outBuf, skippedOverlay, reason, meta } = await composeIncubationOverlay({
    inputBuffer: inputBuf,
    template,
    cta: ctaText,
    talentName,
    weekNo,
  });

  const key = `incubation/${user.id}/week_${weekNo}_${randomSuffix()}.mp4`;
  const uploaded = await uploadToS3(outBuf, {
    folder: 'incubation',
    key,
    contentType: 'video/mp4',
    resourceType: 'video',
  });

  const composedUrl = uploaded.url || uploaded.secure_url;

  await pool.query(
    `INSERT INTO growth_incubation_weeks (user_id, week_no, raw_upload_url, composed_url, status, updated_at)
     VALUES ($1, $2, $3, $4, 'composed', NOW())
     ON CONFLICT (user_id, week_no) DO UPDATE SET
       raw_upload_url = EXCLUDED.raw_upload_url,
       composed_url = EXCLUDED.composed_url,
       status = 'composed',
       updated_at = NOW()`,
    [user.id, weekNo, raw_upload_url, composedUrl],
  );

  return {
    weekNo,
    composedUrl,
    templateId: template.id,
    skippedOverlay: !!skippedOverlay,
    skipReason: reason || null,
    overlayMeta: meta || null,
    overlayVersion: meta?.overlayVersion ?? INCUBATION_OVERLAY_VERSION,
  };
}

function randomSuffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Hourly cron hook — generate briefs + push for active incubation users */
export async function runIncubationBriefCron(pool, notifyFn) {
  const rows = await pool.query(
    `SELECT ge.user_id, ge.incubation_started_at, u.full_name
     FROM growth_entitlements ge
     JOIN users u ON u.id = ge.user_id
     WHERE ge.incubation_started_at IS NOT NULL
       AND ge.incubation_started_at > NOW() - INTERVAL '${INCUBATION_DAYS} days'`,
  );

  let generated = 0;
  let pushed = 0;

  for (const row of rows.rows) {
    const weekNo = computeIncubationWeek(row.incubation_started_at);
    if (!weekNo) continue;

    const had = await pool.query(
      `SELECT brief_text FROM growth_incubation_weeks WHERE user_id = $1 AND week_no = $2`,
      [row.user_id, weekNo],
    );
    if (had.rows[0]?.brief_text) continue;

    try {
      const uid = String(row.user_id);
      const result = await getOrCreateWeeklyBrief(pool, uid, { weekNo });
      generated++;
      if (result.notifyRecommended && notifyFn) {
        const title = 'โจทย์คลิปสัปดาห์นี้พร้อมแล้ว';
        const msg = result.brief?.headline_th || 'เปิดกล้อง 15 วินาที แล้วใส่เทมเพลต AQOND';
        await notifyFn(uid, title, msg);
        pushed++;
      }
    } catch (e) {
      console.warn('[incubation-cron] user', row.user_id, e?.message || e);
    }
  }

  if (generated > 0) {
    console.log(`✅ [Cron] Incubation briefs generated: ${generated}, push sent: ${pushed}`);
  }
  return { generated, pushed };
}

export { OVERLAY_TEMPLATES, getOverlayTemplate };
