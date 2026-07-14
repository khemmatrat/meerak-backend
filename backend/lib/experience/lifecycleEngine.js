/**
 * Lifecycle Engine — Visitor → Enterprise (Sprint 30a stub)
 *
 * Drives Home layout, Jarvis tone, tutorials, promotions per stage.
 */

export const LIFECYCLE_STAGES = [
  'visitor',
  'new_user',
  'activated',
  'power_user',
  'merchant',
  'partner',
  'vip',
  'enterprise',
];

export function createLifecycleEngine(_deps = {}) {
  return {
    async resolveStage(ctx = {}) {
      const explicit = ctx.lifecycleStage;
      if (explicit && LIFECYCLE_STAGES.includes(explicit)) {
        return { stage: explicit, stub: true };
      }

      if (!ctx.userId) {
        return { stage: 'visitor', stub: true };
      }

      if (ctx.isEnterprise) return { stage: 'enterprise', stub: true };
      if (ctx.isVip) return { stage: 'vip', stub: true };
      if (ctx.isPartner) return { stage: 'partner', stub: true };
      if (ctx.isMerchant) return { stage: 'merchant', stub: true };
      if (ctx.isActivated) return { stage: 'activated', stub: true };

      return { stage: 'new_user', stub: true };
    },

    getJarvisTone(stage) {
      const tones = {
        visitor: 'welcome_explore',
        new_user: 'onboarding_guide',
        activated: 'helpful_concise',
        power_user: 'proactive_ops',
        merchant: 'business_coach',
        partner: 'growth_partner',
        vip: 'premium_concierge',
        enterprise: 'account_manager',
      };
      return tones[stage] || 'helpful_concise';
    },
  };
}
