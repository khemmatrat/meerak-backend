export function createApplicationProvision({ settings, registry, lifecycle } = {}) {
  return {
    async provision(manifest, { tenantId = 'default', userId = null, config = {} } = {}) {
      const installResult = await lifecycle.install(manifest, { tenantId, userId });
      const values = settings.applyTemplate(manifest, config);
      settings.set(manifest.id, values, { tenantId });
      lifecycle.enable(manifest.id, { tenantId });
      return {
        appId: manifest.id,
        tenantId,
        provisioned: true,
        settings: values,
        install: installResult,
      };
    },
  };
}
