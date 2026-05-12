-- 137: Gateway-agnostic column names (no vendor-specific prefixes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_requests' AND column_name = 'omise_recipient_id'
  ) THEN
    ALTER TABLE payout_requests RENAME COLUMN omise_recipient_id TO gateway_recipient_ref;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_requests' AND column_name = 'omise_transfer_id'
  ) THEN
    ALTER TABLE payout_requests RENAME COLUMN omise_transfer_id TO gateway_transfer_ref;
  END IF;
END $$;

COMMENT ON COLUMN payout_requests.gateway_recipient_ref IS 'External payout recipient id from payment processor';
COMMENT ON COLUMN payout_requests.gateway_transfer_ref IS 'External transfer id from payment processor';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reconcile_alerts' AND column_name = 'omise_balance_thb'
  ) THEN
    ALTER TABLE reconcile_alerts RENAME COLUMN omise_balance_thb TO gateway_reported_balance_thb;
  END IF;
END $$;

COMMENT ON COLUMN reconcile_alerts.gateway_reported_balance_thb IS 'Balance reported by payment processor API (THB)';

COMMENT ON COLUMN payment_ledger_audit.gateway_fee_amount IS 'Processor/gateway fee deducted from the transaction';
