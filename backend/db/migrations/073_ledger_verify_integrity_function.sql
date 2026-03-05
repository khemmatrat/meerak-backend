-- =================================================================================
-- 073: Ledger Integrity Verification Function
-- =================================================================================
-- Stored function to validate checksum chain (Migration 069) using same logic as trigger.
-- Returns JSON: { valid: boolean, total_rows: int, first_broken: {...} }
-- =================================================================================

CREATE OR REPLACE FUNCTION verify_ledger_chain_integrity()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  prev_hash TEXT := '';
  payload TEXT;
  expected_hash TEXT;
  total_count INT := 0;
  first_broken JSONB := NULL;
BEGIN
  FOR r IN
    SELECT id, event_type, payment_id, gateway, job_id, amount, currency, status,
           bill_no, transaction_no, user_id, provider_id, metadata, created_at,
           prev_hash_checksum, hash_checksum
    FROM payment_ledger_audit
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    total_count := total_count + 1;
    payload := prev_hash || '|' || COALESCE(r.id::TEXT, '') || '|' || COALESCE(r.event_type::TEXT, '') || '|' ||
      COALESCE(r.payment_id::TEXT, '') || '|' || COALESCE(r.gateway::TEXT, '') || '|' || COALESCE(r.job_id::TEXT, '') || '|' ||
      COALESCE(r.amount::TEXT, '0') || '|' || COALESCE(r.currency::TEXT, '') || '|' || COALESCE(r.status::TEXT, '') || '|' ||
      COALESCE(r.bill_no::TEXT, '') || '|' || COALESCE(r.transaction_no::TEXT, '') || '|' ||
      COALESCE(r.user_id::TEXT, '') || '|' || COALESCE(r.provider_id::TEXT, '') || '|' ||
      COALESCE(r.metadata::TEXT, '{}') || '|' || COALESCE(r.created_at::TEXT, '');
    expected_hash := encode(sha256(payload::bytea), 'hex');
    IF COALESCE(r.hash_checksum, '') != expected_hash THEN
      first_broken := jsonb_build_object(
        'id', r.id,
        'created_at', r.created_at,
        'expected', expected_hash,
        'stored', r.hash_checksum
      );
      RETURN jsonb_build_object(
        'valid', false,
        'total_rows', total_count,
        'first_broken', first_broken
      );
    END IF;
    prev_hash := expected_hash;
  END LOOP;
  RETURN jsonb_build_object('valid', true, 'total_rows', total_count);
END;
$$;

COMMENT ON FUNCTION verify_ledger_chain_integrity() IS 'Validates payment_ledger_audit checksum chain (Migration 069)';
