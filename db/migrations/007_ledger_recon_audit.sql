-- =================================================================================
-- 007: LEDGER (DOUBLE-ENTRY), RECONCILIATION, FINANCIAL AUDIT LOG
-- =================================================================================
-- Design: LEDGER_AUDIT_RECONCILIATION_DESIGN.txt
-- Use: Single source of truth for balance-affecting events; recon vs bank/TrueMoney; immutable audit.
-- Prerequisite: reject_ledger_audit_update_delete() from 006_payment_ledger_audit.sql
-- =================================================================================

-- Optional: wallets table if not exists (schema.sql / schema_financial may already define it)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'THB' CHECK (char_length(currency) = 3),
    balance NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    last_ledger_id BIGINT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- ============================================
-- LEDGER ENTRIES (double-entry, append-only)
-- ============================================
CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,

    transaction_group_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'THB',

    wallet_id UUID REFERENCES wallets(id),
    user_id TEXT,
    system_account_code VARCHAR(50),

    balance_after NUMERIC(18,2),
    description TEXT NOT NULL,

    gateway VARCHAR(50),
    payment_id TEXT,
    transaction_no TEXT,
    bill_no TEXT,
    reference_ledger_id BIGINT REFERENCES ledger_entries(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON ledger_entries(wallet_id, created_at) WHERE wallet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger_entries(user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_group ON ledger_entries(transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON ledger_entries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction_no ON ledger_entries(gateway, transaction_no) WHERE gateway IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at);

DROP TRIGGER IF EXISTS trigger_ledger_entries_no_update ON ledger_entries;
DROP TRIGGER IF EXISTS trigger_ledger_entries_no_delete ON ledger_entries;
CREATE TRIGGER trigger_ledger_entries_no_update BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();
CREATE TRIGGER trigger_ledger_entries_no_delete BEFORE DELETE ON ledger_entries FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();

COMMENT ON TABLE ledger_entries IS 'Append-only double-entry ledger. No UPDATE/DELETE. Corrections via reversal entries.';

-- ============================================
-- RECONCILIATION RUNS & LINES
-- ============================================
CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL,
    gateway VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'matched', 'mismatch_found', 'resolved', 'failed')),
    total_internal_amount NUMERIC(18,2),
    total_external_amount NUMERIC(18,2),
    mismatch_count INT DEFAULT 0,
    matched_count INT DEFAULT 0,
    missing_internal_count INT DEFAULT 0,
    missing_external_count INT DEFAULT 0,
    report_path TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_runs_date_gateway ON reconciliation_runs(run_date, gateway);

CREATE TABLE IF NOT EXISTS reconciliation_lines (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL
        CHECK (status IN ('matched', 'mismatch', 'missing_external', 'missing_internal', 'duplicate', 'resolved')),
    internal_ledger_id BIGINT REFERENCES ledger_entries(id),
    internal_payment_ledger_id TEXT,
    internal_amount NUMERIC(18,2),
    internal_transaction_no TEXT,
    external_ref TEXT,
    external_amount NUMERIC(18,2),
    external_date DATE,
    mismatch_reason TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_lines_run ON reconciliation_lines(run_id);

-- ============================================
-- FINANCIAL AUDIT LOG (immutable)
-- ============================================
CREATE TABLE IF NOT EXISTS financial_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_type VARCHAR(20) NOT NULL,
    actor_id TEXT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id TEXT NOT NULL,
    state_before JSONB,
    state_after JSONB,
    reason TEXT,
    correlation_id TEXT,
    external_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON financial_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON financial_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON financial_audit_log(correlation_id);

DROP TRIGGER IF EXISTS trigger_financial_audit_log_no_update ON financial_audit_log;
DROP TRIGGER IF EXISTS trigger_financial_audit_log_no_delete ON financial_audit_log;
CREATE TRIGGER trigger_financial_audit_log_no_update BEFORE UPDATE ON financial_audit_log FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();
CREATE TRIGGER trigger_financial_audit_log_no_delete BEFORE DELETE ON financial_audit_log FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();

COMMENT ON TABLE financial_audit_log IS 'Append-only financial audit trail. No one can edit or delete.';
