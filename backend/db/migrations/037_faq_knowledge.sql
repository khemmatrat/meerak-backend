-- =================================================================================
-- 037: FAQ Knowledge Base — Learning System สำหรับ Support Chat
-- =================================================================================
-- เก็บ question + best_answer ที่ Admin บันทึก เพื่อให้ AI นำไปใช้ (RAG)
-- =================================================================================

CREATE TABLE IF NOT EXISTS faq_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  best_answer TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  ticket_id VARCHAR(100),
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_knowledge_category ON faq_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_faq_knowledge_created_at ON faq_knowledge(created_at DESC);

-- Full-text search (optional — ใช้ keyword match ก่อน)
-- CREATE INDEX IF NOT EXISTS idx_faq_knowledge_question_gin ON faq_knowledge USING gin(to_tsvector('simple', question));

COMMENT ON TABLE faq_knowledge IS 'Learning KB: คำถาม + คำตอบที่ดีที่สุดจาก Admin สำหรับ RAG ใน Support Chat';
