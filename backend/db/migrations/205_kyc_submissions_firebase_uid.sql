-- 205: kyc_submissions.firebase_uid — บางฐาน legacy มี NOT NULL; schema_fixed ดั้งเดิมไม่มีคอลัมน์นี้
-- เพิ่มคอลัมน์แบบ nullable; แอปใส่ค่าจาก users.firebase_uid ตอน POST /api/kyc/submit

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(255);

COMMENT ON COLUMN kyc_submissions.firebase_uid IS 'อ้างอิง Firebase Auth uid ของผู้ส่ง (คัดลอกจาก users)';
