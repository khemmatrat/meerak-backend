-- =================================================================================
-- 014: Audit Log (The Truth) — เบา เร็ว ใช้ JSONB เก็บ changes
-- =================================================================================
-- Rule: Log must not block main process. Append-only.
-- =================================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  actor_role VARCHAR(20) NOT NULL DEFAULT 'User'
    CHECK (actor_role IN ('Admin', 'User', 'System')),
  action VARCHAR(100) NOT NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{"old":{}, "new":{}}',
  status VARCHAR(20) NOT NULL DEFAULT 'Success'
    CHECK (status IN ('Success', 'Failed')),
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_status ON audit_log(status);

COMMENT ON TABLE audit_log IS 'Append-only audit trail. JSONB changes = {old, new}. Do not block main process on insert.';
