-- Compass onboarding — intent survey + guided provider/rider track

ALTER TABLE users ADD COLUMN IF NOT EXISTS acquisition_channel VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_goals JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_intent VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compass_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_compass_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS compass_category_pack JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_compass_mode ON users (compass_mode) WHERE compass_mode = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_primary_intent ON users (primary_intent) WHERE primary_intent IS NOT NULL;
