export function isIntegrationEnabled() {
  return (
    process.env.AIVOS_INTEGRATION_ENABLED === '1' ||
    process.env.AIVOS_INTEGRATION_ENABLED === 'true'
  );
}

export function isApiGatewayEnabled() {
  return (
    process.env.AIVOS_API_GATEWAY_ENABLED === '1' ||
    process.env.AIVOS_API_GATEWAY_ENABLED === 'true' ||
    isIntegrationEnabled()
  );
}

export function isWebhookEnabled() {
  return (
    process.env.AIVOS_WEBHOOK_ENABLED === '1' ||
    process.env.AIVOS_WEBHOOK_ENABLED === 'true' ||
    isIntegrationEnabled()
  );
}

export function isOAuthEnabled() {
  return (
    process.env.AIVOS_OAUTH_ENABLED === '1' ||
    process.env.AIVOS_OAUTH_ENABLED === 'true' ||
    isIntegrationEnabled()
  );
}

export function connectorMaxRetries() {
  const n = Number(process.env.AIVOS_CONNECTOR_MAX_RETRIES ?? 3);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export const INTEGRATION_PHASE = 19;

export const CONNECTOR_PROVIDERS = Object.freeze([
  'stripe', 'shopify', 'tiktok', 'facebook', 'line_oa', 'gmail', 'slack', 'discord',
  'google_drive', 'erp', 'crm', 'pos', 'payment', 'logistics', 'openai', 'anthropic',
]);
