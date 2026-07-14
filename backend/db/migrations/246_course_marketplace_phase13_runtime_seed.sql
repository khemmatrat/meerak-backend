-- 246: Phase 13 — runtime seed polish (idempotent; do not edit 235/241 if already applied)

-- Ensure paid demo course is publish-ready with instructor + social proof for rails/badges
WITH pick_instructor AS (
  SELECT COALESCE(
    (SELECT instructor_user_id FROM courses WHERE id = 'aqond-service-business-starter' AND instructor_user_id IS NOT NULL LIMIT 1),
    (SELECT user_id FROM course_instructor_profiles ORDER BY created_at NULLS LAST LIMIT 1),
    (SELECT id FROM users WHERE can_sell_courses = TRUE OR provider_status = 'VERIFIED_PROVIDER' ORDER BY created_at NULLS LAST LIMIT 1)
  ) AS user_id
)
UPDATE courses c
SET
  instructor_user_id = COALESCE(c.instructor_user_id, pick_instructor.user_id),
  promo_video_url = COALESCE(NULLIF(TRIM(c.promo_video_url), ''), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  status = 'published',
  is_marketplace = TRUE,
  published_at = COALESCE(c.published_at, NOW()),
  total_enrolled = GREATEST(COALESCE(c.total_enrolled, 0), 12),
  rating_avg = GREATEST(COALESCE(c.rating_avg, 0), 4.7),
  rating_count = GREATEST(COALESCE(c.rating_count, 0), 8),
  updated_at = NOW()
FROM pick_instructor
WHERE c.id = 'aqond-service-business-starter';

UPDATE courses
SET
  status = 'published',
  is_marketplace = TRUE,
  published_at = COALESCE(published_at, NOW()),
  total_enrolled = GREATEST(COALESCE(total_enrolled, 0), 8),
  rating_avg = GREATEST(COALESCE(rating_avg, 0), 4.8),
  rating_count = GREATEST(COALESCE(rating_count, 0), 12),
  updated_at = NOW()
WHERE id = 'aqond-marketplace-free-preview';

INSERT INTO course_instructor_profiles (user_id, headline, bio, payout_eligible)
SELECT DISTINCT ON (c.instructor_user_id) c.instructor_user_id, 'AQOND Academy', 'ทีมเนื้อหา AQOND สำหรับคอร์สเริ่มต้น', FALSE
FROM courses c
WHERE c.id IN ('aqond-service-business-starter', 'aqond-marketplace-free-preview')
  AND c.instructor_user_id IS NOT NULL
ORDER BY c.instructor_user_id, c.id
ON CONFLICT (user_id) DO UPDATE
SET headline = COALESCE(course_instructor_profiles.headline, EXCLUDED.headline),
    bio = COALESCE(course_instructor_profiles.bio, EXCLUDED.bio),
    updated_at = NOW();

-- Paid demo: section 2 for post-purchase learning path
INSERT INTO course_sections (course_id, title, sort_order)
SELECT 'aqond-service-business-starter', 'ปิดการขายและสร้างลูกค้าซ้ำ', 2
WHERE EXISTS (SELECT 1 FROM courses WHERE id = 'aqond-service-business-starter')
  AND NOT EXISTS (
    SELECT 1 FROM course_sections
    WHERE course_id = 'aqond-service-business-starter' AND title = 'ปิดการขายและสร้างลูกค้าซ้ำ'
  );

WITH sec AS (
  SELECT id FROM course_sections
  WHERE course_id = 'aqond-service-business-starter' AND title = 'ปิดการขายและสร้างลูกค้าซ้ำ'
  ORDER BY sort_order
  LIMIT 1
)
INSERT INTO course_lessons (
  course_id, section_id, title, sort_order, step_type, video_url, text_content,
  duration_min, quiz_pass_percent, is_preview, resource_urls
)
SELECT
  'aqond-service-business-starter',
  sec.id,
  v.title,
  v.sort_order,
  v.step_type,
  v.video_url,
  v.text_content,
  v.duration_min,
  80,
  v.is_preview,
  '[]'::jsonb
FROM sec
CROSS JOIN (
  VALUES
    (
      'สคริปต์ปิดการขายหลังเสนอราคา',
      1,
      'text',
      '',
      'แม่แบบข้อความติดตามลูกค้า การยืนยันนัดหมาย และการสรุปขอบเขตงานก่อนเริ่ม',
      10,
      FALSE
    ),
    (
      'วัดผลและขอรีวิวอย่างมืออาชีพ',
      2,
      'video',
      '',
      'วิธีขอรีวิวหลังจบงานและเปลี่ยนลูกค้าครั้งแรกเป็นลูกค้าประจำ',
      14,
      FALSE
    )
) AS v(title, sort_order, step_type, video_url, text_content, duration_min, is_preview)
WHERE NOT EXISTS (
  SELECT 1 FROM course_lessons l
  WHERE l.course_id = 'aqond-service-business-starter' AND l.title = v.title
);

-- Free demo: ensure section + preview lesson exist (241 may be partial on some envs)
INSERT INTO course_sections (course_id, title, sort_order)
SELECT 'aqond-marketplace-free-preview', 'เริ่มต้นทดสอบฟรี', 1
WHERE EXISTS (SELECT 1 FROM courses WHERE id = 'aqond-marketplace-free-preview')
  AND NOT EXISTS (
    SELECT 1 FROM course_sections WHERE course_id = 'aqond-marketplace-free-preview'
  );

WITH sec AS (
  SELECT id FROM course_sections
  WHERE course_id = 'aqond-marketplace-free-preview'
  ORDER BY sort_order
  LIMIT 1
)
INSERT INTO course_lessons (
  course_id, section_id, title, sort_order, step_type, video_url, text_content,
  duration_min, quiz_pass_percent, is_preview, resource_urls
)
SELECT
  'aqond-marketplace-free-preview',
  sec.id,
  v.title,
  v.sort_order,
  v.step_type,
  v.video_url,
  v.text_content,
  v.duration_min,
  80,
  v.is_preview,
  '[]'::jsonb
FROM sec
CROSS JOIN (
  VALUES
    (
      'Preview: ยินดีต้อนรับสู่คอร์สฟรี',
      1,
      'video',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'บทเรียน preview ฟรี — ทดสอบเล่นวิดีโอก่อนลงทะเบียน',
      8,
      TRUE
    ),
    (
      'หลังลงทะเบียน: ขั้นตอนถัดไป',
      2,
      'text',
      '',
      'เนื้อหานี้ปลดล็อกหลัง enroll — ใช้ทดสอบ progress',
      5,
      FALSE
    )
) AS v(title, sort_order, step_type, video_url, text_content, duration_min, is_preview)
WHERE NOT EXISTS (
  SELECT 1 FROM course_lessons l
  WHERE l.course_id = 'aqond-marketplace-free-preview' AND l.title = v.title
);
