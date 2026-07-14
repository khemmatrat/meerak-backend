import { CONNECTOR_PROVIDERS } from './config.js';

export const MANIFEST_FIELDS = Object.freeze([
  'id', 'name', 'version', 'provider', 'permissions', 'oauth', 'webhooks', 'events',
  'dependencies', 'billingMultiplier', 'tenantScoped',
]);

export function normalizeManifest(raw = {}) {
  return {
    id:               String(raw.id || '').trim(),
    name:             String(raw.name || raw.id || '').trim(),
    version:          String(raw.version || '1.0.0').trim(),
    provider:         CONNECTOR_PROVIDERS.includes(raw.provider) ? raw.provider : String(raw.provider || 'custom'),
    permissions:      Array.isArray(raw.permissions) ? [...raw.permissions] : [],
    oauth:            raw.oauth && typeof raw.oauth === 'object' ? { ...raw.oauth } : null,
    webhooks:         Array.isArray(raw.webhooks) ? [...raw.webhooks] : [],
    events:           Array.isArray(raw.events) ? [...raw.events] : [],
    dependencies:       raw.dependencies && typeof raw.dependencies === 'object' ? { ...raw.dependencies } : {},
    billingMultiplier: Number(raw.billingMultiplier ?? 1),
    tenantScoped:     raw.tenantScoped !== false,
    primaryWorkflow:  raw.primaryWorkflow || null,
    primaryApplication: raw.primaryApplication || null,
  };
}

export function validateManifest(raw = {}) {
  const manifest = normalizeManifest(raw);
  const errors = [];
  if (!manifest.id) errors.push('id_required');
  if (!manifest.name) errors.push('name_required');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('version_semver_invalid');
  if (manifest.oauth?.required && !manifest.oauth?.scopes?.length) errors.push('oauth_scopes_required');
  return errors.length ? { ok: false, errors, manifest } : { ok: true, manifest };
}
