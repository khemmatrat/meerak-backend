export function isTenantEnabled() {
  return (
    process.env.AIVOS_TENANT_ENABLED === '1' ||
    process.env.AIVOS_TENANT_ENABLED === 'true'
  );
}

export const TENANT_PHASE = 18;

export const TENANT_PLANS = Object.freeze(['free', 'standard', 'premium', 'enterprise']);

export const DEFAULT_QUOTAS = Object.freeze({
  apps:           10,
  executions_day: 1000,
  storage_mb:     512,
  api_rpm:        120,
});
