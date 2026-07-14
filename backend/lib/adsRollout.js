/**
 * Staged rollout guardrails for production ads spend and delivery.
 */

export function getRolloutStage() {
  return String(process.env.ADS_ROLLOUT_STAGE || 'production').toLowerCase();
}

export function isFeedInjectionEnabled() {
  return process.env.ADS_FEED_INJECTION_ENABLED !== '0';
}

export function isAsyncTranscodeEnabled() {
  return process.env.ADS_ASYNC_TRANSCODE === '1';
}

/** Skip creative moderation queue in beta/internal when ADS_BETA_AUTO_MODERATE=1 */
export function isBetaAutoModerateEnabled() {
  if (process.env.ADS_BETA_AUTO_MODERATE !== '1') return false;
  const stage = getRolloutStage();
  return stage === 'beta' || stage === 'internal';
}

export function getRolloutConfig() {
  const stage = getRolloutStage();
  return {
    stage,
    feedInjectionEnabled: isFeedInjectionEnabled(),
    asyncTranscode: isAsyncTranscodeEnabled(),
    betaAutoModerate: isBetaAutoModerateEnabled(),
    internalMaxSpendThb: Number(process.env.ADS_INTERNAL_MAX_CAMPAIGN_SPEND_THB || 50),
    betaMaxSpendThb: Number(process.env.ADS_BETA_MAX_CAMPAIGN_SPEND_THB || 300),
    dailyReconEnabled: process.env.ADS_DAILY_RECON_ENABLED === '1',
    cdnBaseUrl: process.env.ADS_CDN_BASE_URL || null,
  };
}

/**
 * @param {number} budgetThb
 * @returns {{ allowed: boolean; reason?: string; stage: string; maxThb?: number }}
 */
export function validateCampaignSpendRollout(budgetThb) {
  const stage = getRolloutStage();
  const amount = Number(budgetThb);
  if (!(amount > 0)) return { allowed: false, reason: 'invalid_budget', stage };

  if (stage === 'internal') {
    const max = Number(process.env.ADS_INTERNAL_MAX_CAMPAIGN_SPEND_THB || 50);
    if (amount > max) {
      return { allowed: false, reason: 'internal_spend_cap_exceeded', stage, maxThb: max };
    }
  }
  if (stage === 'beta') {
    const max = Number(process.env.ADS_BETA_MAX_CAMPAIGN_SPEND_THB || 300);
    if (amount > max) {
      return { allowed: false, reason: 'beta_spend_cap_exceeded', stage, maxThb: max };
    }
  }
  return { allowed: true, stage };
}
