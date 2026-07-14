export function createDependencyResolver({ store, getBillingEngine } = {}) {
  return {
    async resolve({ requiredPlugins = [], requiredSkills = [], userId, minTier } = {}) {
      const gaps = [];
      for (const pluginId of requiredPlugins) {
        const plugin = await store.getPlugin(pluginId);
        if (!plugin || plugin.enabled === false) {
          gaps.push({ kind: 'plugin', id: pluginId });
        }
      }
      for (const skillId of requiredSkills) {
        const skill = await store.getSkill(skillId);
        if (!skill || skill.enabled === false) {
          gaps.push({ kind: 'skill', id: skillId });
        }
      }
      const billingEngine = getBillingEngine?.();
      if (billingEngine?.enabled && minTier && userId) {
        try {
          await billingEngine.checkEntitlement({ userId, requiredTier: minTier });
        } catch (e) {
          gaps.push({ kind: 'entitlement', tier: minTier, code: e.code || e.message });
        }
      }
      return { ok: gaps.length === 0, gaps };
    },
  };
}
