-- =============================================================================
-- 214: Gold Job Lotto — จับฉลากรางวัลทองจากรหัสงาน (Match / Advance / Booking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS aqond_gold_lotto_campaigns (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(200) NOT NULL DEFAULT 'ลุ้นทองคำ 1 บาท',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  draw_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'frozen', 'drawn', 'published')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ticket_count_employer INT NOT NULL DEFAULT 0,
  ticket_count_provider INT NOT NULL DEFAULT 0,
  frozen_at TIMESTAMPTZ,
  drawn_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aqond_gold_lotto_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR(64) NOT NULL REFERENCES aqond_gold_lotto_campaigns(id) ON DELETE CASCADE,
  job_source VARCHAR(16) NOT NULL CHECK (job_source IN ('match', 'advance', 'booking')),
  job_id TEXT NOT NULL,
  display_code VARCHAR(32) NOT NULL,
  side VARCHAR(16) NOT NULL CHECK (side IN ('employer', 'provider')),
  participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_category VARCHAR(100),
  job_title TEXT,
  job_location_text TEXT,
  job_lat NUMERIC(10, 8),
  job_lng NUMERIC(11, 8),
  job_price NUMERIC(12, 2),
  job_completed_at TIMESTAMPTZ,
  eligible_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_lotto_ticket
  ON aqond_gold_lotto_tickets (campaign_id, job_source, job_id, side);
CREATE INDEX IF NOT EXISTS idx_gold_lotto_tickets_campaign_side
  ON aqond_gold_lotto_tickets (campaign_id, side);
CREATE INDEX IF NOT EXISTS idx_gold_lotto_tickets_participant
  ON aqond_gold_lotto_tickets (campaign_id, participant_user_id);

CREATE TABLE IF NOT EXISTS aqond_gold_lotto_draw_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR(64) NOT NULL REFERENCES aqond_gold_lotto_campaigns(id) ON DELETE CASCADE,
  trigger_type VARCHAR(16) NOT NULL CHECK (trigger_type IN ('manual', 'auto')),
  admin_id VARCHAR(64),
  pool_side VARCHAR(16) NOT NULL CHECK (pool_side IN ('employer', 'provider')),
  prize_rank INT NOT NULL DEFAULT 1,
  ticket_count INT NOT NULL DEFAULT 0,
  winning_index INT,
  winning_ticket_id UUID REFERENCES aqond_gold_lotto_tickets(id) ON DELETE SET NULL,
  rng_seed_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_lotto_draw_run
  ON aqond_gold_lotto_draw_runs (campaign_id, pool_side, prize_rank);

CREATE TABLE IF NOT EXISTS aqond_gold_lotto_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR(64) NOT NULL REFERENCES aqond_gold_lotto_campaigns(id) ON DELETE CASCADE,
  pool_side VARCHAR(16) NOT NULL CHECK (pool_side IN ('employer', 'provider')),
  prize_rank INT NOT NULL DEFAULT 1,
  prize_name VARCHAR(120) NOT NULL DEFAULT 'ทองคำ 1 บาท',
  winner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  winning_ticket_id UUID REFERENCES aqond_gold_lotto_tickets(id) ON DELETE SET NULL,
  winning_display_code VARCHAR(32),
  dossier_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  marketing_lock BOOLEAN NOT NULL DEFAULT TRUE,
  contact_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (contact_status IN ('pending', 'contacted', 'filmed', 'declined')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_lotto_winner_rank
  ON aqond_gold_lotto_winners (campaign_id, pool_side, prize_rank);

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'gold_lotto_campaign',
  '{
    "enabled": true,
    "campaign_id": "gold-2026",
    "title": "ลุ้นทองคำ 1 บาท",
    "period_start": "2026-01-01T00:00:00+07:00",
    "period_end": "2026-12-30T11:59:59+07:00",
    "draw_at": "2026-12-30T12:00:00+07:00",
    "prize_pools": [
      { "side": "employer", "label": "ฝั่งจ้างงาน", "prize_count": 1, "prize_name": "ทองคำ 1 บาท" },
      { "side": "provider", "label": "ฝั่งรับงาน", "prize_count": 1, "prize_name": "ทองคำ 1 บาท" }
    ],
    "exclude_user_ids": [],
    "require_kyc_for_winner": false,
    "auto_draw_enabled": true,
    "public_results_enabled": false
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO aqond_gold_lotto_campaigns (
  id, title, period_start, period_end, draw_at, status, config_json
)
VALUES (
  'gold-2026',
  'ลุ้นทองคำ 1 บาท',
  '2026-01-01T00:00:00+07:00'::timestamptz,
  '2026-12-30T11:59:59+07:00'::timestamptz,
  '2026-12-30T12:00:00+07:00'::timestamptz,
  'draft',
  (SELECT value_json FROM payout_config WHERE key = 'gold_lotto_campaign')
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE aqond_gold_lotto_campaigns IS 'Gold job lotto campaigns — one row per campaign_id';
COMMENT ON TABLE aqond_gold_lotto_tickets IS 'Eligible lottery tickets (1 job = 1 ticket per side)';
COMMENT ON TABLE aqond_gold_lotto_winners IS 'Winners with marketing dossier snapshot';
