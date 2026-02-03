-- =================================================================================
-- PAYMENT LEDGER AUDIT (APPEND-ONLY)
-- =================================================================================
-- Use: Record every payment event (top-up PromptPay/TrueMoney/Bank Transfer, etc.)
-- Rule: INSERT only. No UPDATE/DELETE — even platform owner cannot edit.
-- Reconciliation and audit must verify against this table.
-- =================================================================================

CREATE TABLE IF NOT EXISTS payment_ledger_audit (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'payment_created', 'payment_completed', 'payment_failed',
        'payment_expired', 'payment_refunded', 'escrow_held', 'escrow_released', 'escrow_refunded'
    )),
    payment_id TEXT NOT NULL,
    gateway TEXT NOT NULL CHECK (gateway IN ('promptpay', 'stripe', 'truemoney', 'wallet', 'bank_transfer')),
    job_id TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'THB',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'refunded')),
    bill_no TEXT NOT NULL,
    transaction_no TEXT NOT NULL,
    payment_no TEXT,
    user_id TEXT,
    provider_id TEXT,
    metadata JSONB DEFAULT '{}',
    request_id TEXT,
    trace_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_audit_created_at ON payment_ledger_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_job_id ON payment_ledger_audit(job_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_payment_id ON payment_ledger_audit(payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_gateway ON payment_ledger_audit(gateway);

-- Forbid UPDATE and DELETE on this table (append-only)
CREATE OR REPLACE FUNCTION reject_ledger_audit_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'payment_ledger_audit is append-only: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ledger_audit_no_update ON payment_ledger_audit;
CREATE TRIGGER trigger_ledger_audit_no_update
    BEFORE UPDATE ON payment_ledger_audit
    FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();

DROP TRIGGER IF EXISTS trigger_ledger_audit_no_delete ON payment_ledger_audit;
CREATE TRIGGER trigger_ledger_audit_no_delete
    BEFORE DELETE ON payment_ledger_audit
    FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();

COMMENT ON TABLE payment_ledger_audit IS 'Append-only payment ledger for audit and reconciliation. No one can edit or delete records.';
