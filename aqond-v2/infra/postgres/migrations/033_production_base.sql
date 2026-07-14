-- Phase 5 production base: merchant shops in PG + dispatch notification templates

CREATE TABLE IF NOT EXISTS commerce.merchant_owner_profiles (
  owner_id TEXT PRIMARY KEY,
  extra_slots INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.merchant_shops (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  shop_type TEXT NOT NULL DEFAULT 'marketplace' CHECK (shop_type IN ('food','marketplace')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_merchant_shops_owner ON commerce.merchant_shops (owner_id, status);

INSERT INTO commerce.merchant_shops (id, owner_id, name, shop_type, status, created_at, approved_at) VALUES
  ('demo-merchant', '*', 'ร้านค้า Demo', 'marketplace', 'approved', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('food-thai-1', '*', 'ครัวบ้านสวน', 'food', 'approved', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('food-jp-1', '*', 'ซูชิโฮมุระ', 'food', 'approved', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('food-cafe-1', '*', 'Matcha House', 'food', 'approved', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('m-fashion-1', '*', 'Fashion Corner', 'marketplace', 'approved', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Ensure line channel allowed (028 may not have run on older DBs)
ALTER TABLE commerce.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_channel_check;
ALTER TABLE commerce.notification_templates ADD CONSTRAINT notification_templates_channel_check
  CHECK (channel IN ('push','email','sms','inapp','line'));

-- Fix legacy #{var} placeholders to {var}
UPDATE commerce.notification_templates SET body = REPLACE(body, '#{order_id}', '{order_id}');

INSERT INTO commerce.notification_templates (id, template_key, locale, channel, subject, body) VALUES
  ('nt-mnew-push','merchant_new_order','th-TH','push','ออเดอร์ใหม่','มีออเดอร์ใหม่ {order_id} — {merchant_name}'),
  ('nt-mnew-line','merchant_new_order','th-TH','line','','ออเดอร์ใหม่ {order_id} เข้าร้าน {merchant_name}'),
  ('nt-prep-push','merchant_preparing','th-TH','push','กำลังเตรียม','ร้านกำลังเตรียมออเดอร์ {order_id}'),
  ('nt-prep-line','merchant_preparing','th-TH','line','','ร้านกำลังเตรียมออเดอร์ {order_id}'),
  ('nt-ready-push','food_ready','th-TH','push','อาหารพร้อม','อาหารพร้อมแล้ว — รอไรเดอร์มารับ {order_id}'),
  ('nt-ready-line','food_ready','th-TH','line','','อาหารพร้อมแล้ว ออเดอร์ {order_id}'),
  ('nt-find-push','dispatch_job_created','th-TH','push','รับออเดอร์แล้ว','ออเดอร์ {order_id} — กำลังหาไรเดอร์'),
  ('nt-find-line','dispatch_job_created','th-TH','line','','ออเดอร์ {order_id} กำลังหาไรเดอร์'),
  ('nt-rassign-push','rider_assigned','th-TH','push','ไรเดอร์รับงาน','ไรเดอร์รับงานออเดอร์ {order_id} แล้ว'),
  ('nt-rassign-line','rider_assigned','th-TH','line','','ไรเดอร์รับงานออเดอร์ {order_id}'),
  ('nt-rpick-push','rider_picked_up','th-TH','push','ไรเดอร์รับอาหารแล้ว','ไรเดอร์รับอาหารแล้ว — กำลังนำไปส่ง {order_id}'),
  ('nt-rpick-line','rider_picked_up','th-TH','line','','ไรเดอร์รับอาหารแล้ว ออเดอร์ {order_id}'),
  ('nt-arrive-line-fix','rider_arrived','th-TH','line','','ไรเดอร์ถึงหน้าบ้านแล้ว — ออเดอร์ {order_id}'),
  ('nt-delivered-push','order_delivered','th-TH','push','ส่งสำเร็จ','ออเดอร์ {order_id} ส่งสำเร็จแล้ว'),
  ('nt-delivered-line','order_delivered','th-TH','line','','ออเดอร์ {order_id} ส่งสำเร็จแล้ว ขอบคุณที่ใช้บริการ'),
  ('nt-rjob-push','rider_new_job','th-TH','push','งานใหม่','งานส่งใหม่ {order_id} — {merchant_name}'),
  ('nt-rjob-line','rider_new_job','th-TH','line','','งานส่งใหม่ {order_id} จาก {merchant_name}')
ON CONFLICT (template_key, locale, channel) DO NOTHING;

COMMENT ON TABLE commerce.merchant_shops IS 'Phase5: merchant shop registry (replaces merchant-shops.json)';
