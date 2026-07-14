-- Admin-managed anti-bypass rules (text / future image OCR pipeline).
-- Safe to run on PostgreSQL backends using standard migrations.

CREATE TABLE IF NOT EXISTS anti_bypass_rules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('keyword', 'regex')),
  scope TEXT NOT NULL DEFAULT 'text' CHECK (scope IN ('text', 'image_ocr')),
  pattern TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  severity TEXT NOT NULL DEFAULT 'block' CHECK (severity IN ('block', 'warn')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anti_bypass_rules_scope_enabled
  ON anti_bypass_rules (scope, enabled);

CREATE INDEX IF NOT EXISTS idx_anti_bypass_rules_created_at
  ON anti_bypass_rules (created_at DESC);
