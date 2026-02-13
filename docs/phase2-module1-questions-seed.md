# Phase 2: Module 1 Question Seed (55 ข้อ)

ใช้สำหรับ INSERT ลงตาราง `questions` (module=1). รูปแบบ: id, question_text, options (JSONB), correct_option_id, sort_order.

## ตัวอย่างโครงสร้าง 1 ข้อ

```sql
INSERT INTO questions (id, module, question_text, options, correct_option_id, sort_order)
VALUES (
  'm1-q1',
  1,
  'ลูกค้าขอให้โอนเงินนอกแอปเพื่อ "จองงาน" ล่วงหน้า คุณควรทำอย่างไร?',
  '[{"id":"a","text":"โอนให้เพื่อความสะดวก"},{"id":"b","text":"ปฏิเสธและแนะนำให้ชำระผ่านแพลตฟอร์มเท่านั้น"},{"id":"c","text":"รับเงินสดแทน"},{"id":"d","text":"บอกให้โอนครึ่งหนึ่งก่อน"}]'::jsonb,
  'b',
  1
) ON CONFLICT (id) DO NOTHING;
```

ไฟล์ seed เต็ม 55 ข้อจะถูกเพิ่มใน server.js เป็น array และรันใน setup-database.
