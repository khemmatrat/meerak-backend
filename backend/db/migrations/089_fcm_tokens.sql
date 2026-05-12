-- FCM tokens for Web Push (Landing page subscribers) และ Mobile ในอนาคต
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL DEFAULT 'landing', -- 'landing' | 'mobile'
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_source ON fcm_tokens(source);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
