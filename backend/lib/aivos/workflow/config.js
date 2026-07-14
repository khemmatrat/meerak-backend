export function isWorkflowEnabled() {
  return (
    process.env.AIVOS_WORKFLOW_ENABLED === '1' ||
    process.env.AIVOS_WORKFLOW_ENABLED === 'true'
  );
}

export const WORKFLOW_PHASE = 16;

export const WORKFLOW_CATEGORIES = Object.freeze([
  'resume',
  'marketplace',
  'restaurant',
  'food_delivery',
  'hotel',
  'trip',
  'insurance',
  'lead_generation',
  'video_marketing',
  'commerce',
]);
