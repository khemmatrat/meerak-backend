-- 233: Advance Job Quotation Phase 2 — versioning, expiry tracking, reminders

ALTER TABLE advance_job_applicants
  ADD COLUMN IF NOT EXISTS quote_version_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) DEFAULT 'active'
    CHECK (quote_status IN ('active', 'expired', 'accepted', 'superseded'));

CREATE TABLE IF NOT EXISTS advance_job_quotation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES advance_job_applicants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number >= 1 AND version_number <= 10),
  proposed_by VARCHAR(10) NOT NULL CHECK (proposed_by IN ('talent', 'employer')),
  quote_theme VARCHAR(64),
  quote_currency VARCHAR(8) DEFAULT 'THB',
  quote_summary TEXT,
  quote_timeline_days INTEGER,
  quote_valid_until DATE,
  quote_items JSONB DEFAULT '[]'::jsonb,
  quote_total_amount NUMERIC(12,2) NOT NULL,
  edit_reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'expired', 'accepted', 'rejected')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotation_versions_applicant_version
  ON advance_job_quotation_versions(applicant_id, version_number);

CREATE INDEX IF NOT EXISTS idx_quotation_versions_job
  ON advance_job_quotation_versions(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_advance_applicants_quote_expires
  ON advance_job_applicants(quote_expires_at)
  WHERE quote_status = 'active' AND quote_total_amount IS NOT NULL;

COMMENT ON TABLE advance_job_quotation_versions IS 'Phase 2: versioned quotation/counter-offer history (v1, v2, v3...)';
COMMENT ON COLUMN advance_job_quotation_versions.edit_reason IS 'เหตุผลการแก้ไขเมื่อส่ง counter-offer';
COMMENT ON COLUMN advance_job_applicants.quote_expires_at IS 'หมดอายุอัตโนมัติ — min(valid_until EOD, updated_at + 72h)';
