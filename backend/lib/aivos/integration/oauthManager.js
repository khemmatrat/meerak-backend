function ensureOAuth(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.oauthTokens) store._tables.oauthTokens = new Map();
  return store._tables.oauthTokens;
}

export function createOAuthManager({ store, vault, isEnabled = true } = {}) {
  const map = () => ensureOAuth(store);

  const providers = new Map([
    ['stripe', { flow: 'api_key' }],
    ['shopify', { flow: 'authorization_code', authUrl: 'https://shopify.com/oauth/authorize' }],
    ['openai', { flow: 'api_key' }],
    ['anthropic', { flow: 'api_key' }],
    ['slack', { flow: 'authorization_code' }],
    ['gmail', { flow: 'authorization_code' }],
    ['facebook', { flow: 'authorization_code' }],
    ['discord', { flow: 'authorization_code' }],
    ['tiktok', { flow: 'authorization_code' }],
    ['line_oa', { flow: 'client_credentials' }],
    ['logistics', { flow: 'api_key' }],
    ['erp', { flow: 'api_key' }],
    ['crm', { flow: 'authorization_code' }],
  ]);

  return {
    enabled: isEnabled,

    registerProvider(provider, config) {
      providers.set(provider, config);
    },

    getProvider(provider) {
      return providers.get(provider) || null;
    },

    async authorize({ connectorId, tenantId = 'default', provider, scopes = [], code = null } = {}) {
      if (!isEnabled) return { ok: false, reason: 'oauth_disabled' };
      const cfg = providers.get(provider);
      if (!cfg) {
        const err = new Error('oauth_provider_not_found');
        err.code = 'OAUTH_PROVIDER_NOT_FOUND';
        throw err;
      }

      const token = {
        connectorId,
        tenantId,
        provider,
        scopes,
        access_token: code ? `atk-${provider}-${Date.now()}` : `atk-${provider}-pending`,
        refresh_token: cfg.flow === 'authorization_code' ? `rtk-${provider}-${Date.now()}` : null,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        issued_at: new Date().toISOString(),
      };

      map()?.set(`${tenantId}::${connectorId}`, token);
      if (vault && token.access_token) {
        vault.store({ connectorId, tenantId, secret: token.access_token, kind: 'oauth' });
      }
      return { ok: true, token: { ...token, access_token: vault?.mask(token.access_token) } };
    },

    async refresh({ connectorId, tenantId = 'default' } = {}) {
      const row = map()?.get(`${tenantId}::${connectorId}`);
      if (!row) {
        const err = new Error('oauth_token_not_found');
        err.code = 'OAUTH_TOKEN_NOT_FOUND';
        throw err;
      }
      row.access_token = `atk-${row.provider}-refreshed-${Date.now()}`;
      row.expires_at = new Date(Date.now() + 3600_000).toISOString();
      map().set(`${tenantId}::${connectorId}`, row);
      if (vault) vault.rotateSecret(connectorId, { tenantId, secret: row.access_token });
      return { ok: true, refreshed: true, expires_at: row.expires_at };
    },

    getToken(connectorId, { tenantId = 'default', actorTenantId } = {}) {
      if (actorTenantId && actorTenantId !== tenantId) {
        const err = new Error('oauth_tenant_mismatch');
        err.code = 'OAUTH_TENANT_MISMATCH';
        throw err;
      }
      return map()?.get(`${tenantId}::${connectorId}`) || null;
    },

    listForTenant(tenantId) {
      return [...(map()?.values() || [])].filter((t) => t.tenantId === tenantId);
    },
  };
}
