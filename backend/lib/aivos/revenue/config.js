export function isRevenueEnabled() {
  return process.env.AIVOS_REVENUE_ENABLED === '1' || process.env.AIVOS_REVENUE_ENABLED === 'true';
}

export function assertRevenueEnabled() {
  if (!isRevenueEnabled()) {
    const err = new Error('aivos_revenue_disabled');
    err.code = 'AIVOS_REVENUE_DISABLED';
    throw err;
  }
}

/** Default platform take rate (0–1). Override per stream. */
export function defaultTakeRate() {
  return parseFloat(process.env.AIVOS_REVENUE_TAKE_RATE || '0.20');
}

/** Currency used for all revenue calculations. */
export function revenueCurrency() {
  return process.env.AIVOS_REVENUE_CURRENCY || 'THB';
}
