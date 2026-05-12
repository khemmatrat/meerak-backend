-- 127: Marine Hardening — Pier status, Check-in, SOS, Car-Boat sync
-- Guaranteed Departure: Skipper must check-in 30 mins before via GPS
-- Pier validation: status (open|closed|maintenance), boat-pier compatibility

-- Marine piers (ท่าเรือ)
CREATE TABLE IF NOT EXISTS marine_piers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_th VARCHAR(255),
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','closed','maintenance')),
  capacity INT DEFAULT 10,
  max_draft_m DECIMAL(5,2),
  min_dock_length_m DECIMAL(5,2),
  compatible_boat_types TEXT[],
  closed_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marine job extras (extends jobs with category='Marine')
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pier_id VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ferry_round_time VARCHAR(10);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS boat_grade VARCHAR(20);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS marine_status VARCHAR(30);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skipper_check_in_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skipper_check_in_lat DECIMAL(10,8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skipper_check_in_lng DECIMAL(11,8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS car_booking_id VARCHAR(100);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS car_eta_minutes INT;

-- marine_status: pending_checkin | checkin_ok | delayed | arrived | sos | no_show

-- Marine admin alerts (SOS, no-checkin, backup captain)
CREATE TABLE IF NOT EXISTS marine_admin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(100),
  alert_type VARCHAR(30) NOT NULL,
  payload JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed piers
INSERT INTO marine_piers (id, name, name_th, lat, lng, status, compatible_boat_types) VALUES
  ('chao-phraya', 'Chao Phraya Pier (Bangkok)', 'ท่าเรือเจ้าพระยา (กรุงเทพ)', 13.7563, 100.5018, 'open', ARRAY['longtail','speedboat','ferry']),
  ('phuket-chalong', 'Chalong Pier (Phuket)', 'ท่าเรือฉลอง (ภูเก็ต)', 7.8154, 98.3845, 'open', ARRAY['longtail','speedboat','ferry','yacht']),
  ('krabi-ao-nang', 'Ao Nang Pier (Krabi)', 'ท่าเรืออ่าวนาง (กระบี่)', 8.0314, 98.9201, 'open', ARRAY['longtail','speedboat','ferry']),
  ('samui-nathon', 'Nathon Pier (Koh Samui)', 'ท่าเรือนาทอน (สมุย)', 9.5357, 100.0629, 'open', ARRAY['longtail','speedboat','ferry'])
ON CONFLICT (id) DO NOTHING;
