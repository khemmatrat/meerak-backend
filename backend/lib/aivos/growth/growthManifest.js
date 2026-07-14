export const MANIFEST_FIELDS = Object.freeze([
  'id',
  'name',
  'version',
  'vertical',
  'missionTemplates',
  'feedRules',
  'personaWeights',
  'tenantScoped',
]);

export function normalizeManifest(raw = {}) {
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || raw.id || '').trim(),
    version: String(raw.version || '1.0.0').trim(),
    vertical: String(raw.vertical || 'general').trim(),
    missionTemplates: Array.isArray(raw.missionTemplates) ? raw.missionTemplates : [],
    feedRules: Array.isArray(raw.feedRules) ? raw.feedRules : [],
    personaWeights: raw.personaWeights && typeof raw.personaWeights === 'object' ? raw.personaWeights : {},
    tenantScoped: raw.tenantScoped !== false,
  };
}

export function validateManifest(raw = {}) {
  const manifest = normalizeManifest(raw);
  const errors = [];
  if (!manifest.id) errors.push('id_required');
  if (!manifest.name) errors.push('name_required');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('version_semver_required');
  return errors.length ? { ok: false, errors, manifest } : { ok: true, manifest };
}
