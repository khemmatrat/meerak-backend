-- 134: หลักฐานรูปก่อน/หลังยืนยันฝั่ง DB + meet code (อ้างอิงจาก proof_*)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS before_photo_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS after_photo_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_before_verified_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_after_verified_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_before_sha256 TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_after_sha256 TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_before_vision_skipped BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS proof_after_vision_skipped BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN jobs.proof_before_verified_at IS 'ตั้งเมื่อ POST /verify-proof-image สำเร็จ (phase=before)';
COMMENT ON COLUMN jobs.proof_after_verified_at IS 'ตั้งเมื่อ POST /verify-proof-image สำเร็จ (phase=after)';
COMMENT ON COLUMN jobs.proof_before_vision_skipped IS 'TRUE ถ้าไม่ได้รัน Gemini (ไม่มี key หรือปิด JOB_PROOF_VISION_ENABLED)';
