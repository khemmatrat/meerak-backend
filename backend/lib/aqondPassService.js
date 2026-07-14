/**
 * AQOND Pass — 6-month loyalty journey (phases 1–6)
 * Months 1–3: Hermes cross-sell templates
 * Months 4–6: locked subsidy category card
 */

import { ruleBasedIncubationBrief } from './incubationBriefRules.js';
import { ensureEntitlements } from './growthEngine.js';

const PASS_MONTHS = 6;

const SUBSIDY_BY_INTENT = {
  food: { category: 'food', labelTh: 'อาหาร', discountPct: 15, href: '/m/food' },
  shop: { category: 'shop', labelTh: 'ช้อปปิ้ง', discountPct: 12, href: '/m/home' },
  talent: { category: 'talent', labelTh: 'บริการช่าง', discountPct: 10, href: '/m/home' },
};

const PHASE_LABELS = [
  '',
  'เดือนที่ 1 — เริ่มต้น',
  'เดือนที่ 2 — สะสมสิทธิ์',
  'เดือนที่ 3 — โบนัสพิเศษ',
  'เดือนที่ 4 — ล็อกส่วนลด',
  'เดือนที่ 5 — สิทธิ์ VIP',
  'เดือนที่ 6 — รางวัลสูงสุด',
];

