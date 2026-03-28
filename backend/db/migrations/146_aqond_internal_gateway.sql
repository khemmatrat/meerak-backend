-- =============================================================================
-- 146: AQOND Internal Gateway — immutable ledger, settlement reports, nonces
-- =============================================================================
-- Purpose: foundation for future licensed payment institution / BOT audit trail.
-- PCI: never store full PAN, CVV, or magnetic data in these tables.
-- =============================================================================

-- Payment lifecycle (state machine)
CREATE TABLE IF NOT EXISTS gateway_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_ref TEXT UNIQUE,
  merchant_reference TEXT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'THB',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'SETTLED', 'REFUNDED', 'FAILED')),
  idempotency_key TEXT,
  request_signature_last TEXT,
  nonce_last TEXT,
  processing_time_ms INTEGER,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gateway_tx_created ON gateway_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_tx_status ON gateway_transactions (status);
CREATE INDEX IF NOT EXISTS idx_gateway_tx_idempotency ON gateway_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE gateway_transactions IS 'AQOND Internal Gateway payment records — no cardholder data (PCI-DSS)';
COMMENT ON COLUMN gateway_transactions.amount_minor IS 'Amount in smallest currency unit (e.g. satang for THB)';
COMMENT ON COLUMN gateway_transactions.metadata IS 'Non-sensitive metadata only; PAN/CVV must never be stored';

-- Double-entry ledger (append-only; UPDATE/DELETE blocked)
CREATE TABLE IF NOT EXISTS gateway_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  journal_id UUID NOT NULL,
  gateway_transaction_id UUID REFERENCES gateway_transactions(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  side CHAR(1) NOT NULL CHECK (side IN ('D', 'C')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'THB',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prev_hash TEXT NOT NULL DEFAULT '',
  entry_hash TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_gateway_ledger_journal ON gateway_ledger_entries (journal_id);
CREATE INDEX IF NOT EXISTS idx_gateway_ledger_gtx ON gateway_ledger_entries (gateway_transaction_id);

CREATE OR REPLACE FUNCTION gateway_ledger_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'gateway_ledger_entries is immutable (append-only)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gateway_ledger_no_update ON gateway_ledger_entries;
CREATE TRIGGER trg_gateway_ledger_no_update
  BEFORE UPDATE ON gateway_ledger_entries
  FOR EACH ROW EXECUTE PROCEDURE gateway_ledger_prevent_mutation();

DROP TRIGGER IF EXISTS trg_gateway_ledger_no_delete ON gateway_ledger_entries;
CREATE TRIGGER trg_gateway_ledger_no_delete
  BEFORE DELETE ON gateway_ledger_entries
  FOR EACH ROW EXECUTE PROCEDURE gateway_ledger_prevent_mutation();

CREATE OR REPLACE FUNCTION gateway_ledger_compute_chain_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev_h TEXT := '';
  payload TEXT;
BEGIN
  SELECT entry_hash INTO prev_h
  FROM gateway_ledger_entries
  ORDER BY id DESC
  LIMIT 1;
  prev_h := COALESCE(prev_h, '');
  NEW.prev_hash := prev_h;
  payload := prev_h || '|' || COALESCE(NEW.journal_id::TEXT, '') || '|' ||
    COALESCE(NEW.gateway_transaction_id::TEXT, '') || '|' ||
    COALESCE(NEW.account_code, '') || '|' || COALESCE(NEW.side, '') || '|' ||
    COALESCE(NEW.amount_minor::TEXT, '0') || '|' || COALESCE(NEW.currency, '') || '|' ||
    COALESCE(NEW.description, '') || '|' || COALESCE(NEW.created_at::TEXT, '');
  NEW.entry_hash := encode(sha256(payload::bytea), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gateway_ledger_chain ON gateway_ledger_entries;
CREATE TRIGGER trg_gateway_ledger_chain
  BEFORE INSERT ON gateway_ledger_entries
  FOR EACH ROW EXECUTE PROCEDURE gateway_ledger_compute_chain_hash();

COMMENT ON TABLE gateway_ledger_entries IS 'Immutable double-entry lines; D/C must balance per journal_id in application layer';

-- Replay protection (nonce consumed once)
CREATE TABLE IF NOT EXISTS gateway_nonce_store (
  nonce TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gateway_nonce_expires ON gateway_nonce_store (expires_at);

-- Periodic settlement / regulatory export snapshots
CREATE TABLE IF NOT EXISTS gateway_settlement_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_period_start DATE NOT NULL,
  report_period_end DATE NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'THB',
  total_volume_minor BIGINT NOT NULL DEFAULT 0,
  total_fee_minor BIGINT NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'LOCKED', 'FILED', 'SUBMITTED')),
  regulatory_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash_sha256 TEXT,
  UNIQUE (report_period_start, report_period_end)
);

CREATE INDEX IF NOT EXISTS idx_gateway_settlement_created ON gateway_settlement_reports (created_at DESC);

COMMENT ON TABLE gateway_settlement_reports IS 'Aggregated settlement windows for license / regulatory filing (immutable hash optional)';
