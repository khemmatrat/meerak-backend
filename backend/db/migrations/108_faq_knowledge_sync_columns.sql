-- =================================================================================
-- 108: faq_knowledge — เติมคอลัมน์ให้ตารางเก่า (CREATE TABLE IF NOT EXISTS ไม่เพิ่มคอลัมน์ใหม่)
-- แก้ INSERT จาก promote / save-best-answer ที่ล้มเมื่อคอลัมน์หายไป
-- =================================================================================

ALTER TABLE faq_knowledge ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general';
ALTER TABLE faq_knowledge ADD COLUMN IF NOT EXISTS ticket_id VARCHAR(100);
ALTER TABLE faq_knowledge ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE faq_knowledge ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE faq_knowledge ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
