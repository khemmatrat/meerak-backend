import { DEFAULT_PLUGINS, DEFAULT_WORKFLOWS } from '../marketplace/catalog.js';

export const KNOWN_PIPELINES = Object.freeze([
  'video-pipeline-v1',
  'default',
  'render-publish',
]);

export function createSkillDependency({ store, marketplace, billingEngine, governance, pipeline } = {}) {
  function catalogHasPackage(packageId) {
    return (
      DEFAULT_PLUGINS.some((p) => p.package_id === packageId) ||
      DEFAULT_WORKFLOWS.some((p) => p.package_id === packageId)
    );
  }

  async function isMarketplaceInstalled(packageId) {
    if (!marketplace?.enabled) return catalogHasPackage(packageId);
    const installed = await marketplace.listInstalled();
    return installed.some((p) => p.package_id === packageId && p.state !== 'deleted');
  }

  return {
    async resolve(manifest, { userId, strictInstalled = false } = {}) {
      const gaps = [];

      for (const pluginId of manifest.requiredPlugins || []) {
        const plugin = await store?.getPlugin?.(pluginId);
        if (!plugin || plugin.enabled === false) {
          gaps.push({ kind: 'plugin', id: pluginId });
        }
      }

      for (const packageId of manifest.requiredMarketplacePackages || []) {
        if (!catalogHasPackage(packageId)) {
          gaps.push({ kind: 'marketplace', id: packageId, reason: 'not_in_catalog' });
          continue;
        }
        if (strictInstalled && !(await isMarketplaceInstalled(packageId))) {
          gaps.push({ kind: 'marketplace', id: packageId, reason: 'not_installed' });
        }
      }

      for (const pipeId of manifest.requiredPipelines || []) {
        const pipelineOk = KNOWN_PIPELINES.includes(pipeId) && !!pipeline?.executor;
        if (!pipelineOk) gaps.push({ kind: 'pipeline', id: pipeId });
      }

      const needsBilling = (manifest.permissions || []).includes('billing.meter');
      if (needsBilling && !billingEngine?.enabled) {
        gaps.push({ kind: 'billing', reason: 'billing_disabled' });
      }

      const needsGovernance = (manifest.permissions || []).includes('governance.audit');
      if (needsGovernance && !governance?.enabled) {
        gaps.push({ kind: 'governance', reason: 'governance_disabled' });
      }

      if (needsBilling && billingEngine?.enabled && userId) {
        try {
          await billingEngine.checkEntitlement?.({ userId, requiredTier: 'standard' });
        } catch (e) {
          gaps.push({ kind: 'billing', reason: e.code || e.message });
        }
      }

      for (const model of manifest.requiredModels || []) {
        const rules = await store?.listPolicyRules?.({ enabled: true }) || [];
        const found = rules.some((r) => r.decision?.model === model || (r.decision?.fallback || []).includes(model));
        if (!found) gaps.push({ kind: 'model', id: model });
      }

      for (const policy of manifest.requiredPolicies || []) {
        const rules = await store?.listPolicyRules?.({ enabled: true }) || [];
        const found = rules.some((r) => r.task_type === policy || r.id === policy);
        if (!found) gaps.push({ kind: 'policy', id: policy });
      }

      return { ok: gaps.length === 0, gaps };
    },
  };
}
