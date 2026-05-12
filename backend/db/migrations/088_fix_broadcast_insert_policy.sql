-- Fix: allow full admins (agency_id IS NULL) to insert broadcast messages
-- ใช้กับ Supabase เท่านั้น (role "authenticated" + auth.jwt) — ข้ามถ้าใช้ PostgreSQL มาตรฐาน
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_broadcast_messages') THEN
    DROP POLICY IF EXISTS "Admins can insert broadcast messages" ON public.admin_broadcast_messages;
    EXECUTE 'CREATE POLICY "Admins can insert broadcast messages"
      ON public.admin_broadcast_messages FOR INSERT TO authenticated
      WITH CHECK (
        agency_id IN (
          SELECT aed.agency_id FROM admin_email_domains aed
          WHERE aed.domain = split_part(auth.jwt() ->> ''email'', ''@'', 2)
            AND aed.agency_id IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM admin_email_domains aed
          WHERE aed.domain = split_part(auth.jwt() ->> ''email'', ''@'', 2)
            AND aed.agency_id IS NULL
        )
      )';
  END IF;
END $$;
