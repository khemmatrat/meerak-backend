-- 087: Talent Video Upload Jobs — ติดตามสถานะการ process วิดีโอ (watermark + end card)
CREATE TABLE IF NOT EXISTS talent_video_upload_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  video_url TEXT,                          -- เมื่อ completed
  thumbnail_url TEXT,
  title TEXT,
  description TEXT,
  error_message TEXT,                     -- เมื่อ failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_talent_video_jobs_talent ON talent_video_upload_jobs(talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_video_jobs_status ON talent_video_upload_jobs(status);
CREATE INDEX IF NOT EXISTS idx_talent_video_jobs_created ON talent_video_upload_jobs(created_at DESC);

COMMENT ON TABLE talent_video_upload_jobs IS 'Queue jobs สำหรับ video watermark processing (Bull job_id เก็บใน metadata)';
