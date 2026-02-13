# Payment & Job Safety — สรุป 4 จุดเน้น + การ implement

เอกสารนี้อ้างอิงจากข้อเสนอของชัย เกี่ยวกับ Job vs Payment sync, Circuit Breaker, Ledger 3 ขา, และ Data Integrity

---

## 1. สถานะ Job vs. สถานะ Payment (Synchronization)

**จุดตรวจสอบ:** เมื่อ Job ถูก markJobAsDone สถานะ Payment ต้องเปลี่ยนเป็น LOCKED_IN_ESCROW (ถอนไม่ได้) ทันที

**ข้อแนะนำ:** เงินควรหักจากกระเป๋า Employer ตั้งแต่ตอนกด "จองงาน/เริ่มงาน" ไม่ใช่รอให้งานเสร็จแล้วค่อยหัก เพื่อประกันว่า Provider จะได้เงินแน่นอนถ้าทำงานจบ

**สถานะ implement:**
- Backend `POST /api/jobs/:id/complete` อัปเดต job เป็น `waiting_for_approval` (งานเสร็จรออนุมัติ)
- การกันเงิน (escrow) ปัจจุบันทำที่ `POST /api/payments/process` เมื่อ Employer ชำระเงิน (status `waiting_for_payment` → ชำระแล้ว)
- **แนะนำขั้นถัดไป:** ย้าย flow ให้กันเงินตอน Provider กด Accept (หรือตอน "เริ่มงาน") แล้วเก็บใน escrow จนงาน Done + อนุมัติ แล้วค่อย release

---

## 2. Circuit Breaker (Dispute Lock) — Double Lock + Admin Bypass

**Double Lock:** ใน `POST /api/payments/release` นอกจากการเช็กสถานะ Job แล้ว ต้องเช็ก `dispute_id` / สถานะ Dispute ในตารางการเงินด้วย ถ้ามี Dispute ที่ยัง open อยู่ ระบบต้อง **Hard-Block** การโอนเงินทุกกรณี

**Admin Bypass:** เฉพาะ Admin เท่านั้นที่ปลดล็อกได้หลังจาก Resolve Dispute เสร็จ

**สถานะ implement:**
- **Job:** เช็ก `job.dispute_status` / `payment_details.dispute_status === 'pending'` → คืน 403
- **ตาราง job_disputes:** Migration `016_audit_append_only_and_job_disputes.sql` สร้างตาราง `job_disputes (job_id, status open|resolved)`
- เมื่อยื่น Dispute (`POST /api/support/tickets/from-dispute`) → อัปเดต job + **INSERT job_disputes (status='open')**
- ใน `payments/release` → **เช็ก `SELECT FROM job_disputes WHERE job_id = ? AND status = 'open'`** ถ้ามีแถว คืน 403
- เมื่อ Admin ปิดตั๋ว Dispute (`PATCH /api/admin/support/tickets/:id` เป็น RESOLVED/CLOSED) → อัปเดต `job_disputes` เป็น `resolved` และ `job.payment_details.dispute_status = 'resolved'`
- **หลัง dispute_status = 'resolved'** เฉพาะคำขอที่ส่ง **Authorization: Bearer &lt;admin JWT&gt;** เท่านั้นที่ปล่อยเงินได้ ไม่ใช่ user ทั่วไป

---

## 3. การคำนวณ Billing และ Ledger 3 ขา

**จุดตรวจสอบ:** ตอนเรียก calculate-billing ก่อนชำระเงิน ระบบต้องคำนวณ Commission (Platform Fee) แยกจากค่าแรง Provider ให้ชัดเจน

**ใน Ledger บันทึก 3 ขาเสมอ:**
1. เงินออกจาก User (Full Amount)
2. เงินเข้า Escrow (Provider Net)
3. เงินเข้าบริษัท (Commission Fee)

**สถานะ implement:**
- `POST /api/jobs/categories/:category/calculate-billing` คืนค่า `breakdown.provider_net` และ `breakdown.commission` แยกชัด
- ใน `POST /api/payments/process` หลัง COMMIT แล้ว **INSERT 3 แถวลง `payment_ledger_audit`:**
  - ขา 1: `event_type = 'payment_created'`, จำนวนเต็ม (user debit)
  - ขา 2: `event_type = 'escrow_held'`, จำนวน provider_receive (Provider Net)
  - ขา 3: `event_type = 'escrow_held'`, จำนวน fee_amount (Commission), metadata.leg = 'commission'

การแยกแบบนี้ทำให้ตอนทำ Refund ตัดสินใจได้ง่ายว่าจะคืนค่าธรรมเนียมด้วยหรือไม่

---

## 4. ความปลอดภัยของหลักฐาน (GPS/OTP Data Integrity)

**Tamper-proof Logs:** ข้อมูล GPS และ OTP ใน `audit_log` ต้องเป็น **Append-only** (ห้ามแก้ไข/ห้ามลบ แม้แต่แอดมิน) เพื่อใช้เป็นหลักฐานในชั้นศาลหรือการไกล่เกลี่ย

**Verification Logic:** การตรวจ GPS (ระยะห่าง) ต้องคำนวณ **บน Server เท่านั้น** ห้ามเชื่อเลขระยะทางที่ Frontend ส่งมา

**สถานะ implement:**
- **audit_log append-only:** Migration 016 สร้าง trigger ห้าม UPDATE/DELETE บน `audit_log`
- **GPS:** ใน `POST /api/jobs/:id/complete` ระยะทางคำนวณด้วย `haversineMeters()` บน Server จาก `providerLocation.lat/lng` กับ `job.location` เท่านั้น ไม่รับค่า distance จาก client

---

## สรุป Prompt ที่ให้ Cursor AI ทำเพิ่ม (Payment & Job Tuning)

- **Strict State Machine:** ป้องกันการเปลี่ยนสถานะ Job ข้ามขั้น (เช่น จาก Pending ไป Done โดยไม่มีการ Accept) — ใน `complete` รับเฉพาะ status `accepted` / `in_progress` เท่านั้น
- **Escrow Safeguard:** ทุกครั้งที่ `releasePayment` ต้อง (1) ไม่มี Dispute ค้าง (เช็กทั้ง job และ job_disputes) (2) ตรวจสอบยอดเงินที่ปล่อยตรงกับที่ Job ระบุ (provider_receive)
- **Audit Integration:** เมื่อเกิด Refund หรือ Dispute ให้บันทึกยอดเงินเดิมและยอดที่จัดการใหม่ลง `audit_log` พร้อม `admin_id` — ตอน release มีการเรียก `auditService.log(PAYMENT_RELEASED, ...)` แล้ว

---

## ไฟล์ที่เกี่ยวข้อง

| เรื่อง | ไฟล์ |
|--------|------|
| Migration audit append-only + job_disputes | `backend/db/migrations/016_audit_append_only_and_job_disputes.sql` |
| Payment release (Double Lock, Admin, Escrow check) | `backend/server.js` — `POST /api/payments/release` |
| from-dispute → job + job_disputes | `backend/server.js` — `POST /api/support/tickets/from-dispute` |
| Admin resolve dispute → job_disputes + job | `backend/server.js` — `PATCH /api/admin/support/tickets/:id` |
| Ledger 3 ขา | `backend/server.js` — `POST /api/payments/process` (หลัง COMMIT) |
| calculate-billing provider_net + commission | `backend/server.js` — `POST /api/jobs/categories/:category/calculate-billing` |
| Audit on release | `backend/server.js` — ใน `payments/release` หลัง COMMIT |
