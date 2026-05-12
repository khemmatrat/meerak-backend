-- 163: กันส่งสลิปไฟล์เดิมซ้ำ (โอน 1 บาทแต่กดส่งสลิป 2 ครั้ง → เครดิต 2 บาท)
-- ใช้ SHA-256 ของเนื้อหาไฟล์ + partial unique index (เฉพาะ pending / approved)

ALTER TABLE manual_deposits ADD COLUMN IF NOT EXISTS slip_sha256 TEXT;

COMMENT ON COLUMN manual_deposits.slip_sha256 IS 'SHA-256 ของ buffer ไฟล์สลิป — กันผู้ใช้ส่งไฟล์เดียวกันซ้ำ';

-- ผู้ใช้คนเดียวกัน + สลิปไฟล์เดียวกัน ไม่ให้มีมากกว่า 1 แถวในสถานะรอตรวจหรืออนุมัติแล้ว
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_deposits_user_slip_sha_active
  ON manual_deposits (user_id, slip_sha256)
  WHERE slip_sha256 IS NOT NULL
    AND status IN ('manual_pending_verification', 'approved');
