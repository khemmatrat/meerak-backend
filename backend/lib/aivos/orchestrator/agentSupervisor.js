export function createAgentSupervisor({ automation, events } = {}) {
  const health = new Map();

  async function emit(name, payload) {
    if (events?.emit) {
      await events.emit({
        name,
        correlationId: payload.runId || 'orchestrator',
        source:        { runtimeJobId: payload.runId || null },
        payload,
      }).catch(() => {});
    }
  }

  return {
    async monitor(agentId, fn, { timeoutMs = 5000, maxRetries = 2, runId } = {}) {
      health.set(agentId, 'running');
      let attempt = 0;
      let lastError = null;

      while (attempt <= maxRetries) {
        attempt += 1;
        try {
          const result = await Promise.race([
            fn(),
            new Promise((_resolve, reject) => {
              setTimeout(() => reject(Object.assign(new Error('agent_timeout'), { code: 'AGENT_TIMEOUT' })), timeoutMs);
            }),
          ]);
          health.set(agentId, 'healthy');
          return { ok: true, result, attempt };
        } catch (e) {
          lastError = e;
          health.set(agentId, 'degraded');
          if (automation?.autoRetry?.execute) {
            try {
              const retried = await automation.autoRetry.execute(() => fn(), { maxAttempts: 1 });
              health.set(agentId, 'healthy');
              return { ok: true, result: retried, attempt: attempt + 1, retried: true };
            } catch (_) {
              /* fall through */
            }
          }
        }
      }

      health.set(agentId, 'failed');
      await emit('aivos.orchestrator.agent.escalated', { agentId, runId, error: lastError?.message });
      const err = lastError || new Error('agent_failed');
      err.code = err.code || 'AGENT_SUPERVISOR_FAILED';
      throw err;
    },

    getHealth(agentId) {
      return health.get(agentId) || 'unknown';
    },

    listHealth() {
      return Object.fromEntries(health.entries());
    },
  };
}
