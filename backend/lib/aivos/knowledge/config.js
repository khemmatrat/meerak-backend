export function isKnowledgeEnabled() {
  return (
    process.env.AIVOS_KNOWLEDGE_ENABLED === '1' ||
    process.env.AIVOS_KNOWLEDGE_ENABLED === 'true'
  );
}

export const KNOWLEDGE_PHASE = 15;

export const ENTITY_TYPES = Object.freeze([
  'product',
  'service',
  'restaurant',
  'hotel',
  'insurance',
  'trip',
  'place',
  'merchant',
  'customer',
  'skill',
  'document',
]);

export const DEFAULT_CACHE_TTL_MS = 60_000;
export const DEFAULT_CACHE_MAX = 500;
