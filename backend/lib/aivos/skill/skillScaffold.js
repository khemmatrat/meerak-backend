import { normalizeManifest } from './skillManifest.js';

const VERTICAL_DEFAULTS = Object.freeze({
  resume:      { capabilities: ['resume_generation', 'text_generation'], requiredPlugins: ['resume-ai'], requiredMarketplacePackages: ['resume-ai'] },
  marketplace: { capabilities: ['marketplace_generation', 'text_generation'], permissions: ['billing.meter'] },
  food:        { capabilities: ['food_generation', 'text_generation'] },
  hotel:       { capabilities: ['hotel_generation', 'text_generation'] },
  trip:        { capabilities: ['travel_generation', 'text_generation'] },
  insurance:   { capabilities: ['insurance_generation', 'text_generation'], permissions: ['governance.audit'], requiredPolicies: ['structured_json'] },
  restaurant:  { capabilities: ['food_generation', 'text_generation'] },
});

export function generateSkillScaffold({ id, name, vertical = 'custom', description } = {}) {
  if (!id || !name) {
    const err = new Error('scaffold_id_and_name_required');
    err.code = 'SCAFFOLD_INVALID';
    throw err;
  }

  const defaults = VERTICAL_DEFAULTS[vertical] || { capabilities: ['text_generation'] };
  const manifest = normalizeManifest({
    id,
    name,
    version: '1.0.0',
    description: description || `${name} vertical business skill`,
    capabilities: defaults.capabilities || ['text_generation'],
    permissions: defaults.permissions || ['runtime.jobs.submit'],
    requiredPlugins: defaults.requiredPlugins || [],
    requiredPipelines: defaults.requiredPipelines || ['default'],
    requiredModels: defaults.requiredModels || ['hermes3:3b'],
    requiredPolicies: defaults.requiredPolicies || ['writing'],
    requiredMarketplacePackages: defaults.requiredMarketplacePackages || [],
  });

  return {
    manifest,
    files: [
      { path: `skills/${id}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
      { path: `skills/${id}/handler.js`, content: scaffoldHandler(id, name) },
      { path: `skills/${id}/README.md`, content: `# ${name}\n\nVertical skill module for AQOND AI-OS.\n` },
    ],
  };
}

function scaffoldHandler(id, name) {
  return `export const skillId = '${id}';\nexport const skillName = '${name}';\n\nexport async function handleIntent(intent, ctx) {\n  return { ok: true, skillId, intent };\n}\n`;
}

export { VERTICAL_DEFAULTS };
