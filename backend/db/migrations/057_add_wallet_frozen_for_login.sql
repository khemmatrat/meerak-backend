-- 057: เพิ่ม wallet_frozen สำหรับ login (ถ้า 050 ยังไม่รัน)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_frozen BOOLEAN DEFAULT FALSE;
