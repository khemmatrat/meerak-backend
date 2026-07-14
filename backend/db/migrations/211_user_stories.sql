-- 211: User Stories (24h ephemeral) — Instagram-style tray on Home
CREATE TABLE IF NOT EXISTS user_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('text', 'image', 'video')),
  media_url TEXT,
  text_overlay TEXT,
  background_style JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stories_user_expires ON user_stories (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_stories_expires ON user_stories (expires_at);

CREATE TABLE IF NOT EXISTS user_story_views (
  story_id UUID NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_user_story_views_viewer ON user_story_views (viewer_id, viewed_at DESC);

COMMENT ON TABLE user_stories IS 'Ephemeral stories (24h) — separate from talent_videos Video Feed';
COMMENT ON TABLE user_story_views IS 'Per-viewer seen state for story ring UI';
