-- Phase 4: dispatch-svc — rider jobs, GPS, delivery reviews

CREATE TABLE IF NOT EXISTS commerce.dispatch_riders (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT 'motorcycle',
  plate TEXT NOT NULL DEFAULT '',
  rating NUMERIC(3,2) NOT NULL DEFAULT 4.8,
  review_count INT NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'A',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  load_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.dispatch_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL DEFAULT '',
  rider_id TEXT,
  job_type TEXT NOT NULL DEFAULT 'food' CHECK (job_type IN ('food','parcel')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','active','completed','cancelled')),
  phase TEXT NOT NULL DEFAULT 'finding_rider',
  payment_method TEXT NOT NULL DEFAULT 'cod',
  amount_micro BIGINT NOT NULL DEFAULT 0,
  merchant_name TEXT NOT NULL DEFAULT '',
  items_summary TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  handoff_note TEXT,
  eta_label TEXT,
  pickup_lat DOUBLE PRECISION NOT NULL DEFAULT 13.724,
  pickup_lng DOUBLE PRECISION NOT NULL DEFAULT 100.534,
  dropoff_lat DOUBLE PRECISION NOT NULL DEFAULT 13.728,
  dropoff_lng DOUBLE PRECISION NOT NULL DEFAULT 100.52,
  rider_lat DOUBLE PRECISION,
  rider_lng DOUBLE PRECISION,
  delivery_photo_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_rider ON commerce.dispatch_jobs (rider_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_merchant ON commerce.dispatch_jobs (merchant_id, status);

CREATE TABLE IF NOT EXISTS commerce.dispatch_job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES commerce.dispatch_jobs(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_job ON commerce.dispatch_job_events (job_id, created_at);

CREATE TABLE IF NOT EXISTS commerce.dispatch_reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES commerce.dispatch_jobs(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  rider_id TEXT,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  tip_micro BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

INSERT INTO commerce.dispatch_riders (id, display_name, phone, vehicle, plate, rating, review_count, grade, lat, lng) VALUES
  ('rider-bee-1', 'คุณบีม', '0812345001', 'motorcycle', '1กข 1234', 4.9, 1240, 'A+', 13.722, 100.532),
  ('rider-nid-1', 'คุณนิด', '0812345002', 'motorcycle', '2ขค 5678', 4.7, 890, 'A', 13.726, 100.538),
  ('rider-art-1', 'คุณอาร์ต', '0812345003', 'car', '3งจ 9012', 4.8, 2100, 'S', 13.718, 100.528)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE commerce.dispatch_jobs IS 'Phase 4 rider dispatch jobs (food + on-demand parcel)';
