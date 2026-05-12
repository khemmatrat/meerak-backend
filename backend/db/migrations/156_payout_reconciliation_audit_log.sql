-- =================================================================================
-- 156: Append-only audit log for payout reconciliation actions (bank audit trail)
-- =================================================================================

CREATE TABLE IF NOT EXISTS payout_reconciliation_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payout_request_id UUID NOT NULL REFERENCES payout_requests(id) ON DELETE CASCADE,
  actor_admin_id TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  old_reconciliation_status TEXT,
  new_reconciliation_status TEXT,
  reason TEXT NOT NULL,
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payout_rec_audit_payout ON payout_reconciliation_audit_log (payout_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_rec_audit_actor ON payout_reconciliation_audit_log (actor_admin_id, created_at DESC);

COMMENT ON TABLE payout_reconciliation_audit_log IS 'Re-run reconcile / overrides — mandatory reason; append-only (no UPDATE/DELETE triggers in app)';
