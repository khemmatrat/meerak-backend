import { getSkillTemplate } from '../skill/skillTemplate.js';
import { getWorkflowTemplate } from '../workflow/workflowTemplate.js';

export function createApplicationInstaller({
  skills,
  workflows,
  knowledge,
  marketplace,
  registry,
} = {}) {
  return {
    async install(manifest, { tenantId = 'default', userId = null } = {}) {
      const installed = { skills: [], workflows: [], knowledge: [], marketplace: [] };

      for (const packageId of manifest.marketplacePackages || []) {
        if (marketplace?.enabled) {
          try {
            const row = await marketplace.install({ packageId, type: 'plugin', userId });
            installed.marketplace.push(row);
          } catch (e) {
            const existing = (await marketplace.listInstalled()).find((p) => p.package_id === packageId);
            if (existing) installed.marketplace.push(existing);
          }
        }
      }

      for (const skillId of manifest.skillBundle || []) {
        const tpl = getSkillTemplate(skillId);
        if (!tpl) continue;
        if (!skills?.registry?.findSkill?.(skillId)) await skills.install(tpl);
        await skills.enable(skillId);
        installed.skills.push(skillId);
      }

      for (const wfId of manifest.workflowBundle || []) {
        const tpl = getWorkflowTemplate(wfId);
        if (!tpl) continue;
        if (!workflows?.registry?.findWorkflow?.(wfId)) workflows.register(tpl);
        workflows.registry.enableWorkflow(wfId);
        installed.workflows.push(wfId);
      }

      for (const topic of manifest.knowledgeBundle || []) {
        if (knowledge?.enabled) {
          await knowledge.ingestDocument({
            title: topic,
            body:  `${topic} knowledge bundle for application ${manifest.id}`,
            format: 'text',
            metadata: { source: 'application_bundle', appId: manifest.id, tenantId },
          });
          installed.knowledge.push(topic);
        }
      }

      const row = registry.register(manifest, { tenantId });
      registry.update(manifest.id, { installed: true, state: 'installed', installed_at: new Date().toISOString() }, { tenantId });
      return { ...row, installed };
    },

    async uninstall(appId, { tenantId = 'default' } = {}) {
      const row = registry.find(appId, { tenantId });
      if (!row) throw new Error('application_not_found');

      for (const skillId of row.manifest.skillBundle || []) {
        await skills?.disable?.(skillId).catch(() => {});
      }
      for (const wfId of row.manifest.workflowBundle || []) {
        workflows?.registry?.disableWorkflow?.(wfId);
      }
      registry.remove(appId, { tenantId });
      return { id: appId, uninstalled: true, tenantId };
    },
  };
}
