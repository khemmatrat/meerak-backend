-- 252: บันทึกคลิปโปรโมตจาก Video Feed (snapshot ตาม creative_id)
CREATE TABLE IF NOT EXISTS saved_promoted_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creative_id VARCHAR(128) NOT NULL,
  campaign_id VARCHAR(128),
  title TEXT,
  description TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  destination_url TEXT,
  media_type VARCHAR(16) NOT NULL DEFAULT 'video',
  content_kind VARCHAR(32),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, creative_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_promoted_clips_user ON saved_promoted_clips(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_promoted_clips_created ON saved_promoted_clips(created_at DESC);

COMMENT ON TABLE saved_promoted_clips IS 'ผู้ใช้บันทึกคลิปโปรโมตจากฟีด — อ้างอิง creative_id ไม่ใช่ impression รายครั้ง';
