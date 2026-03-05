-- =================================================================================
-- 048: Talent Category Rules — เพิ่ม category จริงให้สอดคล้องกับ Talent Category Rules
-- Rule groups: Beauty & Wellness, Tech & IT, Event & Entertainment, Professional Services
-- =================================================================================

-- 1. ตาราง talent_category_rule_groups — อ้างอิงจาก Talent Category Rules
CREATE TABLE IF NOT EXISTS talent_category_rule_groups (
  id SERIAL PRIMARY KEY,
  category_key VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  display_name_th VARCHAR(255),
  rule_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE talent_category_rule_groups IS 'หมวด Talent ตาม Talent Category Rules — ใช้ map กับ job category และ expert_category';

INSERT INTO talent_category_rule_groups (category_key, display_name, display_name_th, rule_summary) VALUES
('beauty_wellness', 'Beauty & Wellness', 'ความงามและสุขภาพ', 'ต้องมีใบอนุญาตหรือหลักฐานความสามารถตามกฎหมาย (ถ้ากฎหมายกำหนด) ห้ามให้บริการที่ต้องมีใบประกอบโรคศิลปะโดยไม่มีใบอนุญาต'),
('tech_it', 'Tech & IT', 'เทคโนโลยีและไอที', 'งานที่เกี่ยวข้องกับข้อมูลส่วนบุคคลต้องปฏิบัติตาม PDPA และนโยบายความลับของ Client'),
('event_entertainment', 'Event & Entertainment', 'จัดงานและความบันเทิง', 'งานกลางคืนหรืองานที่ต้องพบปะ Client ต้องปฏิบัติตาม Safety & Night Work Policy'),
('professional_services', 'Professional Services', 'บริการวิชาชีพ', 'งานที่ต้องมีใบอนุญาตวิชาชีพ (เช่น กฎหมาย บัญชี สถาปัตยกรรม) ต้องแสดงหลักฐานการขึ้นทะเบียน')
ON CONFLICT (category_key) DO NOTHING;

-- 2. เพิ่ม categories ใน insurance_rate_by_category ให้สอดคล้อง
INSERT INTO insurance_rate_by_category (category, rate_percent, display_name, updated_at) VALUES
('Beauty & Wellness', 10, 'ความงามและสุขภาพ', NOW()),
('Tech & IT', 10, 'เทคโนโลยีและไอที', NOW()),
('Event & Entertainment', 12, 'จัดงานและความบันเทิง', NOW()),
('Professional Services', 15, 'บริการวิชาชีพ', NOW()),
('beauty_wellness', 10, 'ความงามและสุขภาพ', NOW()),
('tech_it', 10, 'เทคโนโลยีและไอที', NOW()),
('event_entertainment', 12, 'จัดงานและความบันเทิง', NOW()),
('professional_services', 15, 'บริการวิชาชีพ', NOW())
ON CONFLICT (category) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW();

-- 3. ตาราง mapping: job_category -> rule_group (สำหรับ category ที่มีอยู่แล้ว)
CREATE TABLE IF NOT EXISTS talent_category_mapping (
  job_category VARCHAR(100) PRIMARY KEY,
  rule_group_key VARCHAR(100) NOT NULL REFERENCES talent_category_rule_groups(category_key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE talent_category_mapping IS 'Map job category ที่มีอยู่แล้ว ไปยัง Talent Category Rule group';

INSERT INTO talent_category_mapping (job_category, rule_group_key) VALUES
('Beauty', 'beauty_wellness'),
('Massage', 'beauty_wellness'),
('Trainer', 'beauty_wellness'),
('IT Support', 'tech_it'),
('Photography', 'event_entertainment'),
('Design', 'event_entertainment'),
('Event', 'event_entertainment'),
('Accounting', 'professional_services'),
('Legal', 'professional_services'),
('Medical', 'professional_services'),
('Chef', 'professional_services'),
('Catering', 'event_entertainment'),
('Cooking', 'professional_services')
ON CONFLICT (job_category) DO UPDATE SET rule_group_key = EXCLUDED.rule_group_key;
