-- 212: Identity bridge meerak users ↔ Social Core auth.identities
CREATE TABLE IF NOT EXISTS identity_links (
  meerak_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  social_core_identity_id UUID NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_links_social_core
  ON identity_links (social_core_identity_id);

COMMENT ON TABLE identity_links IS 'Maps meerak users.id to Social Core identity UUID for ads targeting/ledger';
