export { validateManifest as validateConnector } from './connectorManifest.js';

export function validatePermissions(manifest, requested = []) {
  const allowed = new Set(manifest.permissions || []);
  const denied = requested.filter((p) => !allowed.has(p));
  return denied.length ? { ok: false, denied } : { ok: true };
}

export function validateOAuthScopes(manifest, scopes = []) {
  if (!manifest.oauth?.required) return { ok: true };
  const required = new Set(manifest.oauth.scopes || []);
  const missing = [...required].filter((s) => !scopes.includes(s));
  return missing.length ? { ok: false, missing } : { ok: true };
}
