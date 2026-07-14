import { normalizeIngressEvent, validateRecommendation } from '../recommendationSchema.js';

export function createLearningAdapter() {
  return {
    source: 'learning.model',
  };
}

export function createAdapterRegistry() {
  const adapters = new Map();
  return {
    register(name, adapter) {
      adapters.set(name, adapter);
    },
    get(name) {
      return adapters.get(name);
    },
    list() {
      return [...adapters.keys()];
    },
  };
}

export function ingressFromAdapter(adapterName, event) {
  const normalized = normalizeIngressEvent({ ...event, source: event.source || adapterName });
  return validateRecommendation(normalized);
}
