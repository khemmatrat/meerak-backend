-- =================================================================================
-- 061: Auto Payout — Omise Transfer Tracking
-- =================================================================================
-- เพิ่มคอลัมน์สำหรับเก็บ Omise recipient/transfer ID เมื่อใช้ auto payout
-- =================================================================================

ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS omise_recipient_id TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS omise_transfer_id TEXT;

COMMENT ON COLUMN payout_requests.omise_recipient_id IS 'Omise recipient ID (recp_xxx) when auto-transfer via Omise';
COMMENT ON COLUMN payout_requests.omise_transfer_id IS 'Omise transfer ID (trsf_xxx) when auto-transfer via Omise';
