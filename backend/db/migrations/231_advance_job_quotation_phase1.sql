-- 231: Advance Job Quotation Phase 1
-- เพิ่มฟิลด์ใบเสนอราคาในผู้สมัคร + snapshot ใบที่ถูกเลือกบนงาน

ALTER TABLE advance_job_applicants
  ADD COLUMN IF NOT EXISTS quote_theme VARCHAR(64),
  ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(8),
  ADD COLUMN IF NOT EXISTS quote_summary TEXT,
  ADD COLUMN IF NOT EXISTS quote_timeline_days INTEGER,
  ADD COLUMN IF NOT EXISTS quote_valid_until DATE,
  ADD COLUMN IF NOT EXISTS quote_items JSONB,
  ADD COLUMN IF NOT EXISTS quote_total_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS quote_updated_at TIMESTAMPTZ;

ALTER TABLE advance_jobs
  ADD COLUMN IF NOT EXISTS selected_quotation_json JSONB;

CREATE INDEX IF NOT EXISTS idx_advance_job_applicants_quote_total
  ON advance_job_applicants(job_id, quote_total_amount DESC)
  WHERE quote_total_amount IS NOT NULL;
