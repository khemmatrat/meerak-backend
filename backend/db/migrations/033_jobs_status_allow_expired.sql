-- Allow job status 'expired' for cron auto-update (fix: jobs_status_check violation)
-- Cron sets status = 'expired' for jobs past datetime; DB constraint must allow it.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- ลบทุก check constraint บนตาราง jobs ที่เกี่ยวกับ column status (ไม่พึ่งชื่อ)
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

-- เพิ่ม constraint ใหม่ให้รวม 'expired'
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'open',
    'draft',
    'accepted',
    'in_progress',
    'waiting_for_approval',
    'completed',
    'cancelled',
    'deleted',
    'expired'
  )
);

COMMENT ON CONSTRAINT jobs_status_check ON public.jobs IS 'Allowed job statuses; expired = set by cron when datetime < NOW()';
