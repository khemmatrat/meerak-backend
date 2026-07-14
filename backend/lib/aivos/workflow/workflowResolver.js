import { DEFAULT_PLUGINS } from '../marketplace/catalog.js';

export function createWorkflowResolver({
  store,
  skills,
  knowledge,
  marketplace,
  pipeline,
  billingEngine,
  governance,
} = {}) {
  function catalogHasPackage(packageId) {
    return DEFAULT_PLUGINS.some((p) => p.package_id === packageId);
  }

  return {
    async resolve(manifest, { userId, strictInstalled = false } = {}) {
      const gaps = [];

      if (manifest.skill) {
        const skillRow = skills?.registry?.findSkill?.(manifest.skill);
        if (!skillRow) gaps.push({ kind: 'skill', id: manifest.skill, reason: 'not_registered' });
        else if (!skillRow.enabled && strictInstalled) gaps.push({ kind: 'skill', id: manifest.skill, reason: 'disabled' });
      }

      for (const cap of manifest.requiredCapabilities || []) {
        const lookup = skills?.capability?.lookup?.(cap);
        if (!lookup?.matchedSkills?.length) gaps.push({ kind: 'capability', id: cap });
      }

      for (const topic of manifest.requiredKnowledge || []) {
        if (knowledge?.enabled) {
          const hits = knowledge.searchKnowledge?.({ query: topic, limit: 1 });
          if (!hits?.results?.length) gaps.push({ kind: 'knowledge', id: topic, reason: 'no_match' });
        }
      }

      for (const packageId of manifest.requiredMarketplacePackages || []) {
        if (!catalogHasPackage(packageId)) gaps.push({ kind: 'marketplace', id: packageId, reason: 'not_in_catalog' });
        if (strictInstalled && marketplace?.enabled) {
          const installed = await marketplace.listInstalled();
          if (!installed.some((p) => p.package_id === packageId)) {
            gaps.push({ kind: 'marketplace', id: packageId, reason: 'not_installed' });
          }
        }
      }

      if (!pipeline?.executor) gaps.push({ kind: 'pipeline', reason: 'pipeline_unavailable' });

      if ((manifest.requiredPolicies || []).length) {
        const rules = await store?.listPolicyRules?.({ enabled: true }) || [];
        for (const policy of manifest.requiredPolicies) {
          if (!rules.some((r) => r.task_type === policy || r.id === policy)) {
            gaps.push({ kind: 'policy', id: policy });
          }
        }
      }

      if (manifest.permissions?.includes?.('billing.meter') && !billingEngine?.enabled) {
        gaps.push({ kind: 'billing', reason: 'billing_disabled' });
      }

      if (manifest.permissions?.includes?.('governance.audit') && !governance?.enabled) {
        gaps.push({ kind: 'governance', reason: 'governance_disabled' });
      }

      if (billingEngine?.enabled && userId) {
        try {
          await billingEngine.checkEntitlement?.({ userId, requiredTier: 'standard' });
        } catch (e) {
          gaps.push({ kind: 'billing', reason: e.code || e.message });
        }
      }

      return { ok: gaps.length === 0, gaps };
    },
  };
}