async function resolveUserId(pool, userId) {
  const r = await pool.query(
    `SELECT id, full_name FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

function monthsSince(startIso, now = new Date()) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return (
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  );
}

function computePhaseFromStart(startedAt, now = new Date()) {
  if (!startedAt) return 0;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 0;
  if (now >= new Date(start.getTime() + PASS_MONTHS * 30 * 86400000)) return 0;
  const m = monthsSince(startedAt, now);
  return Math.min(6, Math.max(1, m + 1));
}

async function inferDominantIntent(pool, userId) {
  const recent = await pool.query(
    `SELECT dominant_intent FROM user_temporal_patterns
     WHERE user_id = $1 AND dominant_intent IS NOT NULL
     ORDER BY open_count DESC, updated_at DESC LIMIT 1`,
    [userId],
  );
  if (recent.rows[0]?.dominant_intent) return recent.rows[0].dominant_intent;

  const ev = await pool.query(
    `SELECT entity_type, SUM(dwell_ms)::int AS dwell
     FROM user_intent_events
     WHERE user_id = $1 AND logged_at > NOW() - INTERVAL '30 days'
     GROUP BY entity_type
     ORDER BY dwell DESC LIMIT 1`,
    [userId],
  );
  const et = ev.rows[0]?.entity_type;
  if (et === 'food' || et === 'restaurant' || et === 'menu') return 'food';
  if (et === 'talent' || et === 'provider' || et === 'job') return 'talent';
  return 'shop';
}

async function fetchHermesPassBrief(phase, userName) {
  const AI_CORE = (process.env.AI_CORE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
  const key = process.env.AI_CORE_API_KEY || '';
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['x-ai-core-api-key'] = key;
    const res = await fetch(`${AI_CORE}/v1/growth/incubation-brief`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ week_no: phase, talent_name: userName || 'สมาชิก' }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error('brief failed');
    const data = await res.json();
    const b = data.brief || {};
    return {
      headline_th: b.headline_th,
      hook_th: b.hook_th,
      cta_href: '/m/home',
      source: data.source || 'hermes',
    };
  } catch {
    const b = ruleBasedIncubationBrief({ week_no: phase, talent_name: userName });
    return {
      headline_th: b.headline_th,
      hook_th: b.hook_th,
      cta_href: '/m/home',
      source: 'rules',
    };
  }
}

function buildTimeline(currentPhase) {
  return Array.from({ length: PASS_MONTHS }, (_, i) => {
    const month = i + 1;
    let status = 'upcoming';
    if (month < currentPhase) status = 'done';
    else if (month === currentPhase) status = 'current';
    return { month, label: PHASE_LABELS[month], status };
  });
}

export async function activateAqondPass(pool, userId) {
  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const ctx = await ensureEntitlements(pool, userId);
  const e = ctx?.entitlements;
  if (!e) throw Object.assign(new Error('Entitlements not found'), { status: 404 });

  if (e.aqond_pass_started_at) {
    return getAqondPassStatus(pool, userId);
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + PASS_MONTHS);

  await pool.query(
    `UPDATE growth_entitlements SET
       aqond_pass_started_at = NOW(),
       aqond_pass_phase = 1,
       pass_expires_at = $2,
       updated_at = NOW()
     WHERE user_id = $1`,
    [user.id, expires.toISOString()],
  );

  return getAqondPassStatus(pool, userId);
}

export async function getAqondPassStatus(pool, userId) {
  const user = await resolveUserId(pool, userId);
  if (!user) return { found: false };

  const ctx = await ensureEntitlements(pool, userId);
  const e = ctx.entitlements;
  const startedAt = e.aqond_pass_started_at;
  const active = !!startedAt && (!e.pass_expires_at || new Date(e.pass_expires_at) > new Date());

  if (!active) {
    return {
      found: true,
      active: false,
      phase: 0,
      canActivate: !!e.wallet_activated_at || !!ctx.user.wallet_balance,
      walletActivated: !!e.wallet_activated_at,
    };
  }

  const phase = computePhaseFromStart(startedAt);
  if (phase !== e.aqond_pass_phase) {
    await pool.query(
      `UPDATE growth_entitlements SET aqond_pass_phase = $2, updated_at = NOW() WHERE user_id = $1`,
      [user.id, phase],
    );
  }

  let lockedCategory = e.locked_subsidy_category;
  if (phase >= 4 && !lockedCategory) {
    const intent = await inferDominantIntent(pool, user.id);
    lockedCategory = SUBSIDY_BY_INTENT[intent]?.category || 'shop';
    await pool.query(
      `UPDATE growth_entitlements SET locked_subsidy_category = $2, updated_at = NOW() WHERE user_id = $1`,
      [user.id, lockedCategory],
    );
  }

  const expiresAt = e.pass_expires_at;
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  let hermesBrief = null;
  let subsidyCard = null;

  if (phase >= 1 && phase <= 3) {
    hermesBrief = await fetchHermesPassBrief(phase, user.full_name);
  }
  if (phase >= 4 && phase <= 6 && lockedCategory) {
    const sub = Object.values(SUBSIDY_BY_INTENT).find((s) => s.category === lockedCategory) ||
      SUBSIDY_BY_INTENT.shop;
    subsidyCard = {
      category: sub.category,
      labelTh: sub.labelTh,
      discountPct: sub.discountPct + (phase - 4) * 2,
      href: sub.href,
      locked: true,
      phase,
    };
  }

  return {
    found: true,
    active: true,
    phase,
    phaseLabel: PHASE_LABELS[phase] || '',
    startedAt,
    expiresAt,
    daysRemaining,
    lockedSubsidyCategory: lockedCategory,
    hermesBrief,
    subsidyCard,
    timeline: buildTimeline(phase),
    crossSell: {
      primaryPct: 70,
      bonusPct: 30,
      message: phase <= 3
        ? 'ใช้จ่ายต่อไปเพื่อปลดเฟสถัดไปเร็วขึ้น'
        : 'ส่วนลดหมวดล็อกพร้อมใช้ใน Wallet',
    },
  };
}

/** Cron — sync pass phases + lock subsidy at month 4 */
export async function runAqondPassCron(pool, notifyFn) {
  const rows = await pool.query(
    `SELECT user_id, aqond_pass_phase, aqond_pass_started_at
     FROM growth_entitlements
     WHERE aqond_pass_started_at IS NOT NULL
       AND (pass_expires_at IS NULL OR pass_expires_at > NOW())`,
  );

  let updated = 0;
  for (const row of rows.rows) {
    const phase = computePhaseFromStart(row.aqond_pass_started_at);
    if (!phase || phase === row.aqond_pass_phase) continue;
    await pool.query(
      `UPDATE growth_entitlements SET aqond_pass_phase = $2, updated_at = NOW() WHERE user_id = $1`,
      [row.user_id, phase],
    );
    updated++;
    if (notifyFn && phase === 4) {
      await notifyFn(
        String(row.user_id),
        'AQOND Pass — ปลดล็อกส่วนลดหมวดโปรด',
        'เดือนที่ 4 แล้ว — ดูสิทธิ์ล็อกใน AQOND Pass',
      );
    }
  }
  if (updated > 0) console.log(`✅ [Cron] AQOND Pass phases updated: ${updated}`);
  return { updated };
}
