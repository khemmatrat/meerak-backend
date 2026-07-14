export const MANIFEST_FIELDS = Object.freeze([
  'id',
  'name',
  'version',
  'description',
  'category',
  'tenantScoped',
  'skillBundle',
  'workflowBundle',
  'knowledgeBundle',
  'marketplacePackages',
  'settingsTemplate',
  'primaryWorkflow',
  'requiredCapabilities',
]);

export function normalizeManifest(raw = {}) {
  return {
    id:                  String(raw.id || '').trim(),
    name:                String(raw.name || '').trim(),
    version:             String(raw.version || '1.0.0').trim(),
    description:         String(raw.description || '').trim(),
    category:            String(raw.category || 'commerce').trim(),
    tenantScoped:        raw.tenantScoped !== false,
    skillBundle:         Array.isArray(raw.skillBundle) ? [...raw.skillBundle] : [],
    workflowBundle:      Array.isArray(raw.workflowBundle) ? [...raw.workflowBundle] : [],
    knowledgeBundle:     Array.isArray(raw.knowledgeBundle) ? [...raw.knowledgeBundle] : [],
    marketplacePackages: Array.isArray(raw.marketplacePackages) ? [...raw.marketplacePackages] : [],
    settingsTemplate:    raw.settingsTemplate && typeof raw.settingsTemplate === 'object' ? { ...raw.settingsTemplate } : {},
    primaryWorkflow:     String(raw.primaryWorkflow || '').trim(),
    requiredCapabilities: Array.isArray(raw.requiredCapabilities) ? [...raw.requiredCapabilities] : [],
  };
}
