export function isOrchestratorEnabled() {
  return (
    process.env.AIVOS_ORCHESTRATOR_ENABLED === '1' ||
    process.env.AIVOS_ORCHESTRATOR_ENABLED === 'true'
  );
}

export const ORCHESTRATOR_PHASE = 14;

export const DEFAULT_SKILL_CAPABILITIES = Object.freeze([
  'travel_generation',
  'hotel_generation',
  'food_generation',
  'insurance_generation',
  'marketplace_generation',
]);

export const PIPELINE_TAIL_NODES = Object.freeze(['render', 'publish']);
