-- Fix order_paid templates (correct columns + placeholder syntax)

INSERT INTO commerce.notification_templates (id, template_key, locale, channel, subject, body)
VALUES
  ('nt-paid-push','order_paid','th-TH','push','ชำระเงินสำเร็จ','ออเดอร์ {order_id} ชำระเงินแล้ว — รอร้านรับออเดอร์'),
  ('nt-paid-line','order_paid','th-TH','line','','ชำระเงินสำเร็จ ออเดอร์ {order_id} (Ref {payso_reference_id}) — รอร้านรับออเดอร์')
ON CONFLICT (template_key, locale, channel) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body;
