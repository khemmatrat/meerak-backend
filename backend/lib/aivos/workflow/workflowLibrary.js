import { BUILTIN_WORKFLOW_TEMPLATES, getWorkflowTemplate } from './workflowTemplate.js';

import { validateManifest } from './workflowValidator.js';

export function createWorkflowLibrary({ registry } = {}) {
  return {
    list() {
      return BUILTIN_WORKFLOW_TEMPLATES.map((t) => ({ ...t }));
    },

    get(id) {
      return getWorkflowTemplate(id);
    },

    registerBuiltin(id) {
      const tpl = getWorkflowTemplate(id);
      if (!tpl) {
        const err = new Error('workflow_template_not_found');
        err.code = 'WORKFLOW_TEMPLATE_NOT_FOUND';
        throw err;
      }
      const validation = validateManifest(tpl);
      if (!validation.ok) {
        const err = new Error('workflow_manifest_invalid');
        err.code = 'WORKFLOW_MANIFEST_INVALID';
        err.details = validation.errors;
        throw err;
      }
      return registry.registerWorkflow(validation.manifest);
    },

    registerAll() {
      const rows = [];
      for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
        rows.push(this.registerBuiltin(tpl.id));
      }
      return rows;
    },
  };
}
