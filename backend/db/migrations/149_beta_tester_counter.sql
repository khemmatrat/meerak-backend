-- =============================================================================
-- 149: Closed beta cohort — atomic slot counter + user flags (first N signups)
-- =============================================================================

CREATE TABLE IF NOT EXISTS beta_tester_counter (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_slots int NOT NULL DEFAULT 100,
  slots_used int NOT NULL DEFAULT 0
);

INSERT INTO beta_tester_counter (id, max_slots, slots_used) VALUES (1, 100, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_beta_tester boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS beta_tester_number int NULL;

CREATE INDEX IF NOT EXISTS idx_users_is_beta_tester ON users (is_beta_tester) WHERE is_beta_tester = true;

COMMENT ON TABLE beta_tester_counter IS 'Single-row lock target for allocating beta_tester_number 1..max_slots';
COMMENT ON COLUMN users.beta_tester_number IS 'Sequence 1..max_slots within closed beta; NULL if not in cohort';
