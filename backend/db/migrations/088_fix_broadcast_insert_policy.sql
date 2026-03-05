-- Fix: allow full admins (agency_id IS NULL) to insert broadcast messages
DROP POLICY IF EXISTS "Admins can insert broadcast messages" ON public.admin_broadcast_messages;
CREATE POLICY "Admins can insert broadcast messages"
  ON public.admin_broadcast_messages FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT aed.agency_id FROM admin_email_domains aed
      WHERE aed.domain = split_part(auth.jwt() ->> 'email', '@', 2)
        AND aed.agency_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM admin_email_domains aed
      WHERE aed.domain = split_part(auth.jwt() ->> 'email', '@', 2)
        AND aed.agency_id IS NULL
    )
  );
