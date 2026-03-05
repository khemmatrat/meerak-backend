-- 058: Talent Videos — คลิปผลงาน Provider/Talent สำหรับ Video Feed (TikTok-style)
CREATE TABLE IF NOT EXISTS talent_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  title TEXT,
  description TEXT,
  duration_seconds INTEGER,
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_videos_talent ON talent_videos(talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_videos_approved ON talent_videos(is_approved, created_at DESC);

COMMENT ON TABLE talent_videos IS 'คลิปผลงาน Talent สำหรับ Video Feed; is_approved=FALSE รอ Admin approve';
