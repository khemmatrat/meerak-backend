-- P81-P90: Payments — provider-agnostic payment intents, refunds, disputes,
-- payouts, settlement/reconciliation, FX snapshots, fraud signals, token vault refs.
-- Shard/region aware, ULID string PKs, idempotent, transactional-outbox friendly.

-- P81: payment intent state machine
CREATE TABLE IF NOT EXISTS commerce.payment_intents (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  merchant_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  provider TEXT NOT NULL DEFAULT 'stub',
  method TEXT NOT NULL DEFAULT 'card' CHECK (method IN ('card', 'promptpay', 'wallet', 'cod', 'bank_transfer')),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'voided')),
  amount_micro BIGINT NOT NULL DEFAULT 0,
  captured_micro BIGINT NOT NULL DEFAULT 0,
  refunded_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  settlement_currency TEXT NOT NULL DEFAULT 'THB',
  fx_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
  risk_score INT NOT NULL DEFAULT 0,
  requires_3ds BOOLEAN NOT NULL DEFAULT FALSE,
  provider_ref TEXT,
  token_ref TEXT,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON commerce.payment_intents (order_id, shard_key);
CREATE INDEX IF NOT EXISTS idx_payment_intents_merchant ON commerce.payment_intents (merchant_id, status, created_at DESC);

-- P81: payment event log (state transitions + provider webhooks, idempotent)
CREATE TABLE IF NOT EXISTS commerce.payment_events (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  amount_micro BIGINT NOT NULL DEFAULT 0,
  provider_ref TEXT,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON commerce.payment_events (intent_id, created_at);

-- P85: refunds + disputes/chargebacks
CREATE TABLE IF NOT EXISTS commerce.refunds (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  order_id TEXT,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  amount_micro BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_refunds_intent ON commerce.refunds (intent_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.disputes (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  order_id TEXT,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  amount_micro BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'opened'
    CHECK (status IN ('opened', 'evidence_submitted', 'won', 'lost', 'cancelled')),
  reason_code TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disputes_intent ON commerce.disputes (intent_id, shard_key);

-- P86: merchant payouts
CREATE TABLE IF NOT EXISTS commerce.payouts (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  amount_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'processing', 'paid', 'failed', 'held')),
  hold_reason TEXT,
  scheduled_for DATE NOT NULL DEFAULT CURRENT_DATE,
  provider_ref TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_payouts_merchant ON commerce.payouts (merchant_id, status, scheduled_for);

-- P87: settlement files + reconciliation lines
CREATE TABLE IF NOT EXISTS commerce.settlements (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  settlement_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  gross_micro BIGINT NOT NULL DEFAULT 0,
  fee_micro BIGINT NOT NULL DEFAULT 0,
  net_micro BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ingested' CHECK (status IN ('ingested', 'matched', 'exceptions')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, settlement_date, currency)
);

CREATE TABLE IF NOT EXISTS commerce.settlement_lines (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  intent_id TEXT,
  provider_ref TEXT,
  amount_micro BIGINT NOT NULL DEFAULT 0,
  fee_micro BIGINT NOT NULL DEFAULT 0,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('matched', 'unmatched', 'mismatch')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlement_lines_settlement ON commerce.settlement_lines (settlement_id, match_status);

-- P88: FX rate snapshots
CREATE TABLE IF NOT EXISTS commerce.fx_rates (
  id BIGSERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC(18,8) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_pair ON commerce.fx_rates (base_currency, quote_currency, captured_at DESC);

-- P89: payment fraud signals (shadow + enforce)
CREATE TABLE IF NOT EXISTS commerce.payment_fraud_signals (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'allow' CHECK (decision IN ('allow', 'challenge', 'block')),
  signals JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_buyer ON commerce.payment_fraud_signals (buyer_id, created_at DESC);

COMMENT ON TABLE commerce.payment_intents IS 'P81 provider-agnostic payment intent state machine';
