import { isAutoTuneEnabled, autoTuneConfidenceThreshold } from './config.js';

/**
 * Auto Tuning – automatically applies safe configuration changes from optimizers
 * when auto-tune is enabled and confidence exceeds threshold.
 *
 * Maintains an audit log of all applied/rejected tunings.
 */
export function createAutoTuning(deps = {}) {
  const templateOptimizer = deps.templateOptimizer || null;
  const pipelineOptimizer = deps.pipelineOptimizer || null;
  const promptOptimizer = deps.promptOptimizer || null;

  const auditLog = [];

  /**
   * Apply a recommendation if auto-tune is on and confidence is sufficient.
   * @param {{ category, action, data, confidence }} rec
   * @returns {{ applied: boolean, reason: string }}
   */
  function applyRecommendation(rec) {
    const threshold = autoTuneConfidenceThreshold();
    const autoTune = isAutoTuneEnabled();

    if (!autoTune) {
      const entry = { ts: new Date().toISOString(), rec, applied: false, reason: 'auto_tune_disabled' };
      auditLog.push(entry);
      return { applied: false, reason: 'auto_tune_disabled' };
    }

    if ((rec.confidence || 0) < threshold) {
      const entry = { ts: new Date().toISOString(), rec, applied: false, reason: `confidence_below_threshold:${threshold}` };
      auditLog.push(entry);
      return { applied: false, reason: `confidence_below_threshold:${threshold}` };
    }

    let applied = false;
    let reason = 'no_handler';

    try {
      if (rec.category === 'creative' && rec.action === 'use_template' && templateOptimizer && rec.data?.templateId) {
        templateOptimizer.apply(rec.data.templateId, rec.data.suggestions || {});
        applied = true; reason = 'template_applied';
      } else if (rec.category === 'pipeline' && pipelineOptimizer && rec.data?.nodeId) {
        pipelineOptimizer.apply(rec.data.nodeId, rec.data);
        applied = true; reason = 'pipeline_node_updated';
      } else if (rec.category === 'prompt' && rec.action === 'use_prompt' && promptOptimizer && rec.data?.promptId) {
        promptOptimizer.override(rec.data.skillId || 'default', rec.data.promptId, rec.data.version, rec.confidence);
        applied = true; reason = 'prompt_override_set';
      }
    } catch (err) {
      reason = `error:${err.message}`;
    }

    auditLog.push({ ts: new Date().toISOString(), rec, applied, reason });
    return { applied, reason };
  }

  /**
   * Process an array of recommendations (from autoRecommendation.generate()).
   * @param {object[]} recommendations
   * @returns {{ applied: number, skipped: number, results: object[] }}
   */
  function processBatch(recommendations = []) {
    const results = recommendations.map((r) => ({ rec: r, ...applyRecommendation(r) }));
    const applied = results.filter((r) => r.applied).length;
    return { applied, skipped: results.length - applied, results };
  }

  function getAuditLog() { return [...auditLog]; }

  return { applyRecommendation, processBatch, getAuditLog };
}

export default createAutoTuning;
