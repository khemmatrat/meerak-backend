-- =============================================================================
-- 197: Fiscal document lifecycle (Tax Invoice / Receipt / WHT / Credit Note)
-- =============================================================================
-- Adds normalized, immutable fiscal document tables. This is additive only:
-- no historical ledger amounts, payment statuses, wallet balances, PaySo, or payout
-- logic are changed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fiscal_document_number_sequences (
  document_type TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  prefix TEXT NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1 CHECK (next_seq > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_type, fiscal_year)
);

CREATE TABLE IF NOT EXISTS fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_no TEXT UNIQUE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'tax_invoice',
    'receipt',
    'withholding_certificate',
    'credit_note'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'issued',
    'voided',
    'credit_note_issued',
    'exported'
  )),
  currency TEXT NOT NULL DEFAULT 'THB',

  source_event_id TEXT,
  source_event_type TEXT,
  source_payment_id TEXT,
  source_job_id TEXT,
  source_payout_id TEXT,
  source_charge_id TEXT,
  party_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  party_role TEXT NOT NULL DEFAULT 'customer' CHECK (party_role IN (
    'customer',
    'buyer',
    'provider',
    'payee',
    'payer',
    'platform'
  )),

  seller_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  buyer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  subtotal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  wht_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  credit_note_of_id UUID REFERENCES fiscal_documents(id) ON DELETE SET NULL,
  issue_reason TEXT,
  void_reason TEXT,
  credit_note_reason TEXT,

  created_by TEXT,
  updated_by TEXT,
  issued_by TEXT,
  voided_by TEXT,
  exported_by TEXT,

  issued_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_documents_source_idempotency
  ON fiscal_documents (source_event_id, document_type, party_role)
  WHERE source_event_id IS NOT NULL AND credit_note_of_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_status ON fiscal_documents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_party ON fiscal_documents (party_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_source ON fiscal_documents (source_event_id, source_event_type);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_credit_note_of ON fiscal_documents (credit_note_of_id) WHERE credit_note_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fiscal_document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1,
  unit_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  wht_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  wht_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_document_lines_doc ON fiscal_document_lines (document_id, line_no);

CREATE TABLE IF NOT EXISTS fiscal_document_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'user', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  before_json JSONB,
  after_json JSONB,
  source_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_document_events_doc ON fiscal_document_events (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_document_events_actor ON fiscal_document_events (actor_type, actor_id, created_at DESC);

COMMENT ON TABLE fiscal_documents IS 'Immutable fiscal document headers: draft/issued/voided/credit-note/exported lifecycle with seller/buyer snapshots.';
COMMENT ON TABLE fiscal_document_lines IS 'Fiscal document line items with VAT/WHT amounts calculated by backend services only.';
COMMENT ON TABLE fiscal_document_events IS 'Audit trail for fiscal document lifecycle actions.';
COMMENT ON TABLE fiscal_document_number_sequences IS 'Per-document-type yearly numbering sequences. Rows are locked FOR UPDATE when issuing.';
