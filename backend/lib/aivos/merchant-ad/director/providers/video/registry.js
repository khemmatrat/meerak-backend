import { tvcVideoProvider } from './tvcProvider.js';
import { ugcVideoProvider } from './ugcProvider.js';

/** @type {import('../../types.js').VideoProvider[]} */
const DEFAULT_PROVIDERS = [tvcVideoProvider, ugcVideoProvider];

/** @type {Map<string, import('../../types.js').VideoProvider>} */
const registry = new Map(DEFAULT_PROVIDERS.map((p) => [p.id, p]));

/**
 * Register a video provider adapter (Grok, Veo, Runway, Kling, etc.).
 * @param {import('../../types.js').VideoProvider} provider
 */
export function registerVideoProvider(provider) {
  if (!provider?.id || typeof provider.supports !== 'function' || typeof provider.generate !== 'function') {
    throw new Error('invalid_video_provider');
  }
  registry.set(provider.id, provider);
}

export function listVideoProviders() {
  return [...registry.values()];
}

/**
 * @param {import('../../types.js').AdFormat} format
 * @returns {import('../../types.js').VideoProvider | null}
 */
export function resolveVideoProvider(format) {
  let hit = null;
  for (const provider of registry.values()) {
    if (provider.supports(format)) hit = provider;
  }
  return hit;
}

export function resetVideoProvidersForTests() {
  registry.clear();
  for (const p of DEFAULT_PROVIDERS) registry.set(p.id, p);
}
