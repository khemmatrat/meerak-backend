-- 090: Video Feed — Like และ Comment สำหรับ talent_videos
CREATE TABLE IF NOT EXISTS video_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES talent_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, user_id)
);

CREATE TABLE IF NOT EXISTS video_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES talent_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_likes_video ON video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user ON video_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_created ON video_comments(video_id, created_at DESC);

COMMENT ON TABLE video_likes IS 'ไลค์คลิปใน Video Feed';
COMMENT ON TABLE video_comments IS 'คอมเมนต์คลิปใน Video Feed';
