/**
 * Campaign Automation – manages automated content campaigns:
 * recurring publish cycles, per-platform quotas, and pacing.
 *
 * A campaign defines: platforms, frequency, content template, budget, and goal.
 */
export function createCampaignAutomation(deps = {}) {
  const publishEngine   = deps.publishEngine   || null;
  const goalEngine      = deps.goalEngine      || null;
  const scheduler       = deps.scheduler       || null;
  const auditLog        = deps.automationAudit || null;

  const campaigns = new Map();
  const stats     = new Map(); // campaignId -> { publishCount, lastPublished }

  /**
   * Define a campaign.
   * @param {{ id, name, platforms, intervalMs, budgetPerRun, contentTemplate, goalId? }} cfg
   */
  function define(cfg) {
    campaigns.set(cfg.id, { ...cfg, active: false, createdAt: new Date().toISOString() });
    stats.set(cfg.id, { publishCount: 0, lastPublished: null });
  }

  /** Activate a campaign (starts the scheduler). */
  function activate(campaignId) {
    const c = campaigns.get(campaignId);
    if (!c) throw new Error(`campaign_not_found:${campaignId}`);
    c.active = true;
    if (scheduler) {
      scheduler.scheduleInterval({
        id: `campaign_${campaignId}`,
        intervalMs: c.intervalMs,
        handler: () => _runCycle(campaignId),
        meta: { campaignId },
      });
    }
    if (auditLog) auditLog.log({ type: 'campaign_activated', campaignId });
    return { campaignId, active: true };
  }

  /** Deactivate a campaign. */
  function deactivate(campaignId) {
    const c = campaigns.get(campaignId);
    if (c) c.active = false;
    if (scheduler) scheduler.cancel(`campaign_${campaignId}`);
    if (auditLog) auditLog.log({ type: 'campaign_deactivated', campaignId });
  }

  /** Run one campaign cycle (publish + record goal progress). */
  async function _runCycle(campaignId) {
    const c = campaigns.get(campaignId);
    if (!c || !c.active) return { skipped: true };
    const s = stats.get(campaignId);

    let publishResult = null;
    if (publishEngine) {
      try {
        publishResult = await publishEngine.service.publish(
          `campaign_${campaignId}_${Date.now()}`,
          c.contentTemplate || {},
          c.platforms || [],
          {},
        );
      } catch (err) {
        publishResult = { error: err.message };
      }
    } else {
      publishResult = { stub: true, platforms: c.platforms };
    }

    s.publishCount += 1;
    s.lastPublished = new Date().toISOString();

    if (goalEngine && c.goalId) {
      try { goalEngine.record(c.goalId, 1); } catch (_) {}
    }

    if (auditLog) auditLog.log({ type: 'campaign_cycle', campaignId, publishCount: s.publishCount });
    return { campaignId, publishCount: s.publishCount, publishResult };
  }

  /** Manually trigger one cycle (bypasses active check). */
  async function runCycle(campaignId) {
    const c = campaigns.get(campaignId);
    if (!c) throw new Error(`campaign_not_found:${campaignId}`);
    const s = stats.get(campaignId);
    let publishResult = null;
    if (publishEngine) {
      try {
        publishResult = await publishEngine.service.publish(
          `campaign_${campaignId}_${Date.now()}`,
          c.contentTemplate || {},
          c.platforms || [],
          {},
        );
      } catch (err) {
        publishResult = { error: err.message };
      }
    } else {
      publishResult = { stub: true, platforms: c.platforms };
    }
    s.publishCount += 1;
    s.lastPublished = new Date().toISOString();
    if (goalEngine && c.goalId) { try { goalEngine.record(c.goalId, 1); } catch (_) {} }
    if (auditLog) auditLog.log({ type: 'campaign_cycle_manual', campaignId, publishCount: s.publishCount });
    return { campaignId, publishCount: s.publishCount, publishResult };
  }

  function getStats(campaignId) { return stats.get(campaignId) || null; }
  function list() { return [...campaigns.values()]; }

  return { define, activate, deactivate, runCycle, getStats, list };
}

export default createCampaignAutomation;
