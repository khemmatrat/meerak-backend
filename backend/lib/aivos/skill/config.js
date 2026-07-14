export function isSkillEnabled() {
  return (
    process.env.AIVOS_SKILL_ENABLED === '1' ||
    process.env.AIVOS_SKILL_ENABLED === 'true'
  );
}

export const SKILL_PHASE = 13;
