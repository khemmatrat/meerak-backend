export function createAgentRouter({ skills } = {}) {
  return {
    route(capability) {
      if (!capability) {
        return { ok: false, reason: 'capability_required' };
      }
      if (capability === 'render' || capability === 'publish') {
        return {
          ok: true,
          capability,
          agentId:    `pipeline:${capability}`,
          skillId:    null,
          source:     'pipeline',
          pipelineNode: capability,
        };
      }
      const lookup = skills?.capability?.lookup?.(capability);
      const matched = lookup?.matchedSkills || [];
      if (!matched.length) {
        return { ok: false, capability, reason: 'no_agent_for_capability' };
      }
      return {
        ok: true,
        capability,
        agentId:  matched[0],
        skillId:  matched[0],
        source:   'skill',
        runtimeCapabilities: lookup.runtimeCapabilities || [],
      };
    },

    routeAll(capabilities = []) {
      return capabilities.map((cap) => this.route(cap));
    },
  };
}
