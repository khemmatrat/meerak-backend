function ensureWorkflows(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.workflowRegistry) store._tables.workflowRegistry = new Map();
  return store._tables.workflowRegistry;
}

function now() {
  return new Date().toISOString();
}

export function createWorkflowRegistry({ store } = {}) {
  const map = () => ensureWorkflows(store);

  return {
    registerWorkflow(manifest, meta = {}) {
      const table = map();
      if (!table) throw new Error('workflow_registry_requires_memory_store');
      const row = {
        id:              manifest.id,
        manifest,
        enabled:         false,
        state:           'registered',
        version:         manifest.version,
        version_history: [{ version: manifest.version, at: now(), action: 'register' }],
        registered_at:   now(),
        ...meta,
      };
      table.set(manifest.id, row);
      return { ...row, manifest: { ...manifest } };
    },

    removeWorkflow(workflowId) {
      const table = map();
      if (!table?.has(workflowId)) {
        const err = new Error('workflow_not_found');
        err.code = 'WORKFLOW_NOT_FOUND';
        throw err;
      }
      table.delete(workflowId);
      return { id: workflowId, removed: true };
    },

    findWorkflow(workflowId) {
      const row = map()?.get(workflowId);
      return row ? { ...row, manifest: { ...row.manifest } } : null;
    },

    listWorkflows({ enabled } = {}) {
      return [...(map()?.values() || [])]
        .filter((w) => enabled == null || w.enabled === enabled)
        .map((w) => ({ ...w, manifest: { ...w.manifest } }));
    },

    enableWorkflow(workflowId) {
      const row = this.findWorkflow(workflowId);
      if (!row) {
        const err = new Error('workflow_not_found');
        err.code = 'WORKFLOW_NOT_FOUND';
        throw err;
      }
      row.enabled = true;
      row.state = 'enabled';
      row.enabled_at = now();
      map().set(workflowId, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    disableWorkflow(workflowId) {
      const row = this.findWorkflow(workflowId);
      if (!row) throw new Error('workflow_not_found');
      row.enabled = false;
      row.state = 'disabled';
      map().set(workflowId, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    updateWorkflow(workflowId, patch) {
      const table = map();
      const row = table?.get(workflowId);
      if (!row) throw new Error('workflow_not_found');
      Object.assign(row, patch);
      table.set(workflowId, row);
      return { ...row, manifest: { ...row.manifest } };
    },
  };
}
