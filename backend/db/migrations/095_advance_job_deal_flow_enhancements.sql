-- 095: Advance Job Deal Flow — Counter-offer, Expiry, History
-- Counter-offer: Talent เสนอราคาใหม่ได้
-- Deal expiry: หมดอายุหลัง X ชม.
-- Deal history: บันทึก Deal ก่อนหน้า (ปฏิเสธ/หมดอายุ)

-- 1. เพิ่มคอลัมน์ใน advance_job_deals
ALTER TABLE advance_job_deals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE advance_job_deals ADD COLUMN IF NOT EXISTS proposed_by VARCHAR(10) DEFAULT 'employer' CHECK (proposed_by IN ('employer','talent'));
ALTER TABLE advance_job_deals ADD COLUMN IF NOT EXISTS counter_to_deal_id UUID REFERENCES advance_job_deals(id) ON DELETE SET NULL;

-- 2. ขยาย status ให้รองรับ expired, counter_offered, replaced
ALTER TABLE advance_job_deals DROP CONSTRAINT IF EXISTS advance_job_deals_status_check;
ALTER TABLE advance_job_deals ADD CONSTRAINT advance_job_deals_status_check
  CHECK (status IN ('pending','accepted','declined','expired','counter_offered','replaced'));

-- 3. อัปเดต expires_at สำหรับ deal เก่าที่ยังไม่มี (ใช้ 24 ชม. จาก created_at)
UPDATE advance_job_deals SET expires_at = created_at + INTERVAL '24 hours' WHERE expires_at IS NULL AND status = 'pending';

-- 4. Index สำหรับ deal history
CREATE INDEX IF NOT EXISTS idx_advance_job_deals_job_talent ON advance_job_deals(job_id, talent_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_deals_expires ON advance_job_deals(expires_at) WHERE status = 'pending';

COMMENT ON COLUMN advance_job_deals.expires_at IS 'Deal หมดอายุเมื่อไหร่ — ถ้าไม่ตอบถือว่า expired';
COMMENT ON COLUMN advance_job_deals.proposed_by IS 'employer = นายจ้างส่ง, talent = Talent เสนอ counter';
COMMENT ON COLUMN advance_job_deals.counter_to_deal_id IS 'เมื่อ Talent counter-offer จะชี้ไปที่ Deal เดิมของนายจ้าง';
