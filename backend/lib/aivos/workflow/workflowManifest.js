export const MANIFEST_FIELDS = Object.freeze([
  'id',
  'name',
  'version',
  'description',
  'skill',
  'category',
  'pipelineTemplate',
  'requiredCapabilities',
  'requiredKnowledge',
  'requiredPolicies',
  'requiredMarketplacePackages',
  'variables',
  'outputs',
  'nestedWorkflows',
]);

export function normalizeManifest(raw = {}) {
  return {
    id:                          String(raw.id || '').trim(),
    name:                        String(raw.name || '').trim(),
    version:                     String(raw.version || '1.0.0').trim(),
    description:                 String(raw.description || '').trim(),
    skill:                       String(raw.skill || '').trim(),
    category:                    String(raw.category || 'commerce').trim(),
    pipelineTemplate:            String(raw.pipelineTemplate || 'videoPipelineV1').trim(),
    requiredCapabilities:        Array.isArray(raw.requiredCapabilities) ? [...raw.requiredCapabilities] : [],
    requiredKnowledge:           Array.isArray(raw.requiredKnowledge) ? [...raw.requiredKnowledge] : [],
    requiredPolicies:            Array.isArray(raw.requiredPolicies) ? [...raw.requiredPolicies] : [],
    requiredMarketplacePackages: Array.isArray(raw.requiredMarketplacePackages) ? [...raw.requiredMarketplacePackages] : [],
    variables:                   Array.isArray(raw.variables) ? raw.variables.map((v) => ({ ...v })) : [],
    outputs:                     Array.isArray(raw.outputs) ? [...raw.outputs] : [],
    nestedWorkflows:             Array.isArray(raw.nestedWorkflows) ? [...raw.nestedWorkflows] : [],
  };
}
