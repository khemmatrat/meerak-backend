import { TENANT_PLANS } from './config.js';

export const MANIFEST_FIELDS = Object.freeze([
  'id', 'name', 'plan', 'ownerId', 'domain', 'region', 'metadata',
]);

export function normalizeManifest(raw = {}) {
  return {
    id:       String(raw.id || '').trim(),
    name:     String(raw.name || raw.id || '').trim(),
    plan:     TENANT_PLANS.includes(raw.plan) ? raw.plan : 'standard',
    ownerId:  raw.ownerId || null,
    domain:   raw.domain || null,
    region:   raw.region || 'default',
    metadata: raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {},
  };
}

export function validateManifest(raw = {}) {
  const manifest = normalizeManifest(raw);
  const errors = [];
  if (!manifest.id) errors.push('id_required');
  if (!manifest.name) errors.push('name_required');
  if (!/^[a-z0-9][a-z0-9-_]{1,63}$/i.test(manifest.id)) errors.push('id_format_invalid');
  return errors.length ? { ok: false, errors, manifest } : { ok: true, manifest };
}
