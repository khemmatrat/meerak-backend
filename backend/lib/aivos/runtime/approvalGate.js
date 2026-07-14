import { APPROVAL_STATE, APPROVAL_TRANSITIONS } from './types.js';

export function createApprovalGate({ store, events }) {
  function assertTransition(from, to) {
    const allowed = APPROVAL_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      const err = new Error(`approval_invalid_transition:${from}->${to}`);
      err.code = 'APPROVAL_INVALID_TRANSITION';
      throw err;
    }
  }

  return {
    async ensureRequest(jobId) {
      let row = await store.getApprovalByJobId(jobId);
      if (!row) {
        row = await store.insertApprovalRequest({
          job_id: jobId,
          state: APPROVAL_STATE.DRAFT,
        });
      }
      return row;
    },
    async moveToPreview(jobId, previewUrl) {
      const row = await this.ensureRequest(jobId);
      assertTransition(row.state, APPROVAL_STATE.PREVIEW);
      const updated = await store.updateApprovalRequest(row.id, {
        state: APPROVAL_STATE.PREVIEW,
        preview_url: previewUrl || null,
      });
      await store.updateJob(jobId, { approval_state: APPROVAL_STATE.PREVIEW, status: 'preview' });
      if (events) {
        await events.emit({
          name: 'aivos.approval.preview',
          correlationId: jobId,
          source: { agentId: 'approval-gate', runtimeJobId: jobId },
          payload: { approvalId: updated.id, previewUrl },
        });
      }
      return updated;
    },
    async approve(jobId, userId) {
      const row = await this.ensureRequest(jobId);
      assertTransition(row.state, APPROVAL_STATE.APPROVED);
      const updated = await store.updateApprovalRequest(row.id, {
        state: APPROVAL_STATE.APPROVED,
        decided_by: userId || null,
        decided_at: new Date().toISOString(),
      });
      await store.updateJob(jobId, { approval_state: APPROVAL_STATE.APPROVED });
      return updated;
    },
    async reject(jobId, userId) {
      const row = await this.ensureRequest(jobId);
      assertTransition(row.state, APPROVAL_STATE.REJECTED);
      const updated = await store.updateApprovalRequest(row.id, {
        state: APPROVAL_STATE.REJECTED,
        decided_by: userId || null,
        decided_at: new Date().toISOString(),
      });
      await store.updateJob(jobId, { approval_state: APPROVAL_STATE.REJECTED });
      return updated;
    },
    async reprompt(jobId, intent, userId) {
      const row = await this.ensureRequest(jobId);
      assertTransition(row.state, APPROVAL_STATE.REPROMPT);
      const updated = await store.updateApprovalRequest(row.id, {
        state: APPROVAL_STATE.REPROMPT,
        reprompt_intent: intent,
        decided_by: userId || null,
        decided_at: new Date().toISOString(),
      });
      await store.updateJob(jobId, { approval_state: APPROVAL_STATE.REPROMPT, intent });
      assertTransition(APPROVAL_STATE.REPROMPT, APPROVAL_STATE.PREVIEW);
      return store.updateApprovalRequest(updated.id, { state: APPROVAL_STATE.PREVIEW });
    },
  };
}
