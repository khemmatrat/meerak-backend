-- Phase 3.4 — Shadow comparison snapshot persistence (append-only audit; no FK to users)
-- Gated by ENABLE_SIGNUP_SHADOW_EXECUTION; write occurs only inside shadow lane.

CREATE TABLE IF NOT EXISTS signup_shadow_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id VARCHAR(80) NOT NULL,
    comparison_version VARCHAR(32) NOT NULL,
    confidence_score INT NOT NULL,
    drift_detected BOOLEAN NOT NULL,
    mismatch_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    shadow_result_kind VARCHAR(32),
    request_id VARCHAR(120),
    traffic_lane VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shadow_snapshots_created ON signup_shadow_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_snapshots_confidence ON signup_shadow_snapshots (confidence_score);
CREATE INDEX IF NOT EXISTS idx_shadow_snapshots_drift ON signup_shadow_snapshots (drift_detected);
