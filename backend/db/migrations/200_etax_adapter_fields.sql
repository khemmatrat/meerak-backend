-- =============================================================================
-- 200: Provider-neutral e-Tax/e-Receipt adapter fields
-- =============================================================================
-- Dry-run first. These fields track readiness/submission state only and must not
-- alter immutable document totals, wallet balances, ledgers, or payment state.
-- =============================================================================

ALTER TABLE fiscal_documents
  ADD COLUMN IF NOT EXISTS etax_status TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (etax_status IN ('not_ready', 'ready', 'dry_run_valid', 'validation_failed', 'submit_disabled', 'submitted', 'accepted', 'rejected', 'error')),
  ADD COLUMN IF NOT EXISTS etax_provider TEXT,
  ADD COLUMN IF NOT EXISTS etax_provider_document_id TEXT,
  ADD COLUMN IF NOT EXISTS etax_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS etax_response_json JSONB,
  ADD COLUMN IF NOT EXISTS etax_error TEXT;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_etax_status
  ON fiscal_documents (etax_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_etax_provider_doc
  ON fiscal_documents (etax_provider, etax_provider_document_id)
  WHERE etax_provider_document_id IS NOT NULL;

COMMENT ON COLUMN fiscal_documents.etax_status IS 'Provider-neutral e-Tax readiness/submission state. Dry-run is default; live submission requires explicit legal/provider approval.';
COMMENT ON COLUMN fiscal_documents.etax_response_json IS 'Sanitized provider/dry-run response. Do not store credentials or raw gateway payloads.';
