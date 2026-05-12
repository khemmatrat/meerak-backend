-- 100: Saved Jobs Notifications — แจ้งเตือนเมื่องานที่บันทึกมีผู้สนใจเพิ่มหรือใกล้ปิด
ALTER TABLE saved_advance_jobs ADD COLUMN IF NOT EXISTS last_applicant_count INTEGER DEFAULT 0;
ALTER TABLE saved_advance_jobs ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;
COMMENT ON COLUMN saved_advance_jobs.last_applicant_count IS 'จำนวนผู้สนใจเมื่อแจ้งเตือนล่าสุด';
COMMENT ON COLUMN saved_advance_jobs.last_notified_at IS 'เวลาที่แจ้งเตือนล่าสุด';
