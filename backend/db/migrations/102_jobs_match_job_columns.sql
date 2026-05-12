-- =================================================================================
-- 102: Ensure jobs table has all columns required for Match Job (POST /api/jobs)
-- Fixes: INSERT has more expressions than target columns (42601)
-- =================================================================================

-- Columns required by create job INSERT
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,6);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,6);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS datetime TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by_avatar TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_by UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_by_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duration_hours INTEGER DEFAULT 2;
