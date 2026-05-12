-- 176: Video Feed — ยอดดู (dedup รายวัน), แชร์ (event log), บันทึก (save), และ parent สำหรับตอบกลับคอมเมนต์
-- ออกแบบสำหรับแอปพลิเคชันเอง — ไม่ใช่สำเนาจากบริการภายนอก

ALTER TABLE talent_videos
  ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN talent_videos.view_count IS 'ยอดดูสะสม (นับเมื่อผู้ชมผ่านเงื่อนไข dedup รายวัน)';

-- บันทึกการแชร์แต่ละครั้ง (นับยอดรวม = COUNT)
CREATE TABLE IF NOT EXISTS video_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES talent_videos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_shares_video ON video_shares(video_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_created ON video_shares(created_at DESC);

COMMENT ON TABLE video_shares IS 'เหตุการณ์แชร์คลิป — ใช้สำหรับ analytics และสถิติแชร์';

-- Dedup ยอดดู: อย่างน้อย 1 ครั้งต่อวันต่อคลิปต่อผู้ชม (actor_key = user uuid หรือ visitor id จาก client)
CREATE TABLE IF NOT EXISTS video_view_buckets (
  video_id UUID NOT NULL REFERENCES talent_videos(id) ON DELETE CASCADE,
  actor_key VARCHAR(80) NOT NULL,
  bucket_date DATE NOT NULL,
  PRIMARY KEY (video_id, actor_key, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_video_view_buckets_video ON video_view_buckets(video_id);

COMMENT ON TABLE video_view_buckets IS 'บันทึกว่า actor ชมคลิปในวันนั้นแล้ว — ใช้ก่อนเพิ่ม view_count';

-- บันทึกคลิป (คล้าย bookmark)
CREATE TABLE IF NOT EXISTS video_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES talent_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_video_saves_user ON video_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_video_saves_video ON video_saves(video_id);

COMMENT ON TABLE video_saves IS 'ผู้ใช้บันทึกคลิปไว้ดูภายหลัง';

-- ตอบกลับคอมเมนต์ (1 ระดับ)
ALTER TABLE video_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES video_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_video_comments_parent ON video_comments(parent_id) WHERE parent_id IS NOT NULL;

COMMENT ON COLUMN video_comments.parent_id IS 'ถ้ามี = คอมเมนต์ย่อยตอบกลับ';
