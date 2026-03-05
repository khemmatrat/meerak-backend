-- =================================================================================
-- 009: RBAC (user_roles) + reconciliation_uploads (audit of file ingestion)
-- =================================================================================
-- Use: Role per user for wallet (USER), reconciliation (ADMIN), read-only (AUDITOR).
--      Immutable record of who uploaded which settlement file and checksum.
-- =================================================================================

-- Roles: USER (wallet only), ADMIN (reconciliation + ops), AUDITOR (read-only)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ADMIN', 'AUDITOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

COMMENT ON TABLE user_roles IS 'RBAC: role per user. USER=wallet only, ADMIN=recon+ops, AUDITOR=read-only.';

-- Immutable record of reconciliation file uploads (who, source, checksum)
CREATE TABLE IF NOT EXISTS reconciliation_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE RESTRICT,
    uploaded_by TEXT NOT NULL,
    filename TEXT,
    source TEXT NOT NULL,
    checksum TEXT NOT NULL,
    row_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_uploads_run ON reconciliation_uploads(run_id);
CREATE INDEX IF NOT EXISTS idx_recon_uploads_uploaded_by ON reconciliation_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_recon_uploads_created ON reconciliation_uploads(created_at);

COMMENT ON TABLE reconciliation_uploads IS 'Audit: who uploaded which settlement file, checksum, run_id. Append-only.';

-- Optional: trigger to forbid UPDATE/DELETE on reconciliation_uploads (append-only)
CREATE OR REPLACE FUNCTION reject_recon_upload_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'reconciliation_uploads is append-only: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recon_uploads_no_update ON reconciliation_uploads;
DROP TRIGGER IF EXISTS trigger_recon_uploads_no_delete ON reconciliation_uploads;
CREATE TRIGGER trigger_recon_uploads_no_update BEFORE UPDATE ON reconciliation_uploads FOR EACH ROW EXECUTE PROCEDURE reject_recon_upload_update_delete();
CREATE TRIGGER trigger_recon_uploads_no_delete BEFORE DELETE ON reconciliation_uploads FOR EACH ROW EXECUTE PROCEDURE reject_recon_upload_update_delete();
