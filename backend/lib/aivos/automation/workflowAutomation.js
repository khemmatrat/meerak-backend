/**
 * Workflow Automation – executes multi-step automation workflows.
 *
 * A workflow is a named sequence of steps. Each step is an async function
 * that receives the shared workflow context and returns a partial result.
 * Steps run sequentially; a failed step can be configured to halt or skip.
 */
export function createWorkflowAutomation(deps = {}) {
  const ruleEngine = deps.ruleEngine || null;
  const constraintEngine = deps.constraintEngine || null;
  const auditLog = deps.automationAudit || null;

  const workflows = new Map();
  const runs = [];

  /**
   * Register a workflow definition.
   * @param {{ id, name, steps: { id, run: async (ctx) => any, onError? }[], timeout? }} wf
   */
  function register(wf) {
    workflows.set(wf.id, wf);
  }

  /**
   * Execute a registered workflow.
   * @param {string} workflowId
   * @param {object} initialContext
   * @returns {{ runId, workflowId, status, steps, context, error? }}
   */
  async function execute(workflowId, initialContext = {}) {
    const wf = workflows.get(workflowId);
    if (!wf) throw new Error(`workflow_not_found:${workflowId}`);

    const runId = `run_${workflowId}_${Date.now()}`;
    const ctx = { ...initialContext, _runId: runId, _workflowId: workflowId };
    const stepResults = [];
    let status = 'running';
    let error = null;

    // Constraint check before running
    if (constraintEngine) {
      const { allowed, violations } = constraintEngine.validate({ action: workflowId, context: ctx });
      if (!allowed) {
        const result = { runId, workflowId, status: 'blocked', steps: [], context: ctx, violations };
        runs.push(result);
        if (auditLog) auditLog.log({ type: 'workflow_blocked', workflowId, violations });
        return result;
      }
    }

    for (const step of (wf.steps || [])) {
      const stepStart = Date.now();
      let stepResult, stepStatus;
      try {
        stepResult = await step.run(ctx);
        // Merge partial result into context
        if (stepResult && typeof stepResult === 'object') Object.assign(ctx, stepResult);
        stepStatus = 'ok';
      } catch (err) {
        stepStatus = 'error';
        stepResult = { error: err.message };
        stepResults.push({ id: step.id, status: stepStatus, result: stepResult, durationMs: Date.now() - stepStart });
        if (step.onError === 'halt') { status = 'failed'; error = err.message; break; }
        continue;
      }
      stepResults.push({ id: step.id, status: stepStatus, result: stepResult, durationMs: Date.now() - stepStart });
    }

    if (status === 'running') status = 'complete';
    const run = { runId, workflowId, status, steps: stepResults, context: ctx, error };
    runs.push(run);
    if (auditLog) auditLog.log({ type: 'workflow_executed', workflowId, runId, status });
    return run;
  }

  function list()    { return [...workflows.keys()]; }
  function history() { return [...runs]; }

  return { register, execute, list, history };
}

export default createWorkflowAutomation;
