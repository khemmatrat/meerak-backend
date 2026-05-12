-- FAQ drafts จาก Minnie (บทสนทนา Support) ก่อน promote เข้า faq_knowledge
CREATE TABLE IF NOT EXISTS knowledge_base_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id VARCHAR(100),
  question TEXT NOT NULL,
  draft_answer TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  status VARCHAR(20) DEFAULT 'draft',
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_drafts_created ON knowledge_base_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_drafts_ticket ON knowledge_base_drafts(ticket_id);

COMMENT ON TABLE knowledge_base_drafts IS 'Auto-drafted FAQ จากตั๋วปิด / ปุ่ม Generate — รอนำเข้าคลังความรู้';
