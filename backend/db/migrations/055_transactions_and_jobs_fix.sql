-- 055: Fix missing transactions table + jobs_status_check for expired
-- แก้ 2 ปัญหา: relation "transactions" does not exist, jobs_status_check violation

-- 1. สร้าง transactions ถ้ายังไม่มี (schema ตรงกับ server.js: user_id, type, amount, description, status, related_job_id, metadata)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      type VARCHAR(50) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      description TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      related_job_id UUID,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMP
    );
    CREATE INDEX idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX idx_transactions_status ON transactions(status);
    CREATE INDEX idx_transactions_related_job ON transactions(related_job_id);
    CREATE INDEX idx_transactions_created_at ON transactions(created_at);
    RAISE NOTICE 'Created table transactions';
  ELSE
    RAISE NOTICE 'Table transactions already exists';
  END IF;
END $$;

-- 2. แก้ jobs_status_check ให้รองรับ 'expired' (สำหรับ Cron update-expired)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'jobs'
      AND n.nspname = 'public'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'open', 'draft', 'accepted', 'in_progress', 'waiting_for_approval',
    'completed', 'cancelled', 'deleted', 'expired'
  )
);
