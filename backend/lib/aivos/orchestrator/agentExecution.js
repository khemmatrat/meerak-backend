function ensureRuns(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.orchestratorRuns) store._tables.orchestratorRuns = new Map();
  return store._tables.orchestratorRuns;
}

export function createAgentExecution({
  store,
  planner,
  coordinator,
  memoryFactory,
  timeline,
  metrics,
  recovery,
  registry,
  events,
  billingEngine,
  analyticsEngine,
  conversationFactory,
} = {}) {
  const activeRuns = ensureRuns(store) || new Map();

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
    async execute({ capabilities, intent = {}, userId = null } = {}) {
      const runId = intent.runId || `orch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const plan = planner.buildPlan({ capabilities, intent });
      const memory = memoryFactory({ context: { ...intent, userId } });
      const conversation = conversationFactory(memory);
      const started = Date.now();

      timeline.start(runId, { planId: plan.id, capabilities: plan.capabilities });
      await emit('aivos.orchestrator.started', { runId, planId: plan.id });

      const run = {
        id:       runId,
        plan,
        memory,
        status:   'running',
        startedAt: new Date().toISOString(),
        userId,
      };
      activeRuns.set(runId, run);

      try {
        const { results, merged } = await coordinator.executePlan(plan, {
          runId,
          memory,
          conversation,
          timeoutMs: intent.timeoutMs || 5000,
          maxRetries: intent.maxRetries || 1,
        });

        const totalLatencyMs = Date.now() - started;
        let cost = 0;
        if (billingEngine?.enabled && userId) {
          cost = results.length * 0.01;
        }
        if (analyticsEngine?.enabled && analyticsEngine.collector?.trackImpression) {
          analyticsEngine.collector.trackImpression({ jobId: runId, platform: 'orchestrator' });
        }

        const agentMetrics = results.map((r) => ({
          agentId:   r.agentId || r.skillId,
          latencyMs: r.latencyMs || 0,
          capability: r.capability,
        }));
        metrics.recordRun({ runId, agents: agentMetrics, totalLatencyMs, cost, success: true });
        timeline.finish(runId, 'completed');

        run.status = 'completed';
        run.completedAt = new Date().toISOString();
        run.results = results;
        run.merged = merged;
        await emit('aivos.orchestrator.completed', { runId, stepCount: results.length });
        registry.listAgents();

        return {
          ok:       true,
          runId,
          plan,
          results,
          merged,
          memory:   memory.snapshot(),
          timeline: timeline.getTimeline(runId),
          metrics:  metrics.getMetrics({ runId }),
        };
      } catch (e) {
        run.status = 'failed';
        run.error = e.message;
        timeline.finish(runId, 'failed');
        metrics.recordRun({ runId, agents: [], totalLatencyMs: Date.now() - started, cost: 0, success: false });
        throw e;
      }
    },

    async resume(runId) {
      return recovery.resume(runId, { runs: activeRuns });
    },

    async cancel(runId) {
      const run = activeRuns.get(runId);
      if (!run) {
        const err = new Error('orchestration_run_not_found');
        err.code = 'ORCHESTRATION_RUN_NOT_FOUND';
        throw err;
      }
      run.status = 'cancelled';
      run.cancelledAt = new Date().toISOString();
      timeline.finish(runId, 'cancelled');
      await emit('aivos.orchestrator.cancelled', { runId });
      return { runId, status: 'cancelled' };
    },

    getRun(runId) {
      return activeRuns.get(runId) || null;
    },

    listRuns() {
      return [...activeRuns.values()].map((r) => ({
        id:     r.id,
        status: r.status,
        planId: r.plan?.id,
      }));
    },
  };
}
