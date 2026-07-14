-- Idempotency สำหรับการสมัคร: ซ้ำ Idempotency-Key + body เดียวกัน → ได้ session เดิม (ลด phantom duplicate)
CREATE TABLE IF NOT EXISTS registration_idempotency (
    idempotency_key VARCHAR(160) PRIMARY KEY,
    phone_norm VARCHAR(32) NOT NULL,
    firebase_uid TEXT NOT NULL,
    user_id UUID NOT NULL,
    body_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registration_idempotency_expires
    ON registration_idempotency (expires_at);
