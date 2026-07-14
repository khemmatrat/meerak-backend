-- AQOND AI-OS Runtime Platform — migration 259 (Phase 1 scope)
-- Authority: AI_RUNTIME_SPEC.md, ARCHITECT_RULES.md

CREATE TABLE IF NOT EXISTS aivos_runtime_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  plugin_id TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  approval_state VARCHAR(32) NOT NULL DEFAULT 'draft',
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  context_snapshot_id UUID,
  plan_id UUID,
  policy_decision_id UUID,
  prompt_compilation_id UUID,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_runtime_jobs_user
  ON aivos_runtime_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aivos_runtime_jobs_status
  ON aivos_runtime_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS aivos_runtime_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES aivos_runtime_jobs(id) ON DELETE CASCADE,
  workflow_template_id TEXT,
  dag JSONB NOT NULL DEFAULT '{}'::jsonb,
  skill_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_runtime_plans_job
  ON aivos_runtime_plans (job_id);

CREATE TABLE IF NOT EXISTS aivos_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES aivos_runtime_jobs(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_context_snapshots_job
  ON aivos_context_snapshots (job_id);

CREATE TABLE IF NOT EXISTS aivos_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global',
  task_type TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_policy_rules_lookup
  ON aivos_policy_rules (task_type, enabled, priority DESC);

CREATE TABLE IF NOT EXISTS aivos_policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES aivos_runtime_jobs(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES aivos_policy_rules(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id UUID,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_policy_decisions_job
  ON aivos_policy_decisions (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aivos_prompt_registry (
  id TEXT NOT NULL,
  version INT NOT NULL,
  template JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_slots TEXT[] NOT NULL DEFAULT '{}',
  task_type TEXT NOT NULL DEFAULT 'writing',
  skill_affinity TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS aivos_prompt_compilations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES aivos_runtime_jobs(id) ON DELETE SET NULL,
  prompt_id TEXT NOT NULL,
  prompt_version INT NOT NULL,
  brand_dna_version INT,
  context_snapshot_id UUID,
  compiler_version TEXT NOT NULL DEFAULT '1.0.0',
  content_hash TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_prompt_compilations_job
  ON aivos_prompt_compilations (job_id);

CREATE TABLE IF NOT EXISTS aivos_brand_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  tone TEXT,
  forbidden_phrases TEXT[] NOT NULL DEFAULT '{}',
  visual_palette JSONB NOT NULL DEFAULT '{}'::jsonb,
  locale TEXT NOT NULL DEFAULT 'en',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_key, version)
);

CREATE TABLE IF NOT EXISTS aivos_governance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version INT,
  action TEXT NOT NULL,
  actor_id TEXT,
  diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id UUID REFERENCES aivos_runtime_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_governance_audit_entity
  ON aivos_governance_audit (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aivos_plugin_registry (
  plugin_id TEXT PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  policy_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_agent_registry (
  agent_id TEXT PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_skill_registry (
  skill_id TEXT PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  agent_id TEXT REFERENCES aivos_agent_registry(agent_id) ON DELETE SET NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  stage_affinity TEXT[] NOT NULL DEFAULT '{}',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_id TEXT,
  prompt_version INT NOT NULL DEFAULT 1,
  task_types TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_workflow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_job_id UUID NOT NULL REFERENCES aivos_runtime_jobs(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  current_node TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_workflow_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_job_id UUID NOT NULL REFERENCES aivos_workflow_jobs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  checkpoint_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_workflow_checkpoints_job_node
  ON aivos_workflow_checkpoints (workflow_job_id, node_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aivos_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES aivos_runtime_jobs(id) ON DELETE CASCADE,
  node_id TEXT,
  score NUMERIC(5,2),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version TEXT NOT NULL DEFAULT '3.0',
  name TEXT NOT NULL,
  correlation_id UUID NOT NULL,
  trace_id UUID,
  context_id UUID,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_events_correlation
  ON aivos_events (correlation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS aivos_video_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES aivos_runtime_jobs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS aivos_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES aivos_runtime_jobs(id) ON DELETE CASCADE,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  preview_url TEXT,
  reprompt_intent JSONB,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_approval_requests_job
  ON aivos_approval_requests (job_id);

CREATE TABLE IF NOT EXISTS aivos_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES aivos_runtime_jobs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  task_type TEXT,
  model_slot TEXT,
  estimated_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  actual_cost NUMERIC(12,4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed minimal registry for Phase 1 tests and resume-ai path
INSERT INTO aivos_plugin_registry (plugin_id, version, capabilities, required_skills, policy_profile, enabled)
VALUES (
  'resume-ai',
  1,
  ARRAY['video.talent_intro', 'ocr.pdf', 'profile.analyze'],
  ARRAY['resume-extract-profile'],
  '{"tier":"standard"}'::jsonb,
  TRUE
)
ON CONFLICT (plugin_id) DO NOTHING;

INSERT INTO aivos_agent_registry (agent_id, version, persona, enabled)
VALUES ('resume-analyzer', 1, '{"name":"Resume Analyzer"}'::jsonb, TRUE)
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO aivos_skill_registry (
  skill_id, version, agent_id, capabilities, stage_affinity,
  input_schema, output_schema, prompt_id, prompt_version, task_types, enabled
)
VALUES (
  'resume-extract-profile',
  1,
  'resume-analyzer',
  ARRAY['profile.analyze'],
  ARRAY['extract', 'analyze'],
  '{"type":"object","properties":{"raw_text":{"type":"string"}}}'::jsonb,
  '{"type":"object","properties":{"profile":{"type":"object"}}}'::jsonb,
  'talent-resume-draft',
  1,
  ARRAY['structured_json'],
  TRUE
)
ON CONFLICT (skill_id) DO NOTHING;

INSERT INTO aivos_prompt_registry (id, version, template, required_slots, task_type, skill_affinity, enabled)
VALUES (
  'talent-resume-draft',
  1,
  '{"system":"You are a resume assistant.","user":"Draft for {{role}} with goals: {{goals}}"}'::jsonb,
  ARRAY['role', 'goals'],
  'writing',
  ARRAY['resume-extract-profile'],
  TRUE
)
ON CONFLICT (id, version) DO NOTHING;

INSERT INTO aivos_policy_rules (scope, task_type, priority, conditions, decision, enabled, version)
VALUES
  ('global', 'writing', 10, '{}'::jsonb, '{"model":"hermes3:3b","max_tokens":2048,"fallback":["qwen2:7b"]}'::jsonb, TRUE, 1),
  ('global', 'structured_json', 10, '{}'::jsonb, '{"model":"hermes3:3b","max_tokens":2048,"fallback":["qwen2:7b"]}'::jsonb, TRUE, 1)
ON CONFLICT DO NOTHING;

INSERT INTO aivos_brand_dna (brand_key, version, tone, forbidden_phrases, locale)
VALUES ('aqond-default', 1, 'professional', ARRAY['guaranteed job'], 'en')
ON CONFLICT (brand_key, version) DO NOTHING;
