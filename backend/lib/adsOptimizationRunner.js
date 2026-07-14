/**
 * Batch optimization runner — warn then auto-pause low-CVR campaigns.
 */
import {
  getAdCampaign,
  getAdCampaignInsightsV2,
  isAdsBridgeConfigured,
  listAdCampaigns,
  setAdCampaignLifecycle,
  updateAdCreativeMetadata,
} from './adsBridgeClient.js';
import { getEscrowBySocialCampaignId } from './adsCampaignBilling.js';
import {
  buildOptimizationReport,
  computeCreativeQualityScore,
  getRecentOptimizationAction,
  logOptimizationAction,
  ensurePrimaryCreativeVariant,
} from './adsOptimization.js';

const WARN_BEFORE_PAUSE_HOURS = 24;

export async function runAdsOptimizationBatch(pool, { limit = 40, dryRun = false } = {}) {
  if (!isAdsBridgeConfigured()) {
    return { ok: false, reason: 'ads_not_configured', processed: 0 };
  }

  const { campaigns = [] } = await listAdCampaigns(limit).catch(() => ({ campaigns: [] }));
  const active = campaigns.filter((c) => c.lifecycleState === 'ACTIVE');
  const results = [];

  for (const camp of active) {
    const campaignId = camp.id;
    try {
      const [insights, fullCamp, esc] = await Promise.all([
        getAdCampaignInsightsV2(campaignId, '30d').catch(() => null),
        getAdCampaign(campaignId).catch(() => null),
        getEscrowBySocialCampaignId(pool, campaignId).catch(() => null),
      ]);
      if (!insights) {
        results.push({ campaignId, skipped: true, reason: 'no_insights' });
        continue;
      }

      const creative = fullCamp?.creatives?.[0];
      const creativeMeta = creative?.metadata || {};
      const qualityScore = computeCreativeQualityScore(creativeMeta);

      if (creative?.id && qualityScore !== creativeMeta.qualityScore) {
        if (!dryRun) {
          await updateAdCreativeMetadata(creative.id, {
            ...creativeMeta,
            qualityScore,
          }).catch(() => null);
          await ensurePrimaryCreativeVariant(pool, {
            campaignId,
            creativeId: creative.id,
            qualityScore,
          });
        }
      }

      const escrow = esc
        ? {
            escrowMicro: String(esc.escrow_micro),
            spentMicro: String(esc.spent_micro),
            remainingMicro: String(BigInt(esc.escrow_micro) - BigInt(esc.spent_micro)),
            billingModel: esc.billing_model,
            outcomeCostMicro: String(esc.outcome_cost_micro),
          }
        : null;

      const report = buildOptimizationReport({
        insights: { ...insights, campaignId },
        creativeMeta,
        escrow,
        objective: camp.objective,
      });

      let action = null;
      if (report.autoPause?.eligible) {
        const priorWarn = await getRecentOptimizationAction(
          pool,
          campaignId,
          'warn_low_cvr',
          WARN_BEFORE_PAUSE_HOURS,
        );
        if (!priorWarn) {
          if (!dryRun) {
            await logOptimizationAction(pool, {
              campaignId,
              action: 'warn_low_cvr',
              reason: report.autoPause.reason,
              metrics: report.autoPause,
            });
          }
          action = 'warned';
        } else if (!dryRun) {
          await setAdCampaignLifecycle(campaignId, 'PAUSED');
          await logOptimizationAction(pool, {
            campaignId,
            action: 'auto_paused',
            reason: 'cvr_below_benchmark_after_warning',
            metrics: report.autoPause,
          });
          action = 'auto_paused';
        } else {
          action = 'would_auto_pause';
        }
      }

      if (esc?.status === 'exhausted' && camp.lifecycleState === 'ACTIVE' && !dryRun) {
        await setAdCampaignLifecycle(campaignId, 'PAUSED').catch(() => null);
        await logOptimizationAction(pool, {
          campaignId,
          action: 'auto_paused',
          reason: 'escrow_exhausted',
          metrics: { escrowStatus: 'exhausted' },
        });
        action = action || 'paused_escrow_exhausted';
      }

      results.push({
        campaignId,
        title: camp.title,
        qualityScore: report.qualityScore,
        action,
        autoPause: report.autoPause,
        recommendationCount: report.recommendations.length,
      });
    } catch (e) {
      results.push({ campaignId, error: e?.message || String(e) });
    }
  }

  return {
    ok: true,
    processed: results.length,
    warned: results.filter((r) => r.action === 'warned').length,
    paused: results.filter((r) => r.action === 'auto_paused' || r.action === 'paused_escrow_exhausted').length,
    dryRun,
    results,
  };
}
