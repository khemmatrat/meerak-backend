-- TOTP (Google Authenticator) สำหรับบัญชี Admin/Auditor
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_totp_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.admin_totp_secret IS 'Base32 secret — เก็บอย่างปลอดภัย ห้าม log';
COMMENT ON COLUMN users.admin_totp_pending_secret IS 'ชั่วคระระหว่างลงทะเบียน Authenticator';
COMMENT ON COLUMN users.admin_totp_enabled IS 'เปิดใช้ 2FA หลังสแกน QR และยืนยันรหัสครั้งแรก';
