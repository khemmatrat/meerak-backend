/** Generation state machine — Director Phase 4 */

export const GENERATION_STATES = Object.freeze({
  QUEUED: 'queued',
  PLANNING: 'planning',
  VALIDATING: 'validating',
  GENERATING: 'generating',
  UPLOADING: 'uploading',
  PUBLISHING: 'publishing',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const GENERATION_ERRORS = Object.freeze({
  VALIDATION_FAILED: 'validation_failed',
  PROVIDER_FAILED: 'provider_failed',
  CAPABILITY_UNAVAILABLE: 'capability_unavailable',
  TIMEOUT: 'timeout',
  QUOTA_EXCEEDED: 'quota_exceeded',
  PUBLISH_FAILED: 'publish_failed',
  INSUFFICIENT_TOKENS: 'insufficient_tokens',
});

const ORDERED_STATES = [
  GENERATION_STATES.QUEUED,
  GENERATION_STATES.PLANNING,
  GENERATION_STATES.VALIDATING,
  GENERATION_STATES.GENERATING,
  GENERATION_STATES.UPLOADING,
  GENERATION_STATES.PUBLISHING,
  GENERATION_STATES.COMPLETED,
];

/**
 * @param {object} job
 * @param {string} generationState
 * @param {Record<string, unknown>} [patch]
 */
export function applyGenerationState(job, generationState, patch = {}) {
  const idx = ORDERED_STATES.indexOf(generationState);
  const progressByState = {
    [GENERATION_STATES.QUEUED]: 2,
    [GENERATION_STATES.PLANNING]: 8,
    [GENERATION_STATES.VALIDATING]: 12,
    [GENERATION_STATES.GENERATING]: 40,
    [GENERATION_STATES.UPLOADING]: 85,
    [GENERATION_STATES.PUBLISHING]: 92,
    [GENERATION_STATES.COMPLETED]: 100,
    [GENERATION_STATES.FAILED]: job.progress_pct ?? 0,
  };

  Object.assign(job, patch, {
    generation_state: generationState,
    generation_state_at: new Date().toISOString(),
    progress_pct: progressByState[generationState] ?? job.progress_pct ?? 0,
  });

  if (generationState === GENERATION_STATES.COMPLETED) {
    job.status = 'completed';
  } else if (generationState === GENERATION_STATES.FAILED) {
    job.status = 'failed';
  } else if (generationState !== GENERATION_STATES.QUEUED) {
    job.status = 'generating';
  }

  if (idx >= 0 && !job.generation_timeline) {
    job.generation_timeline = [];
  }
  if (idx >= 0) {
    job.generation_timeline = [
      ...(job.generation_timeline || []).filter((e) => e.state !== generationState),
      { state: generationState, at: job.generation_state_at },
    ];
  }

  return job;
}

/**
 * @param {object} job
 * @param {string} errorCode
 * @param {string} message
 * @param {object} [details]
 */
export function failGeneration(job, errorCode, message, details = {}) {
  applyGenerationState(job, GENERATION_STATES.FAILED, {
    error: message,
    error_code: errorCode,
    error_details: details,
  });
  return job;
}

export function isTerminalState(state) {
  return state === GENERATION_STATES.COMPLETED || state === GENERATION_STATES.FAILED;
}
