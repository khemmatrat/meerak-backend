-- =================================================================================
-- 021: Advance Milestone — เก็บ commission_deducted / net_amount สำหรับใบเสร็จ
-- =================================================================================

ALTER TABLE advance_job_milestones
  ADD COLUMN IF NOT EXISTS commission_deducted NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2);

COMMENT ON COLUMN advance_job_milestones.commission_deducted IS 'ค่าคอมที่หักเมื่อปล่อยงวด (บาท)';
COMMENT ON COLUMN advance_job_milestones.net_amount IS 'เงินสุทธิที่ Talent ได้รับ (บาท)';
