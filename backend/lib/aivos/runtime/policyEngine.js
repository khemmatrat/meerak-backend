export function createPolicyEngine({ store, events }) {
  function rejectPluginModel(intent, jobId, traceId) {
    const modelKeys = ['model', 'modelId', 'model_id', 'modelSlot', 'model_slot'];
    for (const key of modelKeys) {
      if (intent?.[key] != null || intent?.options?.[key] != null) {
        return {
          rejected: true,
          reason: 'plugin_model_selection_forbidden',
          field: key,
        };
      }
    }
    return { rejected: false };
  }

  return {
    async resolve({ jobId, pluginId, taskType, intent, traceId, userTier = 'standard' }) {
      const pluginReject = rejectPluginModel(intent, jobId, traceId);
      if (pluginReject.rejected) {
        const decisionRow = await store.insertPolicyDecision({
          job_id: jobId,
          task_type: taskType,
          decision: {},
          trace_id: traceId,
          rejected_reason: pluginReject.reason,
        });
        const err = new Error(pluginReject.reason);
        err.code = 'POLICY_REJECTED';
        err.decisionId = decisionRow.id;
        throw err;
      }

      const rules = await store.listPolicyRules({ taskType, enabled: true });
      let matched = rules[0] || null;
      if (!matched) {
        matched = {
          id: null,
          decision: { model: 'hermes3:3b', max_tokens: 2048, fallback: ['qwen2:7b'] },
        };
      }

      const decision = {
        modelSlot: matched.decision?.model || matched.decision?.modelSlot || 'hermes3:3b',
        taskType,
        maxTokens: matched.decision?.max_tokens || matched.decision?.maxTokens || 2048,
        fallbacks: matched.decision?.fallback || [],
        userTier,
        pluginId,
      };

      const row = await store.insertPolicyDecision({
        job_id: jobId,
        rule_id: matched.id || null,
        task_type: taskType,
        decision,
        trace_id: traceId,
      });

      if (events) {
        await events.emit({
          name: 'aivos.policy.resolved',
          correlationId: jobId,
          traceId,
          source: { agentId: 'policy-engine', skillId: null, runtimeJobId: jobId },
          payload: { decisionId: row.id, taskType, modelSlot: decision.modelSlot },
        });
      }

      return { decision, decisionId: row.id, auditRow: row };
    },
  };
}
