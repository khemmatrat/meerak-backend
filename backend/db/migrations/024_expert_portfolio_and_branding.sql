-- =================================================================================
-- 024: Expert Portfolio & Personal Branding (Talents / Provider)
-- =================================================================================
-- Sub-category: chef, tailor, artist, barber, wellness
-- Portfolio gallery, greeting video, verified badge, signature service, the journey
-- =================================================================================

-- Expert sub-category (สำหรับ Filter ในหน้า Talents)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expert_category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS portfolio_urls JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS greeting_video_url TEXT,
  ADD COLUMN IF NOT EXISTS verified_badge VARCHAR(80),
  ADD COLUMN IF NOT EXISTS signature_service TEXT,
  ADD COLUMN IF NOT EXISTS the_journey TEXT;

COMMENT ON COLUMN users.expert_category IS 'chef | tailor | artist | barber | wellness — ใช้ Filter หน้า Talents';
COMMENT ON COLUMN users.portfolio_urls IS 'Gallery รูปผลงาน (Lookbook) — array of image URLs';
COMMENT ON COLUMN users.greeting_video_url IS 'คลิปสั้นโชว์เทคนิค/Personal Brand (Video Masterclass Greeting)';
COMMENT ON COLUMN users.verified_badge IS 'Master Tailor | Authentic Chef | Style Master | etc.';
COMMENT ON COLUMN users.signature_service IS 'Signature Menu / สไตล์ที่เป็นเอกลักษณ์';
COMMENT ON COLUMN users.the_journey IS 'The Journey — ประวัติ/แนวคิดในการทำงาน (Personal Storytelling)';

CREATE INDEX IF NOT EXISTS idx_users_expert_category ON users(expert_category) WHERE expert_category IS NOT NULL;
