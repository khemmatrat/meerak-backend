export function createWorkflowVariables() {
  function interpolateString(template, ctx) {
    return String(template).replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, path) => {
      const parts = path.split('.');
      let cur = ctx;
      for (const p of parts) {
        cur = cur?.[p];
        if (cur == null) break;
      }
      return cur == null ? '' : String(cur);
    });
  }

  return {
    buildContext({ input = {}, system = {}, runtime = {}, knowledge = {}, memory = {}, artifact = {}, outputs = {} } = {}) {
      return { input, system, runtime, knowledge, memory, artifact, outputs };
    },

    resolve(manifest, ctx = {}) {
      const resolved = {};
      for (const variable of manifest.variables || []) {
        const scope = variable.scope || 'input';
        const key = variable.name;
        if (scope === 'input') resolved[key] = ctx.input?.[key] ?? variable.default ?? null;
        else if (scope === 'system') resolved[key] = ctx.system?.[key] ?? variable.default ?? null;
        else if (scope === 'runtime') resolved[key] = ctx.runtime?.[key] ?? variable.default ?? null;
        else if (scope === 'knowledge') resolved[key] = ctx.knowledge?.[key] ?? variable.default ?? null;
        else if (scope === 'memory') resolved[key] = ctx.memory?.[key] ?? variable.default ?? null;
        else if (scope === 'artifact') resolved[key] = ctx.artifact?.[key] ?? variable.default ?? null;
        else if (scope === 'outputs') resolved[key] = ctx.outputs?.[key] ?? variable.default ?? null;
        else resolved[key] = ctx[scope]?.[key] ?? variable.default ?? null;
      }
      return resolved;
    },

    interpolate(value, ctx) {
      if (typeof value === 'string') return interpolateString(value, ctx);
      if (Array.isArray(value)) return value.map((v) => this.interpolate(v, ctx));
      if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = this.interpolate(v, ctx);
        return out;
      }
      return value;
    },
  };
}
