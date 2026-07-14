export function createWorkflowAudit({ governance, store } = {}) {
  const history = [];

  function ensureExecutions(storeRef) {
    if (storeRef?.kind !== 'memory') return null;
    if (!storeRef._tables.workflowExecutions) storeRef._tables.workflowExecutions = new Map();
    return storeRef._tables.workflowExecutions;
  }

  return {
    recordExecution({ executionId, workflowId, status, timeline = [], variables = {} } = {}) {
      const row = {
        executionId,
        workflowId,
        status,
        timeline: [...timeline],
        variables,
        at: new Date().toISOString(),
      };
      history.push(row);
      const table = ensureExecutions(store);
      table?.set(executionId, row);
      return row;
    },

    async recordRevision({ workflowId, action, diff = {} } = {}) {
      const row = { workflowId, action, diff, at: new Date().toISOString() };
      history.push(row);
      if (governance?.enabled && governance.auditVersionChange) {
        await governance.auditVersionChange({
          entityType: 'workflow_template',
          entityId:   workflowId,
          action,
          diff,
        }).catch(() => {});
      }
      return row;
    },

    listExecutions({ workflowId } = {}) {
      return history.filter((h) => h.executionId && (!workflowId || h.workflowId === workflowId));
    },

    getExecution(executionId) {
      return ensureExecutions(store)?.get(executionId) || history.find((h) => h.executionId === executionId) || null;
    },

    summary() {
      return { total: history.length, executions: this.listExecutions().length };
    },
  };
}
