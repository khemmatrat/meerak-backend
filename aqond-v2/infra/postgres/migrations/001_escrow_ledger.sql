-- Escrow ledger (Layer 1/4) — run against `escrow` database
-- HOLD on checkout, RELEASE/REFUND via audited API commands

CREATE SCHEMA IF NOT EXISTS escrow;

DO $$ BEGIN
  CREATE TYPE escrow.ledger_status AS ENUM ('HOLD', 'RELEASE', 'REFUND', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS escrow.ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  merchant_id TEXT,
  buyer_id TEXT,
  amount_micro BIGINT NOT NULL CHECK (amount_micro >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'THB',
  status escrow.ledger_status NOT NULL DEFAULT 'HOLD',
  idempotency_key TEXT UNIQUE,
  actor TEXT NOT NULL DEFAULT 'system',
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_order ON escrow.ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_ledger_status ON escrow.ledger (status, created_at DESC);

CREATE TABLE IF NOT EXISTS escrow.audit_log (
  id BIGSERIAL PRIMARY KEY,
  ledger_id UUID REFERENCES escrow.ledger(id),
  action TEXT NOT NULL,
  from_status escrow.ledger_status,
  to_status escrow.ledger_status,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Carrier SLA scores (P6)
CREATE TABLE IF NOT EXISTS escrow.carrier_scores (
  carrier_code TEXT PRIMARY KEY,
  score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  sla_breaches INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tier billing snapshots (P2)
CREATE TABLE IF NOT EXISTS escrow.merchant_billing_tiers (
  merchant_id TEXT PRIMARY KEY,
  month_key CHAR(7) NOT NULL,
  gross_sales_thb NUMERIC(14,2) NOT NULL DEFAULT 0,
  rental_fee_thb NUMERIC(14,2) NOT NULL DEFAULT 0,
  tier_label TEXT NOT NULL DEFAULT 'free',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION escrow.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_escrow_ledger_updated ON escrow.ledger;
CREATE TRIGGER trg_escrow_ledger_updated
  BEFORE UPDATE ON escrow.ledger
  FOR EACH ROW EXECUTE FUNCTION escrow.touch_updated_at();

-- Safe status transition audit
CREATE OR REPLACE FUNCTION escrow.log_ledger_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO escrow.audit_log (ledger_id, action, from_status, to_status, actor, payload)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, NEW.actor, NEW.metadata);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_escrow_ledger_audit ON escrow.ledger;
CREATE TRIGGER trg_escrow_ledger_audit
  AFTER UPDATE ON escrow.ledger
  FOR EACH ROW EXECUTE FUNCTION escrow.log_ledger_status_change();

COMMENT ON TABLE escrow.ledger IS 'Marketplace escrow — funds held until release/refund';
