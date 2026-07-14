import { isBillingEnabled, DEFAULT_BASE_CREDITS } from './config.js';
import { createCreditChecker, createEntitlementGate } from './creditChecker.js';
import { createUsageMeter } from './usageMeter.js';

function disabledStub() {
  return {
    enabled: false,
    checkCredits:  async () => ({ ok: true, bypass: true }),
    checkEntitlement: async () => ({ ok: true, bypass: true }),
    meterUsage:    async () => ({ ok: false, reason: 'billing_disabled' }),
    getMultiplier: () => 1,
    getJobUsage:   () => ({ entries: [], total: 0 }),
    getStatus:     async () => ({ ok: false, reason: 'billing_disabled' }),
  };
}

export function createBillingEngine({ growthEngine, costDashboard, marketplace, store } = {}) {
  if (!isBillingEnabled()) return disabledStub();

  const getPluginProfile = (pluginId) => {
    const plugins = marketplace?.listPlugins?.() || [];
    return plugins.find((p) => p.package_id === pluginId) || null;
  };

  const creditChecker  = createCreditChecker({ growthEngine });
  const entitlementGate = createEntitlementGate({ growthEngine });
  const usageMeter     = createUsageMeter({ costDashboard, getPluginProfile });

  return {
    enabled: true,

    getMultiplier(pluginId) {
      return usageMeter.getMultiplier(pluginId);
    },

    async checkCredits({ userId, pluginId, baseCredits = DEFAULT_BASE_CREDITS } = {}) {
      const multiplier = usageMeter.getMultiplier(pluginId);
      return creditChecker.check({ userId, pluginId, baseCredits, multiplier });
    },

    async checkEntitlement({ userId, requiredTier } = {}) {
      return entitlementGate.check({ userId, requiredTier });
    },

    async meterUsage(opts) {
      return usageMeter.meter(opts);
    },

    getJobUsage(jobId) {
      return usageMeter.getJobUsage(store, jobId);
    },

    async getStatus(userId) {
      if (!growthEngine?.getGrowthStatus) {
        return { ok: true, userId, credits: null, tier: null, bypass: true };
      }
      const status = await growthEngine.getGrowthStatus(userId);
      return {
        ok:      true,
        userId,
        credits: status?.ai_video_credits ?? status?.credits ?? 0,
        tier:    status?.tier || 'free',
      };
    },
  };
}

export { isBillingEnabled } from './config.js';
