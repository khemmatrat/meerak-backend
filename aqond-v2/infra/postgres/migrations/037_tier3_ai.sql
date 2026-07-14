-- Tier 3: AI sessions for merchant, rider, user

CREATE TABLE IF NOT EXISTS commerce.merchant_ai_sessions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}',
  last_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchant_ai_merchant ON commerce.merchant_ai_sessions (merchant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS commerce.rider_ai_sessions (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  job_id TEXT,
  session_id TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}',
  incident_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rider_ai_rider ON commerce.rider_ai_sessions (rider_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS commerce.user_ai_preferences (
  user_id TEXT PRIMARY KEY,
  jarvis_voice_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  jarvis_locale TEXT NOT NULL DEFAULT 'th-TH',
  notify_ai_tips BOOLEAN NOT NULL DEFAULT TRUE,
  context_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.rider_voice_incidents (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  job_id TEXT,
  order_id TEXT,
  transcript TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rider_incidents_job ON commerce.rider_voice_incidents (job_id, created_at DESC);
