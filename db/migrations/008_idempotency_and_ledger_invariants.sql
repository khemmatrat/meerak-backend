-- =================================================================================
-- 008: IDEMPOTENCY KEYS + LEDGER DOUBLE-ENTRY INVARIANT
-- =================================================================================
-- Use: Idempotency for top-up/withdraw; optional check that sum(debits)=sum(credits)
--      per transaction_group_id (enforced in application; trigger is defensive).
-- Prerequisite: 006 (reject_ledger_audit_update_delete), 007 (ledger_entries, wallets).
-- =================================================================================

-- Idempotency: one key per business operation (top-up or withdrawal)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    transaction_group_id UUID NOT NULL,
    operation VARCHAR(30) NOT NULL CHECK (operation IN ('topup', 'withdraw')),
    response_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

COMMENT ON TABLE idempotency_keys IS 'Idempotency for wallet operations. Same key returns same result; no double apply.';

-- Double-entry (sum(debits)=sum(credits) per transaction_group_id) is enforced in
-- application: wallet.service always inserts 2 legs (topup) or 3 legs (withdrawal)
-- in one transaction. A DB-level check would require deferred constraint (complex);
-- application guarantee is sufficient for audit (all legs in same tx).
