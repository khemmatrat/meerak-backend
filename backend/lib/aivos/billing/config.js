export function isBillingEnabled() {
  return (
    process.env.AIVOS_BILLING_ENABLED === '1' ||
    process.env.AIVOS_BILLING_ENABLED === 'true'
  );
}

export const DEFAULT_BASE_CREDITS = Number(process.env.AIVOS_BILLING_BASE_CREDITS || 1);
