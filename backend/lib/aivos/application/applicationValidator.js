import { normalizeManifest } from './applicationManifest.js';
import { APPLICATION_CATEGORIES } from './config.js';

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
  if (!APPLICATION_CATEGORIES.includes(manifest.category)) {
    errors.push({ field: 'category', message: 'category_invalid' });
  }
  for (const field of ['skillBundle', 'workflowBundle', 'knowledgeBundle', 'marketplacePackages', 'requiredCapabilities']) {
    if (!Array.isArray(manifest[field])) errors.push({ field, message: 'must_be_array' });
  }
  if (!manifest.primaryWorkflow) errors.push({ field: 'primaryWorkflow', message: 'primaryWorkflow_required' });

  return { ok: errors.length === 0, manifest, errors };
}
