-- 241: Free marketplace demo course for purchase/enrollment smoke tests

INSERT INTO courses (
  id, title, subtitle, description, category, duration, level, image_url,
  price_thb, original_price_thb, currency, status, is_marketplace, language,
  learning_outcomes, requirements, published_at, total_enrolled, rating_avg, rating_count,
  promo_video_url
) VALUES (
  'aqond-marketplace-free-preview',
  'ทดสอบคอร์สฟรี — ลงทะเบียนและเรียน Preview',
  'คอร์ส 0 บาท สำหรับทดสอบซื้อ/ลงทะเบียน/เรียนต่อบนมือถือ',
  'ใช้คอร์สนี้ทดสอบ flow ซื้อฟรี (auto-enroll), preview lesson, และ progress โดยไม่เสีย wallet',
  'business',
  25,
  'beginner',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200',
  0,
  499,
  'THB',
  'published',
  TRUE,
  'th',
  '["ทดสอบลงทะเบียนคอร์สฟรี","ดูบทเรียน preview ได้ทันที","เริ่มเรียนหลัง enroll โดยไม่เปิด sheet"]'::jsonb,
  '["ต้อง login","เหมาะสำหรับ QA / Apple Review"]'::jsonb,
  NOW(),
  0,
  4.8,
  12,
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
) ON CONFLICT (id) DO UPDATE SET
  price_thb = 0,
  status = 'published',
  is_marketplace = TRUE,
  published_at = COALESCE(courses.published_at, NOW()),
  updated_at = NOW();

WITH pick_instructor AS (
  SELECT id FROM users
  WHERE can_sell_courses = TRUE OR provider_status = 'VERIFIED_PROVIDER'
  ORDER BY created_at NULLS LAST
  LIMIT 1
)
UPDATE courses c
SET instructor_user_id = pick_instructor.id
FROM pick_instructor
WHERE c.id = 'aqond-marketplace-free-preview'
  AND c.instructor_user_id IS NULL;

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
  SELECT 1 FROM course_lessons WHERE course_id = 'aqond-marketplace-free-preview'
);
