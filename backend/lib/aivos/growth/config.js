export function isGrowthEnabled() {
  return (
    process.env.AIVOS_GROWTH_ENABLED === '1' ||
    process.env.AIVOS_GROWTH_ENABLED === 'true'
  );
}

export function isFeatureEnabled(envKey) {
  return process.env[envKey] === '1' || process.env[envKey] === 'true';
}

export function isDailyBriefEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_DAILY_BRIEF');
}

export function isJourneyFsmEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_JOURNEY');
}

export function isLoyaltyEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_LOYALTY');
}

export function isNotificationEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_NOTIFICATION');
}

export function isFeedRankingEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_FEED_RANKING');
}

export function isNbaEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_NBA');
}

export function isPersonalAiEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_PERSONAL_AI');
}

export function isCoachEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_COACH');
}

export function isDashboardEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_DASHBOARD');
}

export function isKpiEnabled() {
  return isGrowthEnabled() && isFeatureEnabled('AIVOS_GROWTH_KPI');
}

export function isRetentionEnabled() {
  if (!isGrowthEnabled()) return false;
  const v = process.env.AIVOS_GROWTH_RETENTION_ENABLED;
  if (v === '0' || v === 'false') return false;
  return true;
}

export const GROWTH_PHASE = 20;

export const GROWTH_SDK_VERSION = '20.5.0';

export const HABIT_STREAK_MILESTONES = Object.freeze([3, 7, 14, 30, 60, 90, 180]);

export const FEED_KINDS = Object.freeze([
  'mission',
  'recommendation',
  'alert',
  'brief',
  'reward',
  'workflow',
  'application',
]);

export const JOURNEY_STAGES = Object.freeze([
  'onboarding',
  'activation',
  'growth',
  'retention',
  'advocate',
]);

export const KPI_IDS = Object.freeze([
  'KPI-DAU',
  'KPI-WAU',
  'KPI-MAU',
  'KPI-RET-D1',
  'KPI-RET-D7',
  'KPI-RET-D30',
  'KPI-MCR',
  'KPI-AVG-SESS',
  'KPI-FCTR',
  'KPI-RAR',
  'KPI-AAR',
  'KPI-RPU',
  'KPI-LTV',
  'KPI-HS',
  'KPI-JP',
]);
