/**
 * AQOND AI-OS Runtime SDK — external surface for plugins and clients.
 * Hard rule: no kernel/* imports.
 */
import { createGrowthSdk } from './growth/index.js';

export function createAivosSdk({ runtime, baseUrl = '/api/aivos' } = {}) {
  if (!runtime) throw new Error('aivos_sdk_error: runtime_required');

  const rt = {
    submitJob: (pluginId, intent, options) =>
      runtime.taskRuntime.submitJob({ pluginId, intent, ...options }),
    getJob: (jobId) => runtime.taskRuntime.getJob(jobId),
    approve: (jobId, options = {}) => runtime.taskRuntime.approve(jobId, options.userId),
    reject: (jobId, options = {}) => runtime.taskRuntime.reject(jobId, options.userId),
    reprompt: (jobId, intent, options = {}) => runtime.taskRuntime.reprompt(jobId, intent, options.userId),
    getJobTimeline: async (jobId) => runtime.observability.getTimeline(jobId),
    getJobAudit: (jobId) => runtime.governance.reproduce(jobId),
    cancel: async (jobId) => {
      const job = await runtime.store.getJob(jobId);
      if (!job) return null;
      return runtime.store.updateJob(jobId, { status: 'cancelled' });
    },
  };

  const workflow = {
    listInstalled: () => runtime.marketplace.listInstalled(),
    install: async (packageId, version) => {
      if (!runtime.marketplace.enabled) return { ok: false, reason: 'marketplace_disabled' };
      return runtime.marketplace.install({ packageId, version });
    },
    enable: async (packageId, opts = {}) => {
      if (!runtime.marketplace.enabled) return { ok: false, reason: 'marketplace_disabled' };
      return runtime.marketplace.enable({ packageId, type: opts.type || 'plugin' });
    },
    disable: async (packageId, opts = {}) => {
      if (!runtime.marketplace.enabled) return { ok: false, reason: 'marketplace_disabled' };
      return runtime.marketplace.disable({ packageId, type: opts.type || 'plugin' });
    },
    upgrade: async (packageId, version, opts = {}) => {
      if (!runtime.marketplace.enabled) return { ok: false, reason: 'marketplace_disabled' };
      return runtime.marketplace.upgrade({ packageId, version, type: opts.type || 'plugin' });
    },
    rollback: async (packageId, opts = {}) => {
      if (!runtime.marketplace.enabled) return { ok: false, reason: 'marketplace_disabled' };
      return runtime.marketplace.rollback({ packageId, type: opts.type || 'plugin' });
    },
  };

  const video = {
    createJob: (input) => rt.submitJob(input.pluginId || 'resume-ai', input.intent || input, input.options),
    retry: async () => ({ ok: false, reason: 'phase_3_scope' }),
    publish: async (jobId) => rt.approve(jobId),
  };

  const memory = {
    search: async () => ({ ok: false, reason: 'phase_2_scope' }),
    append: async () => ({ ok: false, reason: 'phase_2_scope' }),
  };

  const plugin = {
    getCapabilities: async (pluginId) => {
      const p = await runtime.registry.getPlugin(pluginId);
      return p?.capabilities || [];
    },
  };

  const agent = {
    list: async () => [],
  };

  const events = {
    list: (jobId) => runtime.events.listByJob(jobId),
  };

  const growth = createGrowthSdk({ runtime, baseUrl: `${baseUrl}/growth` });

  return {
    baseUrl,
    runtime: () => rt,
    workflow: () => workflow,
    video: () => video,
    memory: () => memory,
    plugin: () => plugin,
    agent: () => agent,
    events: () => events,
    growth: () => growth,
  };
}

export default function aqond(deps) {
  return createAivosSdk(deps);
}

export function assertNoKernelImports(moduleUrl) {
  const forbidden = ['kernel/', '/kernel/', 'ai-core/kernel'];
  for (const token of forbidden) {
    if (String(moduleUrl || '').includes(token)) {
      throw new Error('sdk_kernel_import_forbidden');
    }
  }
  return true;
}
