-- AI inference audit log (P8) — run against `ai` database

CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE IF NOT EXISTS ai.inference_log (
  id BIGSERIAL PRIMARY KEY,
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash CHAR(16),
  latency_ms INT NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_msg TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inference_log_task ON ai.inference_log (task, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inference_log_success ON ai.inference_log (success, created_at DESC);

COMMENT ON TABLE ai.inference_log IS 'Hermes/Ollama inference audit — onboard, SLA judge, live closer';
