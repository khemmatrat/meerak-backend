-- หน้าที่แสดงแบนเนอร์ในแอปมือถือ (กรองฝั่ง GET /api/banners?placement=...)
-- NULL หรือค่าว่าง = ทุกหน้า (backward compatible กับแถวเดิม)
ALTER TABLE home_banners
  ADD COLUMN IF NOT EXISTS placements TEXT[] NULL;

COMMENT ON COLUMN home_banners.placements IS 'ค่า: home, welcome, job_detail — NULL = แสดงทุกหน้า; array = เฉพาะหน้าที่ระบุ';
