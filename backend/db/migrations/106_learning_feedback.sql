-- AI Correction Loop: เก็บ diff ระหว่างคำแนะนำ AI กับข้อความที่ Admin ส่งจริง
CREATE TABLE IF NOT EXISTS learning_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id VARCHAR(100),
  ai_suggestion TEXT,
  admin_final TEXT,
  edit_distance_ratio NUMERIC(5,4),
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_feedback_created_at ON learning_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_feedback_ticket ON learning_feedback(ticket_id);

COMMENT ON TABLE learning_feedback IS 'Shadow mode: ความต่างระหว่าง AI draft กับข้อความสุดท้ายของ Admin สำหรับปรับปรุง Minnie';
