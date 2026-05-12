-- =================================================================================
-- 061: Auto Payout — external transfer tracking (legacy column names; see migration 137)
-- =================================================================================
-- เพิ่มคอลัมน์สำหรับเก็บ recipient/transfer id จาก payment processor เมื่อใช้ auto payout
-- =================================================================================

ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS omise_recipient_id TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS omise_transfer_id TEXT;

COMMENT ON COLUMN payout_requests.omise_recipient_id IS 'External payout recipient id from payment processor (renamed to gateway_recipient_ref in migration 137)';
COMMENT ON COLUMN payout_requests.omise_transfer_id IS 'External transfer id from payment processor (renamed to gateway_transfer_ref in migration 137)';
