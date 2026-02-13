# Payment & Job Safety (4 จุดเน้น + Tuning)

เอกสารสรุปการออกแบบความปลอดภัยของการเงินและสถานะงาน ตามที่ชัยแนะนำ

---

## 1. สถานะ Job vs. สถานะ Payment (Synchronization)

### จุดตรวจสอบ
- เมื่อ Job ถูก **markJobAsDone** สถานะ Payment ต้องอยู่ในสถานะ **LOCKED_IN_ESCROW** (ถอนไม่ได้) ทันที
- เงินควรหักจากกระเป๋า Employer ตั้งแต่ตอน **จองงาน/เริ่มงาน** (หรือตอน Accept + ชำระเงิน) ไม่ใช่รอให้งานเสร็จแล้วค่อยหัก — เพื่อประกันว่า Provider จะได้เงินแน่นอนถ้าทำงานจบ

### การ implement ปัจจุบัน
- **POST /api/payments/process** เรียกเมื่อ job มีสถานะ `waiting_for_payment`: หักเงินจาก Employer, เพิ่ม `wallet_pending` ให้ Provider, บันทึก `payment_details` (amount, provider_receive, fee_amount, released_status: 'pending')
- หลัง **markJobAsDone** job เป็น `waiting_for_approval` — เงินยังอยู่ใน escrow (released_status ยังเป็น 'pending') จนกว่า Employer จะอนุมัติแล้วเรียก **release**
- แนะนำ flow: หลัง Provider Accept → ให้ Employer ชำระเงิน (process) เพื่อกันเงินเข้า escrow ก่อน → ค่อยให้ Provider เริ่มงานและ mark done

---

## 2. Circuit Breaker (Dispute Lock) — Double Lock + Admin Bypass

### เงื่อนไขความปลอดภัย
- **Double Lock:** ใน **POST /api/payments/release** นอกจากการเช็กสถานะ Job แล้ว ต้องเช็ก **dispute_id / ตารางการเงิน** ด้วย — ถ้ามี Dispute ที่ยังมีสถานะ **open** ค้างอยู่ ระบบต้อง **Hard-Block** การโอนเงินทุกกรณี
- **Admin Bypass:** เฉพาะ **Admin** เท่านั้นที่มีสิทธิ์ปลดล็อกหลังจาก Resolving เสร็จ (เรียก release หลัง dispute ถูก resolve)

### การ implement
- **ตาราง job_disputes** (migration 016): เก็บ `job_id`, `status` ('open' | 'resolved'), `resolved_by`, `resolved_at`
- **from-dispute:** อัปเดต `job.payment_details.dispute_status = 'pending'` และ **INSERT INTO job_disputes (job_id, status) VALUES ($1, 'open')**
- **payments/release:**
  1. ถ้า `job.payment_details.dispute_status === 'pending'` → 403
  2. **SELECT FROM job_disputes WHERE job_id = $1 AND status = 'open'** — ถ้ามีแถว → 403 (Double Lock)
  3. ถ้า `dispute_status === 'resolved'` → ต้องส่ง **Admin JWT** (Bearer) ถึงจะปล่อยได้
- **PATCH /api/admin/support/tickets/:id** เมื่อปิดตั๋ว Dispute (RESOLVED/CLOSED): อัปเดต `job_disputes` เป็น resolved และ `job.payment_details.dispute_status = 'resolved'` + บันทึก **audit DISPUTE_RESOLVED** พร้อม admin_id

---

## 3. Billing และค่าธรรมเนียม (Ledger 3 ขา)

### จุดตรวจสอบ
- ตอนเรียก **calculate-billing** ก่อนชำระเงิน ระบบต้องคำนวณ **Commission (Platform Fee)** แยกจากค่าแรง Provider ให้ชัดเจน
- ในตาราง Ledger ควรบันทึก **3 ขาเสมอ:**
  1. เงินออกจาก User (Full Amount)
  2. เงินเข้า Escrow (Provider Net)
  3. เงินเข้าบริษัท (Commission Fee)

### การ implement
- **POST /api/jobs/categories/:category/calculate-billing:** คืนค่า `billing` และ `breakdown.provider_net`, `breakdown.commission` (และ service_fee_amount)
- **POST /api/payments/process:** หลัง COMMIT แล้ว INSERT ลง **payment_ledger_audit** 3 แถว:
  - `event_type: 'payment_created'`, amount = full, metadata.leg = 'user_debit'
  - `event_type: 'escrow_held'`, amount = provider_receive, metadata.leg = 'provider_net'
  - `event_type: 'escrow_held'`, amount = fee_amount, metadata.leg = 'commission'
- การแยกแบบนี้ทำให้ตอนทำ Refund ตัดสินใจได้ง่ายว่าจะคืนค่าธรรมเนียมด้วยหรือไม่

