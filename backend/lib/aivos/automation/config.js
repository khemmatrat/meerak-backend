export function isAutomationEnabled() {
  return process.env.AIVOS_AUTOMATION_ENABLED === '1' || process.env.AIVOS_AUTOMATION_ENABLED === 'true';
}

export function assertAutomationEnabled() {
  if (!isAutomationEnabled()) {
    const err = new Error('aivos_automation_disabled');
    err.code = 'AIVOS_AUTOMATION_DISABLED';
    throw err;
  }
}

/** Allow auto-publish without human review (default: OFF for safety). */
export function isAutoPublishEnabled() {
  return process.env.AIVOS_AUTO_PUBLISH === '1' || process.env.AIVOS_AUTO_PUBLISH === 'true';
}

/** Max automated actions per hour (circuit-breaker anti-runaway). */
export function maxActionsPerHour() {
  return parseInt(process.env.AIVOS_AUTOMATION_MAX_ACTIONS_PER_HOUR || '100', 10);
}

/** Safety level: 'strict' | 'standard' | 'permissive'. Default: 'standard'. */
export function safetyLevel() {
  return process.env.AIVOS_AUTOMATION_SAFETY_LEVEL || 'standard';
}
