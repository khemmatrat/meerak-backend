import { getSkillTemplate } from '../skill/skillTemplate.js';
import { getWorkflowTemplate } from '../workflow/workflowTemplate.js';
import { DEFAULT_PLUGINS } from '../marketplace/catalog.js';

export function createApplicationDependency({
  skills,
  workflows,
  knowledge,
  marketplace,
  billingEngine,
  governance,
} = {}) {
  function catalogHasPackage(packageId) {
    return DEFAULT_PLUGINS.some((p) => p.package_id === packageId);
  }

  return {
    async resolve(manifest, { tenantId, userId, strictInstalled = false } = {}) {
      const gaps = [];

      for (const skillId of manifest.skillBundle || []) {
        const tpl = getSkillTemplate(skillId);
        if (!tpl) { gaps.push({ kind: 'skill', id: skillId, reason: 'template_missing' }); continue; }
        const row = skills?.registry?.findSkill?.(skillId);
        if (strictInstalled && (!row || !row.enabled)) gaps.push({ kind: 'skill', id: skillId, reason: 'not_enabled' });
      }

      for (const wfId of manifest.workflowBundle || []) {
        if (!getWorkflowTemplate(wfId)) gaps.push({ kind: 'workflow', id: wfId, reason: 'template_missing' });
        else if (strictInstalled && !workflows?.registry?.findWorkflow?.(wfId)) {
          gaps.push({ kind: 'workflow', id: wfId, reason: 'not_registered' });
        }
      }

      for (const topic of manifest.knowledgeBundle || []) {
        if (knowledge?.enabled && strictInstalled) {
          const hits = knowledge.searchKnowledge?.({ query: topic, limit: 1 });
          if (!hits?.results?.length) gaps.push({ kind: 'knowledge', id: topic, reason: 'not_ingested' });
        }
      }

      for (const packageId of manifest.marketplacePackages || []) {
        if (!catalogHasPackage(packageId)) gaps.push({ kind: 'marketplace', id: packageId, reason: 'not_in_catalog' });
        if (strictInstalled && marketplace?.enabled) {
          const installed = await marketplace.listInstalled();
          if (!installed.some((p) => p.package_id === packageId)) {
            gaps.push({ kind: 'marketplace', id: packageId, reason: 'not_installed' });
          }
        }
      }

      if (billingEngine?.enabled && userId) {
        try {
          await billingEngine.checkEntitlement?.({ userId, requiredTier: 'standard' });
        } catch (e) {
          gaps.push({ kind: 'billing', reason: e.code || e.message });
        }
      }

      if (manifest.tenantScoped && !tenantId) gaps.push({ kind: 'tenant', reason: 'tenant_required' });

      return { ok: gaps.length === 0, gaps, tenantId: tenantId || 'default' };
    },
  };
}
