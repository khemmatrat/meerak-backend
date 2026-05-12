-- 097: Job Templates — สร้างงานจาก Template, บันทึก Template
-- advance_job_templates: เก็บ job description ที่ใช้บ่อย (ติดตั้ง, ซ่อมแซม ฯลฯ)
CREATE TABLE IF NOT EXISTS advance_job_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  min_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 7,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_job_templates_employer ON advance_job_templates(employer_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_templates_category ON advance_job_templates(category);
CREATE INDEX IF NOT EXISTS idx_advance_job_templates_system ON advance_job_templates(is_system) WHERE is_system = TRUE;

COMMENT ON TABLE advance_job_templates IS 'Template งาน Advance — สร้างจาก Template หรือบันทึก job ที่ใช้บ่อย';

-- System templates (ติดตั้ง, ซ่อมแซม ฯลฯ) — insert ถ้ายังไม่มี
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM advance_job_templates WHERE is_system = TRUE) = 0 THEN
    INSERT INTO advance_job_templates (name, category, description, scope, min_budget, max_budget, duration_days, is_system) VALUES
      ('ติดตั้งอุปกรณ์', 'Admin & Support', 'ต้องการผู้ช่วยติดตั้งอุปกรณ์/เฟอร์นิเจอร์', '1. ติดตั้งตามคู่มือ 2. ตรวจสอบการทำงาน 3. ส่งมอบเมื่อเสร็จ', 500, 3000, 1, TRUE),
      ('ซ่อมแซม/แก้ไข', 'Other', 'ต้องการช่างซ่อมหรือแก้ไขงาน', '1. ตรวจสอบปัญหา 2. แก้ไข/ซ่อมแซม 3. ทดสอบการทำงาน', 1000, 10000, 3, TRUE),
      ('ดีไซน์โลโก้', 'Design & Creative', 'ต้องการออกแบบโลโก้สำหรับธุรกิจ', '1. รับ brief 2. ส่งแบบร่าง 3. แก้ไขตาม feedback 4. ส่งไฟล์ final', 2000, 15000, 7, TRUE),
      ('เขียนบทความ', 'Writing & Translation', 'ต้องการบทความสำหรับเว็บหรือบล็อก', '1. รับหัวข้อ 2. เขียนบทความ 3. แก้ไข 1 รอบ 4. ส่งมอบ', 500, 5000, 5, TRUE);
  END IF;
END $$;
