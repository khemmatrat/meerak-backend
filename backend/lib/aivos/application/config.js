export function isApplicationEnabled() {
  return (
    process.env.AIVOS_APPLICATION_ENABLED === '1' ||
    process.env.AIVOS_APPLICATION_ENABLED === 'true'
  );
}

export const APPLICATION_PHASE = 17;

export const APPLICATION_CATEGORIES = Object.freeze([
  'resume',
  'marketplace',
  'restaurant',
  'food',
  'hotel',
  'trip',
  'insurance',
  'commerce',
  'lead_generation',
  'video_marketing',
]);
