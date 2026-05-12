-- 094: Advance Job Chat — Read receipts
-- เก็บว่าผู้รับอ่านข้อความแล้วหรือยัง

CREATE TABLE IF NOT EXISTS advance_job_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES advance_job_messages(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, reader_id)
);

CREATE INDEX IF NOT EXISTS idx_advance_job_message_reads_message ON advance_job_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_message_reads_reader ON advance_job_message_reads(reader_id);

COMMENT ON TABLE advance_job_message_reads IS 'Read receipts สำหรับ Advance Job Chat';
