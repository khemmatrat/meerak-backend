-- Rider OS face verification sessions (Level B/C) + security incidents
CREATE TABLE IF NOT EXISTS commerce.rider_face_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rider_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  verify_level TEXT NOT NULL DEFAULT 'standard' CHECK (verify_level IN ('standard', 'strong')),
  purpose TEXT NOT NULL DEFAULT 'online' CHECK (purpose IN ('online', 'passenger', 'reverify')),
  liveness_passed BOOLEAN NOT NULL DEFAULT FALSE,
  match_score NUMERIC(6,4),
  match_threshold NUMERIC(6,4),
  id_card_match_score NUMERIC(6,4),
  face_match_passed BOOLEAN NOT NULL DEFAULT FALSE,
  device_fingerprint TEXT,
  bind_lat DOUBLE PRECISION,
  bind_lng DOUBLE PRECISION,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rider_face_sessions_user_active
  ON commerce.rider_face_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rider_face_sessions_rider
  ON commerce.rider_face_sessions (rider_id, verified_at DESC);

CREATE TABLE IF NOT EXISTS commerce.rider_face_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rider_id TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  session_id UUID REFERENCES commerce.rider_face_sessions(id) ON DELETE SET NULL,
  match_score NUMERIC(6,4),
  device_fingerprint TEXT,
  attempt_device_fingerprint TEXT,
  bind_lat DOUBLE PRECISION,
  bind_lng DOUBLE PRECISION,
  attempt_lat DOUBLE PRECISION,
  attempt_lng DOUBLE PRECISION,
  rider_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notified BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_face_incidents_created
  ON commerce.rider_face_incidents (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rider_face_incidents_rider
  ON commerce.rider_face_incidents (rider_id, created_at DESC);
