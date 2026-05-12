-- Rebrand Module 1 course copy: Nexus → AQOND (matches mobile trainingService.brandCourseText)
UPDATE courses
SET
  title = 'มาตรฐานการบริการและความปลอดภัยของ AQOND',
  description = 'เรียนรู้มาตรฐานการให้บริการและความปลอดภัยที่ AQOND กำหนดให้ Provider ทุกคนต้องผ่านก่อนรับงาน',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'nexus-professional-standards';
