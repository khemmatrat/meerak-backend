export const MANIFEST_FIELDS = Object.freeze([
  'id',
  'name',
  'version',
  'description',
  'capabilities',
  'permissions',
  'requiredPlugins',
  'requiredPipelines',
  'requiredModels',
  'requiredPolicies',
  'requiredMarketplacePackages',
]);

export function normalizeManifest(raw = {}) {
  return {
    id:                          String(raw.id || '').trim(),
    name:                        String(raw.name || '').trim(),
    version:                     String(raw.version || '1.0.0').trim(),
    description:                 String(raw.description || '').trim(),
    capabilities:                Array.isArray(raw.capabilities) ? [...raw.capabilities] : [],
    permissions:                 Array.isArray(raw.permissions) ? [...raw.permissions] : [],
    requiredPlugins:             Array.isArray(raw.requiredPlugins) ? [...raw.requiredPlugins] : [],
    requiredPipelines:           Array.isArray(raw.requiredPipelines) ? [...raw.requiredPipelines] : [],
    requiredModels:              Array.isArray(raw.requiredModels) ? [...raw.requiredModels] : [],
    requiredPolicies:            Array.isArray(raw.requiredPolicies) ? [...raw.requiredPolicies] : [],
    requiredMarketplacePackages: Array.isArray(raw.requiredMarketplacePackages) ? [...raw.requiredMarketplacePackages] : [],
  };
}
