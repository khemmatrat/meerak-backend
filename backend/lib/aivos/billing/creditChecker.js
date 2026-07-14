const TIER_ORDER = Object.freeze({ free: 0, standard: 1, premium: 2, enterprise: 3 });

export function createCreditChecker({ growthEngine } = {}) {
  return {
    async check({ userId, pluginId, baseCredits = 1, multiplier = 1 } = {}) {
      const required = baseCredits * multiplier;
      if (!growthEngine?.getGrowthStatus) {
        return { ok: true, required, available: null, bypass: true, pluginId };
      }
      const status = await growthEngine.getGrowthStatus(userId);
      const available = Number(status?.ai_video_credits ?? status?.credits ?? 0);
      if (available < required) {
        const err = new Error('insufficient_credits');
        err.code = 'INSUFFICIENT_CREDITS';
        err.details = { required, available, pluginId, userId };
        throw err;
      }
      return { ok: true, required, available, pluginId };
    },
  };
}

export function createEntitlementGate({ growthEngine } = {}) {
  return {
    async check({ userId, requiredTier = 'standard' } = {}) {
      if (!growthEngine?.getGrowthStatus) {
        return { ok: true, tier: requiredTier, bypass: true };
      }
      const status = await growthEngine.getGrowthStatus(userId);
      const tier = status?.tier || 'free';
      const ok = (TIER_ORDER[tier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0);
      if (!ok) {
        const err = new Error('entitlement_tier_insufficient');
        err.code = 'ENTITLEMENT_TIER_INSUFFICIENT';
        err.details = { tier, requiredTier, userId };
        throw err;
      }
      return { ok: true, tier, requiredTier };
    },
  };
}
