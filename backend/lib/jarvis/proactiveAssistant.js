/**
 * Sprint 34 — Recommendation matrix + proactive Jarvis briefs (Layer 8)
 */

import { loadUserAiPreferences, mergeJarvisMemory } from './userAiPreferencesStore.js';
import { normalizeJarvisMemory, dismissJarvisBrief as applyBriefDismiss } from './conversationMemory.js';
import { resolveJarvisPersona } from './personaEngine.js';
import { loadExperienceProfile } from '../experience/experienceProfileStore.js';
import {
  getCachedJarvisBrief,
  isJarvisProactiveEnabled,
  setCachedJarvisBrief,
} from './jarvisEventBridge.js';

const STOREFRONT_BASE = process.env.STOREFRONT_INTERNAL_URL || 'http://127.0.0.1:3003';

function isEnglish(profile = {}) {
  return String(profile.detected_lang || profile.locale || '').toLowerCase().startsWith('en');
}

function isDismissed(memory, briefId) {
  return (memory.medium.dismissed_briefs || []).includes(briefId);
}

async function fetchCommerceSignals(userId) {
  if (!userId) return {};
  try {
    const res = await fetch(
      `${STOREFRONT_BASE}/api/internal/jarvis/commerce-signals?userId=${encodeURIComponent(userId)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function buildCandidates(ctx) {
  const {
    isEn,
    signals = {},
    commerce = {},
    profile,
    growth,
    lifecycleStage,
    honorific = 'เจ้านาย',
  } = ctx;

  const pending =
    Number(signals.merchant_pending_count) ||
    Number(commerce.merchant_pending_count) ||
    0;

  const candidates = [];

  if (pending > 0) {
    candidates.push({
      id: `merchant-pending-${pending}`,
      priority: 90,
      trigger: 'merchant.order_pending',
      product: 'merchant',
      surface: 'merchant',
      message: isEn
        ? `You have ${pending} order(s) waiting for a response — shall I help you reply to customers?`
        : `มีออเดอร์รอตอบ ${pending} รายการครับ${honorific} — ให้ผมช่วยตอบลูกค้าไหมครับ`,
      action: 'open_merchant_orders',
      action_href: '/m/merchant/orders',
    });
  }

  if (signals.cart_abandon || commerce.cart_abandon) {
    candidates.push({
      id: 'cart-abandon',
      priority: 70,
      trigger: 'order.draft',
      product: 'marketplace',
      surface: 'checkout',
      message: isEn
        ? 'You left items in your cart — want me to finish checkout for you?'
        : `ยังมีสินค้าในรถเข็นอยู่ครับ${honorific} — ให้ผมช่วยสั่งต่อไหมครับ`,
      action: 'resume_cart',
      action_href: '/m/cart',
    });
  }

  if (signals.wallet_credit_recent) {
    const amt = signals.wallet_credit_amount || commerce.wallet_balance_micro;
    candidates.push({
      id: 'wallet-credit',
      priority: 60,
      trigger: 'wallet.credit',
      product: 'wallet',
      surface: 'wallet',
      message: isEn
        ? 'Your wallet was topped up — ready to shop or pay with AQOND Pay?'
        : `เงินเข้ากระเป๋าแล้วครับ${honorific} — พร้อมช้อปหรือจ่ายด้วย AQOND Pay เลยไหมครับ`,
      action: 'open_wallet',
      action_href: '/m/wallet',
      meta: amt ? { amount: amt } : undefined,
    });
  }

  if (profile && !profile.wizard_completed_at) {
    candidates.push({
      id: 'ftx-wizard-resume',
      priority: 55,
      trigger: 'ftx.wizard_step',
      product: 'super',
      surface: 'home',
      message: isEn
        ? 'Finish your setup wizard — I can personalize AQOND for you in under a minute.'
        : `ตั้งค่าโปรไฟล์ยังไม่เสร็จครับ${honorific} — ทำต่อแป๊บเดียว ผมจะจัดหน้าแรกให้เหมาะกับคุณ`,
      action: 'resume_wizard',
      action_href: '/m/ftx/wizard',
    });
  }

  if (signals.growth_promotion || growth?.hints?.length) {
    const hint = growth?.hints?.[0];
    candidates.push({
      id: hint?.id || 'growth-promo',
      priority: 50,
      trigger: 'growth.promotion_eligible',
      product: 'super',
      surface: 'home',
      message: isEn
        ? hint?.title_en || 'You have a growth perk waiting — want the details?'
        : hint?.title_th || `มีสิทธิพิเศษรออยู่ครับ${honorific} — อยากให้ผมเล่าให้ฟังไหมครับ`,
      action: 'view_growth',
      action_href: hint?.href || '/m/home',
    });
  }

  if (lifecycleStage === 'visitor' || lifecycleStage === 'new_user') {
    candidates.push({
      id: 'welcome-explore',
      priority: 10,
      trigger: 'lifecycle.welcome',
      product: 'super',
      surface: 'home',
      message: isEn
        ? `Hello! I'm Jarvis — tell me what you're looking for and I'll handle the rest.`
        : `สวัสดีครับ${honorific} ผม Jarvis — บอกได้เลยว่าวันนี้อยากทำอะไร เดี๋ยวผมจัดการให้`,
      action: 'none',
    });
  }

  return candidates;
}

