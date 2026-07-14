/** @typedef {'queued'|'planning'|'executing'|'preview'|'completed'|'failed'|'cancelled'} RuntimeJobStatus */
/** @typedef {'draft'|'preview'|'approved'|'rejected'|'reprompt'} ApprovalState */

export const RUNTIME_JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  PREVIEW: 'preview',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const APPROVAL_STATE = Object.freeze({
  DRAFT: 'draft',
  PREVIEW: 'preview',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REPROMPT: 'reprompt',
});

export const APPROVAL_TRANSITIONS = Object.freeze({
  draft: ['preview'],
  preview: ['approved', 'rejected', 'reprompt'],
  reprompt: ['preview'],
  approved: [],
  rejected: [],
});

export const CANONICAL_DAG_NODES = Object.freeze([
  { id: 'ocr', checkpointKey: 'ocr.json', maxRetries: 3 },
  { id: 'extract', checkpointKey: 'extract.json', maxRetries: 2 },
  { id: 'normalize', checkpointKey: 'normalize.json', maxRetries: 2 },
  { id: 'analyze', checkpointKey: 'analysis.json', maxRetries: 2 },
  { id: 'story', checkpointKey: 'plan.json', maxRetries: 2 },
  { id: 'creative', checkpointKey: 'style_manifest.json', maxRetries: 1 },
  { id: 'prompt', checkpointKey: 'prompts.json', maxRetries: 2 },
  { id: 'image', checkpointKey: 'images/', maxRetries: 2 },
  { id: 'motion', checkpointKey: 'clips/', maxRetries: 2 },
  { id: 'voice', checkpointKey: 'voice.wav', maxRetries: 3 },
  { id: 'subtitle', checkpointKey: 'subs.ass', maxRetries: 2 },
  { id: 'music', checkpointKey: 'music.mp3', maxRetries: 1 },
  { id: 'render', checkpointKey: 'draft.mp4', maxRetries: 2 },
  { id: 'quality', checkpointKey: 'quality.json', maxRetries: 1 },
  { id: 'publish', checkpointKey: 'published_url', maxRetries: 1 },
]);

export const RAW_PROMPT_KEYS = Object.freeze([
  'prompt',
  'rawPrompt',
  'raw_prompt',
  'systemPrompt',
  'system_prompt',
  'userPrompt',
  'user_prompt',
]);