### Refund Flow (Reverse Ledger 3 ขา)
- **POST /api/admin/payments/refund** (Admin only): body `{ jobId, includeCommission?: boolean }`
- รองรับทั้งกรณีเงินยังอยู่ใน escrow (`released_status = 'pending'`) และปล่อยแล้ว (`released_status = 'released'`)
- เมื่อ Refund: INSERT reverse entries ลง **payment_ledger_audit** ครบ 3 ขา — `payment_refunded` (user_credit), `escrow_refunded` (provider_debit), `escrow_refunded` (commission_reversed ถ้า includeCommission) — เพื่อให้ยอด Revenue ของบริษัทไม่ค้างเกินจริง
- บันทึก **audit_log** action `PAYMENT_REFUNDED` พร้อม admin_id และยอดที่คืน

---

## 4. ความปลอดภัยหลักฐาน (GPS/OTP Data Integrity)

### Tamper-proof Logs
- ข้อมูล GPS และ OTP ที่บันทึกใน **audit_log** ต้องเป็นแบบ **Append-only** (ห้ามแก้ไข/ห้ามลบ) แม้แต่แอดมินก็แก้ไม่ได้ — ใช้เป็นหลักฐานในชั้นศาลหรือการไกล่เกลี่ย
- **Migration 016:** สร้าง trigger บน `audit_log` ห้าม UPDATE และ DELETE

### Verification Logic
- การตรวจ **ระยะทาง (Distance)** ต้องคำนวณบน **Server-side เท่านั้น** — ห้ามเชื่อเลขระยะทางที่ Frontend ส่งมา (แก้ไขได้ง่าย)
- **POST /api/jobs/:id/complete:** ใช้ฟังก์ชัน **haversineMeters(lat, lng, job_lat, job_lng)** บน server เพื่อตรวจว่า provider อยู่ภายในระยะที่กำหนด (เช่น 500m)
- **GPS Timestamp:** ต้องส่ง `providerLocation.timestamp` (ISO หรือ ms) มา และ Server เช็กว่าพิกัดมีอายุไม่เกิน **5 นาที** — ถ้าไม่มี timestamp หรือเก่ากว่า 5 นาที จะคืน 400 `gps_timestamp_invalid` เพื่อป้องกันการส่งพิกัดเก่าที่แคปไว้มาหลอกระบบ

---

## 5. สรุป Tuning (PaymentService & JobController)

### Strict State Machine
- ป้องกันการเปลี่ยนสถานะ Job ข้ามขั้น (เช่น จาก Pending ไป Done โดยไม่มีการ Accept)
- **POST /api/jobs/:id/complete:** อนุญาตเฉพาะเมื่อ `job.status` เป็น `accepted` หรือ `in_progress` เท่านั้น — คืน 400 พร้อมข้อความชัดเจนถ้าไม่ตรง

### Escrow Safeguard
- ทุกครั้งที่ **releasePayment** ต้องไม่มี Dispute ค้างอยู่ (เช็กทั้ง job และ job_disputes)
- ตรวจสอบยอดเงินที่ปล่อยตรงกับที่ Job ระบุ (`payment_details.provider_receive`) และตรวจว่า `provider_receive` เป็นตัวเลขที่ถูกต้อง
- **Race Condition (Double Release):** ใน **POST /api/payments/release** ใช้ **conditional UPDATE** บน `jobs` — อัปเดต `released_status = 'released'` เฉพาะเมื่อ `payment_details->>'released_status' = 'pending'` และใช้ `RETURNING id` ถ้าไม่มีแถวถูกอัปเดต (เงินถูกปล่อยไปแล้ว) จะ rollback และคืน **409** `already_released` เพื่อป้องกัน Double Spending

### Audit Integration
- เมื่อเกิด **Refund** หรือ **Dispute Resolved** ให้บันทึกยอดเงินเดิมและยอดที่จัดการใหม่ลง **audit_log** พร้อม **admin_id** ทุกครั้ง
- **PAYMENT_RELEASED:** บันทึกหลัง release สำเร็จ (entity: jobs, new: amount, providerId, released_at)
- **DISPUTE_RESOLVED:** บันทึกเมื่อ Admin ปิดตั๋ว Dispute (entity: job_disputes, new: jobId, status, resolved_by)

---

## ไฟล์ที่เกี่ยวข้อง

| เรื่อง | ไฟล์ |
|--------|------|
| Migration audit append-only + job_disputes | `backend/db/migrations/016_audit_append_only_and_job_disputes.sql` |
| Payment process (3-leg ledger) | `backend/server.js` (POST /api/payments/process) |
| Payment release (Double Lock, Admin) | `backend/server.js` (POST /api/payments/release) |
| from-dispute (insert job_disputes) | `backend/server.js` (POST /api/support/tickets/from-dispute) |
| Admin resolve dispute + audit | `backend/server.js` (PATCH /api/admin/support/tickets/:id) |
| Job complete (state machine, GPS server-side, GPS timestamp ≤5min) | `backend/server.js` (POST /api/jobs/:id/complete) |
| calculate-billing (commission + provider_net) | `backend/server.js` (POST /api/jobs/categories/:category/calculate-billing) |
| Admin Refund (reverse ledger 3 ขา) | `backend/server.js` (POST /api/admin/payments/refund) |
| Release (conditional UPDATE ป้องกัน double release) | `backend/server.js` (POST /api/payments/release) |
