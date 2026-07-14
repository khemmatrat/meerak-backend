export function isAnalyticsEnabled() {
  return process.env.AIVOS_ANALYTICS_ENABLED === '1' || process.env.AIVOS_ANALYTICS_ENABLED === 'true';
}

export function assertAnalyticsEnabled() {
  if (!isAnalyticsEnabled()) {
    const err = new Error('aivos_analytics_disabled');
    err.code = 'AIVOS_ANALYTICS_DISABLED';
    throw err;
  }
}
