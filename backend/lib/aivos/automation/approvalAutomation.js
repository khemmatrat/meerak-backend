/**
 * Approval Automation – automates the approval workflow for content,
 * budgets, and policy changes based on configurable approval rules.
 *
 * Auto-approves if all approval criteria are met; escalates otherwise.
 */
export function createApprovalAutomation(deps = {}) {
  const ruleEngine         = deps.ruleEngine         || null;
  const notificationEngine = deps.notificationEngine || null;
  const auditLog           = deps.automationAudit    || null;

  const pending   = new Map(); // requestId -> request
  const decisions = [];

  /**
   * Submit an item for automated approval review.
   * @param {{ id, type, payload, requestedBy }} request
   * @returns {{ requestId, decision: 'approved'|'rejected'|'escalated', reason }}
   */
  async function submit(request) {
    const requestId = request.id || `approval_${Date.now()}`;
    const req = { ...request, requestId, submittedAt: new Date().toISOString() };
    pending.set(requestId, req);

    // Evaluate rules to auto-approve/reject
    let decision = 'escalated';
    let reason   = 'no_matching_rule';

    if (ruleEngine) {
      const matches = ruleEngine.evaluate({ approvalType: request.type, payload: request.payload });
      const approveRule = matches.find((m) => m.action === 'auto_approve');
      const rejectRule  = matches.find((m) => m.action === 'auto_reject');
      if (rejectRule)  { decision = 'rejected';  reason = rejectRule.name; }
      else if (approveRule) { decision = 'approved'; reason = approveRule.name; }
    }

    // Notify if escalated
    if (decision === 'escalated' && notificationEngine) {
      await notificationEngine.send({
        type: 'approval_needed',
        title: `Approval required: ${request.type}`,
        body: `Request ${requestId} requires manual review.`,
        meta: { requestId, type: request.type },
      });
    }

    const result = { requestId, decision, reason, decidedAt: new Date().toISOString() };
    decisions.push({ ...req, ...result });
    pending.delete(requestId);
    if (auditLog) auditLog.log({ type: 'approval_decision', ...result });
    return result;
  }

  function getPending()  { return [...pending.values()]; }
  function getDecisions() { return [...decisions]; }

  return { submit, getPending, getDecisions };
}

export default createApprovalAutomation;
