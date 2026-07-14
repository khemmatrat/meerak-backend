-- 236: Course Marketplace runtime polish
-- Add runnable post-235 seed data and indexes without modifying the already-applied 235 migration.

CREATE INDEX IF NOT EXISTS idx_course_purchase_orders_user_created
  ON course_purchase_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_purchase_orders_course_created
  ON course_purchase_orders(course_id, created_at DESC);

WITH target_section AS (
  SELECT id
  FROM course_sections
  WHERE course_id = 'aqond-service-business-starter'
    AND title = 'เริ่มต้นขายบริการให้ดูมืออาชีพ'
  ORDER BY sort_order, created_at
  LIMIT 1
),
created_section AS (
  INSERT INTO course_sections (course_id, title, sort_order)
  SELECT 'aqond-service-business-starter', 'เริ่มต้นขายบริการให้ดูมืออาชีพ', 1
  WHERE EXISTS (SELECT 1 FROM courses WHERE id = 'aqond-service-business-starter')
    AND NOT EXISTS (SELECT 1 FROM target_section)
  RETURNING id
),
section_pick AS (
  SELECT id FROM target_section
  UNION ALL
  SELECT id FROM created_section
  LIMIT 1
)
INSERT INTO course_lessons (
  course_id, section_id, title, sort_order, step_type, video_url, text_content,
  duration_min, quiz_pass_percent, is_preview, resource_urls
)
SELECT
  'aqond-service-business-starter',
  section_pick.id,
  seed.title,
  seed.sort_order,
  seed.step_type,
  seed.video_url,
  seed.text_content,
  seed.duration_min,
  80,
  seed.is_preview,
  '[]'::jsonb
FROM section_pick
CROSS JOIN (
  VALUES
    (
      'ดูตัวอย่าง: ตั้งโปรไฟล์ให้ลูกค้าเชื่อถือ',
      1,
      'video',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'บทเรียนตัวอย่างสำหรับดูประสบการณ์ก่อนซื้อจริง ครอบคลุมการเขียนโปรไฟล์ ราคาเริ่มต้น และหลักฐานความน่าเชื่อถือ',
      12,
      TRUE
    ),
    (
      'ออกแบบแพ็กเกจบริการที่ขายง่าย',
      2,
      'video',
      '',
      'เรียนรู้การแปลงทักษะบริการเป็นแพ็กเกจราคา ช่วยให้ลูกค้าตัดสินใจเร็วขึ้นและลดการต่อรอง',
      18,
      FALSE
    ),
    (
      'ปิดงานและขอรีวิวหลังจบงาน',
      3,
      'text',
      '',
      'สคริปต์สื่อสารหลังจบงาน วิธีขอรีวิว และการเปลี่ยนลูกค้าครั้งแรกเป็นลูกค้าซ้ำ',
      15,
      FALSE
    )
) AS seed(title, sort_order, step_type, video_url, text_content, duration_min, is_preview)
WHERE NOT EXISTS (
  SELECT 1
  FROM course_lessons l
  WHERE l.course_id = 'aqond-service-business-starter'
    AND l.title = seed.title
);
