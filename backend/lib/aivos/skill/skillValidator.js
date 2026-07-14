import { normalizeManifest } from './skillManifest.js';

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

export function validateManifest(raw) {
  const manifest = normalizeManifest(raw);
  const errors = [];

  if (!manifest.id) errors.push({ field: 'id', message: 'id_required' });
  if (!manifest.name) errors.push({ field: 'name', message: 'name_required' });
  if (!manifest.version || !SEMVER.test(manifest.version)) {
    errors.push({ field: 'version', message: 'version_must_be_semver' });
  }
  if (!manifest.description) errors.push({ field: 'description', message: 'description_required' });
  if (!manifest.capabilities.length) errors.push({ field: 'capabilities', message: 'capabilities_required' });

  for (const field of ['permissions', 'requiredPlugins', 'requiredPipelines', 'requiredModels', 'requiredPolicies', 'requiredMarketplacePackages']) {
    if (!Array.isArray(manifest[field])) {
      errors.push({ field, message: 'must_be_array' });
    }
  }

  return { ok: errors.length === 0, manifest, errors };
}
