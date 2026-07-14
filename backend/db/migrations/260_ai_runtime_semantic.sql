-- AI Kernel + Semantic Memory — migration 260
-- Authority: AI_KERNEL_SPEC.md, SEMANTIC_MEMORY_SPEC.md

CREATE TABLE IF NOT EXISTS aivos_semantic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID,
  namespace TEXT NOT NULL DEFAULT 'global',
  content_type TEXT NOT NULL,
  key TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  source_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aivos_semantic_memory_lookup
  ON aivos_semantic_memory (owner_id, namespace, content_type);

CREATE TABLE IF NOT EXISTS aivos_learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID,
  plugin_id TEXT,
  signal_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_prompt_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id TEXT NOT NULL,
  from_version INT NOT NULL,
  to_version INT NOT NULL,
  diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_governance_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_marketplace_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id TEXT NOT NULL,
  version INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_marketplace_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT NOT NULL,
  version INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_marketplace_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  version INT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_plugin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aivos_observability_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID,
  span_id UUID,
  parent_span_id UUID,
  name TEXT NOT NULL,
  kind TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Seed default semantic namespace
INSERT INTO aivos_semantic_memory (owner_id, namespace, content_type, key, content)
VALUES (NULL, 'global', 'prompt', 'seed', '{"text":"seed"}'::jsonb)
ON CONFLICT DO NOTHING;