/**
 * Build proactive brief list for GET /api/experience/jarvis-brief
 */
export async function buildJarvisProactiveBrief(input = {}) {
  const { pool, userId, surface = 'home', runtime, acceptLanguage } = input;

  if (!isJarvisProactiveEnabled()) {
    return { ok: true, enabled: false, proactive: [], stub: true };
  }

  if (userId) {
    const cached = getCachedJarvisBrief(userId);
    if (cached) return cached;
  }

  const prefs =
    userId && pool ? await loadUserAiPreferences(pool, userId).catch(() => null) : null;
  const contextJson = prefs?.context_json || {};
  const memory = normalizeJarvisMemory(contextJson);
  const signals = contextJson.jarvis_signals || {};
  const languageProfile = contextJson.language_profile || {};
  const isEn = isEnglish(languageProfile);

  const profileRow = userId ? await loadExperienceProfile(pool, { userId }) : null;
  const lifecycleRes = runtime?.lifecycleEngine
    ? await runtime.lifecycleEngine.resolveStage({ userId })
    : { stage: userId ? 'new_user' : 'visitor' };

  const commerce = userId ? await fetchCommerceSignals(userId) : {};
  const growth = runtime?.growthDecisionEngine
    ? await runtime.growthDecisionEngine.getDecisions({ pool, userId, surface })
    : null;

  const persona = await resolveJarvisPersona({
    userId,
    languageProfile,
    contextJson,
    surface,
    lifecycleStage: lifecycleRes.stage,
  });
  const honorific = isEn ? persona.honorific || 'there' : persona.honorific || 'เจ้านาย';

  let candidates = buildCandidates({
    isEn,
    signals,
    commerce,
    profile: profileRow,
    growth,
    lifecycleStage: lifecycleRes.stage,
    honorific,
  });

  candidates = candidates.filter((c) => !isDismissed(memory, c.id));
  candidates.sort((a, b) => b.priority - a.priority);

  const proactive = candidates.slice(0, 3);
  const payload = {
    ok: true,
    enabled: true,
    stub: !pool,
    version: '34',
    tone: runtime?.lifecycleEngine?.getJarvisTone(lifecycleRes.stage) || '',
    lifecycle_stage: lifecycleRes.stage,
    surface,
    proactive,
    top: proactive[0] || null,
    signals: {
      merchant_pending_count: Number(signals.merchant_pending_count || commerce.merchant_pending_count || 0),
      cart_abandon: Boolean(signals.cart_abandon || commerce.cart_abandon),
    },
  };

  if (userId) setCachedJarvisBrief(userId, payload);
  return payload;
}

export async function dismissJarvisBrief(pool, userId, briefId) {
  if (!briefId || !userId || !pool) {
    return { ok: false, reason: 'invalid_input' };
  }
  const prefs = await loadUserAiPreferences(pool, userId);
  const memory = applyBriefDismiss(prefs.context_json || {}, briefId);
  await mergeJarvisMemory(pool, userId, memory);
  const { invalidateJarvisBriefCache } = await import('./jarvisEventBridge.js');
  invalidateJarvisBriefCache(userId);
  return { ok: true, brief_id: briefId };
}
