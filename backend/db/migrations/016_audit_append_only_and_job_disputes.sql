-- =================================================================================
-- 016: Audit log append-only (tamper-proof) + job_disputes for Double Lock
-- =================================================================================
-- Safety: audit_log ห้ามแก้/ลบ (รวมถึงแอดมิน) สำหรับหลักฐาน GPS/OTP และการเงิน
-- job_disputes: ใช้ตรวจใน payments/release ว่ามี Dispute เปิดอยู่หรือไม่ (Hard-Block)
-- =================================================================================

-- 1. audit_log append-only (ห้าม UPDATE/DELETE)
CREATE OR REPLACE FUNCTION reject_audit_log_update_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are not allowed (tamper-proof for evidence)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_log_no_update ON audit_log;
CREATE TRIGGER trigger_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE PROCEDURE reject_audit_log_update_delete();

DROP TRIGGER IF EXISTS trigger_audit_log_no_delete ON audit_log;
CREATE TRIGGER trigger_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE PROCEDURE reject_audit_log_update_delete();

COMMENT ON TABLE audit_log IS 'Append-only audit trail. No one can edit or delete (tamper-proof for GPS/OTP and disputes).';

-- 2. job_disputes — ใช้ Double Lock ใน payments/release (เช็กทั้ง job.payment_details.dispute_status และตารางนี้)
CREATE TABLE IF NOT EXISTS job_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_disputes_job_id ON job_disputes(job_id);
CREATE INDEX IF NOT EXISTS idx_job_disputes_status ON job_disputes(status);

COMMENT ON TABLE job_disputes IS 'Dispute records per job. payments/release must have zero open rows for job_id (Double Lock).';
