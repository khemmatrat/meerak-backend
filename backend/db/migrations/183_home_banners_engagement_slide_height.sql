-- Engagement แยก sheet vs claim + สัดส่วนสไลด์ต่อแบนเนอร์ (ทับได้จาก remote / บริบทหน้าเมื่อ NULL)
ALTER TABLE home_banners
  ADD COLUMN IF NOT EXISTS sheet_opens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claims INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slide_height TEXT NULL;

COMMENT ON COLUMN home_banners.sheet_opens IS 'จำนวนครั้งที่เปิด bottom sheet รายละเอียด (POST .../events kind=sheet_open)';
COMMENT ON COLUMN home_banners.claims IS 'จำนวนครั้งที่บันทึก claim สำเร็จ (POST .../events kind=claim)';
COMMENT ON COLUMN home_banners.slide_height IS 'hero | strip | portrait — NULL = ใช้ค่า default จากแอป (remote) / บริบทหน้า';

ALTER TABLE home_banners DROP CONSTRAINT IF EXISTS home_banners_slide_height_chk;
ALTER TABLE home_banners
  ADD CONSTRAINT home_banners_slide_height_chk
  CHECK (slide_height IS NULL OR slide_height IN ('hero', 'strip', 'portrait'));
