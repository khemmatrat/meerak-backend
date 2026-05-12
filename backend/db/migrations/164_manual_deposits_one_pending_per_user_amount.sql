-- 164: กันส่งคำขอเติมเงิน "ยอดเดียวกัน" ซ้ำขณะรอตรวจ (สลิปคนละไฟล์ แต่โอนจริงครั้งเดียว)
-- หมายเหตุ: การตรวจกับสเตทเมนต์ธนาคารยังเป็นหน้าที่แอดมิน — ระบบช่วยลดความเสี่ยงเท่านั้น

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_deposits_one_pending_per_user_amount
  ON manual_deposits (user_id, amount)
  WHERE status = 'manual_pending_verification';

COMMENT ON INDEX idx_manual_deposits_one_pending_per_user_amount IS
  'ผู้ใช้คนเดียวกันไม่ให้มีมากกว่า 1 แถว pending สำหรับยอดเดียวกัน (จนกว่าจะอนุมัติ/ปฏิเสธ)';
