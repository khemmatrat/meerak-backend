-- =================================================================================
-- 074: Power to the User — Role Switcher, Peace Mode, Collision Ban
-- =================================================================================
-- is_peace_mode: ปิด Push งานใหม่ + ซ่อนจาก search
-- peace_mode_until: Auto-reset เวลากลับมาออนไลน์
-- ban_expires_at: 24hr lock เมื่อฝ่าฝืน Collision
-- =================================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_peace_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS peace_mode_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_peace_mode ON users(is_peace_mode) WHERE is_peace_mode = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_ban_expires ON users(ban_expires_at) WHERE ban_expires_at IS NOT NULL;

COMMENT ON COLUMN users.is_peace_mode IS 'Peace Mode: no job push, hidden from search, provider_available=false';
COMMENT ON COLUMN users.peace_mode_until IS 'Auto-reset: when to come back online';
COMMENT ON COLUMN users.ban_expires_at IS '24hr lock when collision violation detected';

-- system_event_log for mode switches & penalties (audit)
CREATE TABLE IF NOT EXISTS system_event_log (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(20) NOT NULL,
  actor_id TEXT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id TEXT,
  state_before JSONB,
  state_after JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_event_actor ON system_event_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_system_event_action ON system_event_log(action);
CREATE INDEX IF NOT EXISTS idx_system_event_created ON system_event_log(created_at DESC);

COMMENT ON TABLE system_event_log IS 'Audit: mode switches, peace mode, collision penalties';
