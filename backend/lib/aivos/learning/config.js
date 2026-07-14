export function isLearningEnabled() {
  return process.env.AIVOS_LEARNING_ENABLED === '1' || process.env.AIVOS_LEARNING_ENABLED === 'true';
}

export function assertLearningEnabled() {
  if (!isLearningEnabled()) {
    const err = new Error('aivos_learning_disabled');
    err.code = 'AIVOS_LEARNING_DISABLED';
    throw err;
  }
}

/** Auto-apply learning proposals without human review. Default: OFF (safe). */
export function isAutoApplyEnabled() {
  return process.env.AIVOS_LEARNING_AUTO_APPLY === '1' || process.env.AIVOS_LEARNING_AUTO_APPLY === 'true';
}

/** Max prompt version bumps per skill per week. Default: 1. */
export function maxVersionBumpsPerWeek() {
  return parseInt(process.env.AIVOS_LEARNING_MAX_BUMPS_PER_WEEK || '1', 10);
}
