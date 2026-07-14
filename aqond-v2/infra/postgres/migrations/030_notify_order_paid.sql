-- FCM/LINE templates for order paid (Tier 1b #2)

INSERT INTO commerce.notification_templates (id, template_key, locale, channel, subject, body)
VALUES
  ('nt-paid-push','order_paid','th-TH','push','ชำระเงินสำเร็จ','ออเดอร์ {order_id} ชำระเงินแล้ว — รอร้านรับออเดอร์'),
  ('nt-paid-line','order_paid','th-TH','line','','ชำระเงินสำเร็จ ออเดอร์ {order_id} (Ref {payso_reference_id}) — รอร้านรับออเดอร์')
ON CONFLICT (template_key, locale, channel) DO NOTHING;

ALTER TABLE commerce.push_registrations
  ADD COLUMN IF NOT EXISTS fcm_token TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_push_registrations_fcm
  ON commerce.push_registrations (user_id)
  WHERE fcm_token <> '';
