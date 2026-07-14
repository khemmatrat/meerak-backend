export function isQaEnabled() {
  return (
    process.env.AIVOS_QA_ENABLED === '1' ||
    process.env.AIVOS_QA_ENABLED === 'true'
  );
}

export const QA_PHASE = 12;
