/**
 * Sprint 34 — Jarvis read-only event subscriber (Layer 10)
 * Updates context_json.jarvis_signals; invalidates brief cache.
 */

import { mergeJarvisSignals } from './userAiPreferencesStore.js';

const briefCache = new Map();
const BRIEF_CACHE_TTL_MS = 60_000;

export function isJarvisProactiveEnabled() {
  return process.env.AIVOS_JARVIS_PROACTIVE === '1';
}

export function invalidateJarvisBriefCache(userId) {
  if (userId) briefCache.delete(String(userId));
}

export function getCachedJarvisBrief(userId) {
  const hit = briefCache.get(String(userId));
  if (!hit) return null;
  if (Date.now() - hit.at > BRIEF_CACHE_TTL_MS) {
    briefCache.delete(String(userId));
    return null;
  }
  return hit.payload;
}

export function setCachedJarvisBrief(userId, payload) {
  if (!userId) return;
  briefCache.set(String(userId), { at: Date.now(), payload });
}

function mapCommerceSignal(eventType, metadata = {}) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  switch (eventType) {
    case 'wallet_deposit':
    case 'admin_credit':
    case 'referral_bonus':
      return { wallet_credit_recent: true, wallet_credit_amount: meta.amount || null };
    case 'payment_created':
      if (meta.draft || meta.status === 'draft') return { cart_abandon: true };
      return { order_activity: true };
    case 'escrow_released':
    case 'escrow_refunded':
      return { order_activity: true };
    default:
      return null;
  }
}

function mapExperienceSignal(eventType, payload = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  switch (eventType) {
    case 'ftx.wizard_step':
      return { ftx_wizard_incomplete: true, ftx_step: p.step || null };
    case 'experience.intent_updated':
      return { intent_updated: true, primary_intent: p.primary || p.primary_intent || null };
    case 'merchant.order_pending':
      return {
        merchant_pending_count: Number(p.count || p.pending_count || 1),
        merchant_id: p.merchant_id || null,
      };
    case 'order.draft':
    case 'cart.abandon':
      return { cart_abandon: true };
    case 'wallet.credit':
      return { wallet_credit_recent: true, wallet_credit_amount: p.amount || null };
    case 'growth.promotion_eligible':
      return { growth_promotion: true, growth_campaign: p.campaign || null };
    default:
      if (eventType.startsWith('ftx.')) return { ftx_event: eventType };
      return null;
  }
}

async function applySignalPatch(pool, userId, patch) {
  if (!pool || !userId || !patch || !isJarvisProactiveEnabled()) return;
  invalidateJarvisBriefCache(userId);
  await mergeJarvisSignals(pool, userId, patch).catch((e) => {
    console.warn('[jarvis-event-bridge] signal merge failed:', e?.message);
  });
}

export async function ingestJarvisCommerceEvent(pool, userId, eventType, metadata = {}) {
  const patch = mapCommerceSignal(eventType, metadata);
  if (!patch) return { ok: false, skipped: true };
  await applySignalPatch(pool, userId, { ...patch, last_commerce_event: eventType });
  return { ok: true };
}

export async function ingestJarvisExperienceEvent(pool, userId, eventType, payload = {}) {
  const patch = mapExperienceSignal(eventType, payload);
  if (!patch) return { ok: false, skipped: true };
  await applySignalPatch(pool, userId, { ...patch, last_experience_event: eventType });
  return { ok: true };
}
