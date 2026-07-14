-- Phase 2 — Signup intents (V2-isolated experimental surface; gated by ENABLE_SIGNUP_INTENTS)
-- Idempotent creations: partial unique index on idempotency_key only while pending.

CREATE TABLE IF NOT EXISTS signup_intents (
    intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(32) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'pending',
    source_platform VARCHAR(32),
    embedded_browser BOOLEAN NOT NULL DEFAULT FALSE,
    retry_count INT NOT NULL DEFAULT 0,
    recovery_token VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(160),
    expires_at TIMESTAMPTZ NOT NULL,
    flow_version VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_signup_intents_recovery ON signup_intents (recovery_token);
CREATE UNIQUE INDEX IF NOT EXISTS ux_signup_intents_idempo_pending
    ON signup_intents (idempotency_key)
    WHERE idempotency_key IS NOT NULL AND state = 'pending';
CREATE INDEX IF NOT EXISTS idx_signup_intents_phone ON signup_intents (phone);
CREATE INDEX IF NOT EXISTS idx_signup_intents_expires ON signup_intents (expires_at);
CREATE INDEX IF NOT EXISTS idx_signup_intents_state ON signup_intents (state);

CREATE TABLE IF NOT EXISTS signup_intent_events (
    id BIGSERIAL PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES signup_intents(intent_id) ON DELETE CASCADE,
    from_state VARCHAR(32),
    to_state VARCHAR(32) NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    flow_version VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_intent_events_intent ON signup_intent_events (intent_id, created_at DESC);
