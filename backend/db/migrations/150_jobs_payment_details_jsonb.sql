-- Admin Job Operations queue-backlog และหลาย path อ่าน jobs.payment_details (JSONB)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;
