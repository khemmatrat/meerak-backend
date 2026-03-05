-- =================================================================================
-- 026: Booking Deposit (มัดจำจองคิว)
-- =================================================================================
-- เก็บจำนวนมัดจำและสถานะ สำหรับ flow: จองแล้ววางมัดจำ (10–20% งบ) ป้องกันจองทิ้ง
-- เมื่อมี wallet/escrow จริง สามารถบังคับหักจาก booker และ set deposit_status = 'held'
-- =================================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0 CHECK (deposit_amount >= 0),
  ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(20) DEFAULT 'none' CHECK (deposit_status IN ('none', 'pending', 'held', 'released', 'refunded'));

COMMENT ON COLUMN bookings.deposit_amount IS 'จำนวนมัดจำที่ตกลง (บาท) — เช่น 10–20% ของงบประมาณ';
COMMENT ON COLUMN bookings.deposit_status IS 'none=ไม่ใช้มัดจำ, pending=รอชำระ, held=ถือไว้, released=ปล่อยให้ Talent, refunded=คืนนายจ้าง';
