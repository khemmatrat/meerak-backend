-- 227: Scale prep — webhook queue, async export jobs, ledger partition registry, BRIN index

-- Time-range scans at very high volume (admin aggregates, archival)
CREATE INDEX IF NOT EXISTS idx_pla_created_at_brin
  ON payment_ledger_audit USING BRIN (created_at);

-- Async PaySo wallet deposit webhook processing (burst / 1M+ txn/hour path)
CREATE TABLE IF NOT EXISTS wallet_deposit_webhook_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL DEFAULT 'payso',
  charge_id TEXT NOT NULL,
  user_id UUID,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_webhook_jobs_status_next
  ON wallet_deposit_webhook_jobs (status, next_attempt_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_webhook_jobs_charge
  ON wallet_deposit_webhook_jobs (charge_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_deposit_webhook_jobs_active_charge
  ON wallet_deposit_webhook_jobs (provider, charge_id)
  WHERE status IN ('queued', 'processing');

-- Admin async CSV export (avoid blocking HTTP on 500+ row lists)
CREATE TABLE IF NOT EXISTS admin_async_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_filename TEXT,
  row_count INTEGER,
  error TEXT,
  created_by TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_async_export_jobs_status
  ON admin_async_export_jobs (status, created_at DESC);

-- Monthly partition registry (create ahead; attach/migrate at cutover)
CREATE TABLE IF NOT EXISTS payment_ledger_audit_partitions_registry (
  month_key TEXT PRIMARY KEY,
  partition_table TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count BIGINT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION ensure_payment_ledger_audit_month_partition(p_for_month DATE DEFAULT date_trunc('month', NOW())::date)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_for_month)::date;
  v_key TEXT := to_char(v_month, 'YYYY-MM');
  v_table TEXT := 'payment_ledger_audit_p_' || to_char(v_month, 'YYYY_MM');
  v_exists REGCLASS;
BEGIN
  SELECT to_regclass(v_table) INTO v_exists;
  IF v_exists IS NULL THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (LIKE payment_ledger_audit INCLUDING ALL)',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (user_id, event_type, created_at DESC, id DESC) WHERE user_id IS NOT NULL',
      v_table || '_user_event_created',
      v_table
    );
    INSERT INTO payment_ledger_audit_partitions_registry (month_key, partition_table)
    VALUES (v_key, v_table)
    ON CONFLICT (month_key) DO NOTHING;
  END IF;
  RETURN v_table;
END;
$$;

COMMENT ON TABLE wallet_deposit_webhook_jobs IS
  'Queue for async PaySo wallet deposit webhook credit (enable PAYSO_WEBHOOK_ASYNC=1)';
COMMENT ON TABLE admin_async_export_jobs IS
  'Background admin CSV exports — poll GET /api/admin/export-jobs/:id';
COMMENT ON FUNCTION ensure_payment_ledger_audit_month_partition IS
  'Pre-create monthly ledger shadow tables before high-volume cutover';
