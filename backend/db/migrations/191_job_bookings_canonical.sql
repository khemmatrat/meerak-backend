-- =================================================================================
-- 191: Canonical public.job_bookings (Task 10 / job checkout schema drift)
-- =================================================================================
-- Pre-deploy discovery (read-only; run manually if needed):
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name IN ('jobs', 'advance_jobs', 'job_bookings')
--   ORDER BY table_name, ordinal_position;
--
--   SELECT tc.table_name, kcu.column_name
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.key_column_usage kcu
--     ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
--   WHERE tc.table_schema = 'public'
--     AND tc.constraint_type = 'PRIMARY KEY'
--     AND tc.table_name IN ('jobs', 'advance_jobs', 'job_bookings');
--
-- This migration:
--   * Creates public.job_bookings ONLY when the table is completely absent.
--   * Does NOT ALTER public.jobs or public.advance_jobs.
-- =================================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'job_bookings'
  ) THEN
    RAISE NOTICE '191: public.job_bookings already exists — skipping CREATE';
  ELSE
    CREATE TABLE public.job_bookings (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id              TEXT NOT NULL,
      payment_id          TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX uq_job_bookings_job_id ON public.job_bookings (job_id);
    CREATE INDEX idx_job_bookings_payment_id ON public.job_bookings (payment_id);
    CREATE INDEX idx_job_bookings_status ON public.job_bookings (status);

    COMMENT ON TABLE public.job_bookings IS
      'Canonical booking / checkout row per job reference (job_id). Created by migration 191 when missing; safe for mixed deployments.';
  END IF;
END $$;
