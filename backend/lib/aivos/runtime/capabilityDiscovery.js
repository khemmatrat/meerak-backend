import { CANONICAL_DAG_NODES } from './types.js';

export function createCapabilityDiscovery({ registry, events }) {
  return {
    async discover({ pluginId, intent = {} }) {
      const plugin = await registry.getPlugin(pluginId);
      if (!plugin) {
        const err = new Error('plugin_not_registered');
        err.code = 'PLUGIN_NOT_FOUND';
        throw err;
      }

      const capabilities = [...(plugin.capabilities || [])];
      if (intent?.artifact?.type === 'pdf' || intent?.input?.format === 'pdf') {
        if (!capabilities.includes('ocr.pdf')) capabilities.push('ocr.pdf');
      }

      const skills = await registry.listSkills();
      const matched = skills.filter((skill) =>
        (skill.capabilities || []).some((cap) => capabilities.includes(cap)),
      );

      const required = plugin.required_skills || [];
      for (const req of required) {
        if (!matched.some((s) => s.skill_id === req)) {
          if (events) {
            await events.emit({
              name: 'aivos.runtime.capability_gap',
              correlationId: intent._jobId || 'discovery',
              source: { agentId: 'runtime', skillId: null, runtimeJobId: intent._jobId || 'discovery' },
              payload: { pluginId, missingSkill: req, capabilities },
            });
          }
          const err = new Error('capability_gap');
          err.code = 'CAPABILITY_GAP';
          err.details = { missingSkill: req };
          throw err;
        }
      }

      return {
        plugin,
        capabilities,
        matchedSkills: matched.map((s) => s.skill_id),
        templateNodes: CANONICAL_DAG_NODES.map((n) => n.id),
      };
    },
  };
}
