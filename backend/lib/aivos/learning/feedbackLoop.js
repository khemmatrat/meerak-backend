import { randomUUID } from 'crypto';

/**
 * Feedback Loop – closed-loop cycle that collects feedback signals,
 * computes score deltas, and routes proposals to the appropriate learning modules.
 *
 * Spec: "batch-oriented — never blocks pipeline hot path"
 * Step 5 of the Feedback Loop feeds back into Prompt/Brand/Creative proposals.
 */
export function createFeedbackLoop(deps = {}) {
  const signals = deps.signals;               // LearningSignals
  const promptLearning = deps.promptLearning; // optional
  const creativeLearning = deps.creativeLearning;
  const brandLearning = deps.brandLearning;
  const events = deps.events;                 // Runtime events

  const feedbackLog = [];
  const proposals = [];

  /**
   * Submit a feedback entry for a published job.
   * @param {{ jobId, skillId?, promptId?, templateId?, kpis, publishResult?, source? }} params
   */
  async function submit({ jobId, skillId = null, promptId = null, templateId = null, kpis = {}, publishResult = null, source = 'system' }) {
    const id = randomUUID();
    const entry = {
      id,
      jobId,
      skillId,
      promptId,
      templateId,
      kpis,
      publishResult,
      source,
      ts: new Date().toISOString(),
      processed: false,
    };
    feedbackLog.push(entry);

    // Ingest signals
    if (signals) {
      signals.ingestFromKpis(jobId, kpis, { skillId, promptId, templateId });
    }

    return entry;
  }

  /**
   * Process all unprocessed feedback and generate proposals.
   * Designed to run in a batch job (not on the hot path).
   */
  async function processPending() {
    const pending = feedbackLog.filter((e) => !e.processed);
    const generated = [];

    for (const entry of pending) {
      const jobProposals = [];

      if (promptLearning && entry.promptId) {
        const p = promptLearning.evaluatePerformance(entry.promptId, entry.kpis);
        if (p) jobProposals.push({ type: 'prompt', ...p, jobId: entry.jobId });
      }

      if (creativeLearning && entry.templateId) {
        const p = creativeLearning.evaluateTemplate(entry.templateId, entry.kpis);
        if (p) jobProposals.push({ type: 'creative', ...p, jobId: entry.jobId });
      }

      if (brandLearning && entry.kpis) {
        const p = brandLearning.evaluateSignals(entry.jobId, entry.kpis);
        if (p) jobProposals.push({ type: 'brand', ...p, jobId: entry.jobId });
      }

      proposals.push(...jobProposals);
      generated.push(...jobProposals);
      entry.processed = true;
      entry.proposals = jobProposals.map((p) => p.type);
    }

    if (events && generated.length > 0) {
      await events.emit({
        name: 'aivos.learning.feedback.processed',
        correlationId: 'learning-batch',
        source: { agentId: 'learning' },
        payload: { processed: pending.length, proposals: generated.length },
      }).catch(() => {});
    }

    return { processed: pending.length, proposals: generated };
  }

  function listProposals(filter = {}) {
    return proposals.filter((p) => {
      if (filter.type && p.type !== filter.type) return false;
      if (filter.jobId && p.jobId !== filter.jobId) return false;
      return true;
    });
  }

  function listLog(filter = {}) {
    return feedbackLog.filter((e) => {
      if (filter.processed !== undefined && e.processed !== filter.processed) return false;
      return true;
    });
  }

  return { submit, processPending, listProposals, listLog };
}

export default createFeedbackLoop;
