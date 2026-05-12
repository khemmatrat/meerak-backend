-- 160: Manual payout backup — mark paid outside PaySo API (slip evidence)
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_manually BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_manually_slip_url TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_manually_at TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_manually_by TEXT;

COMMENT ON COLUMN payout_requests.paid_manually IS 'อนุมัติโดยโอนมือ (สำรองเมื่อ PaySo ล่ม/วันหยุด)';
COMMENT ON COLUMN payout_requests.paid_manually_slip_url IS 'หลักฐานสลิปโอนมือ';
