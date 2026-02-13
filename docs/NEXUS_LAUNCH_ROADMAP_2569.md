# Nexus Platform - The Grand Debut

**Target Date:** 1 พฤศจิกายน 2569

---

## Phase 1: Refining the Core & Safety (สัปดาห์ที่ 1-2)

โฟกัส: ปิดจ๊อบ 3 จุด Final Polish และความเสถียร

- **Implement Final Polish:** Refund Ledger 3 ขา, ระบบกัน Race Condition ตอน Release เงิน, GPS Timestamp (5 นาที)
- **Security Hardening:** ตรวจสอบระบบ Rate Limit ทั้งระบบ (Login/OTP) ให้มั่นใจว่าโดนยิงไม่ล่ม
- **Audit Append-only:** ยืนยันว่า SQL Trigger ทำงานถูกต้อง ข้อมูลหลักฐาน GPS/OTP ต้องไม่มีใครแก้ไขได้

### Phase 1 — สถานะดำเนินการแล้ว

- **Final Polish:** Refund เขียน 3 ขา (user_credit, provider_debit, commission_reversed) ใน transaction เดียวกับ balance/job ใน `server.js`; Release ใช้ conditional UPDATE + RETURNING คืน 409 ถ้า already released; Job complete ตรวจ GPS timestamp ไม่เกิน 5 นาที (`GPS_MAX_AGE_MS`).
- **Rate Limit:** Login ใช้ Redis + in-memory fallback (`checkRateLimitMemory`) เมื่อ Redis ล่ม; OTP request (`/api/jobs/:id/request-completion-otp`) จำกัดต่อ job และต่อ IP (5/15min ต่อ job, 20/15min ต่อ IP).
- **Audit Append-only:** ตาราง `audit_log` มี trigger `audit_log_append_only` (BEFORE UPDATE/DELETE → RAISE EXCEPTION); ตาราง `payment_ledger_audit` มี trigger `payment_ledger_audit_append_only` เหมือนกัน (สร้างใน setup-database). รัน `POST /api/admin/setup-database` ให้ครบเพื่อให้ trigger มีผล

---

## Phase 2: Insurance & Financial Integrity (สัปดาห์ที่ 3-4)

โฟกัส: ระบบประกันภัย 60/40 และระบบบัญชีหนี้สิน

- **Insurance Vault:** สร้างระบบแยกกระเป๋าเงินประกันภัย (Liability Account) ออกจากรายได้บริษัท
- **Admin Finance Dashboard:** พัฒนาตัวควบคุม 60/40 ให้แอดมินดูยอดและถอนเงินส่วนบริหารจัดการได้จริง
- **Ledger Integration:** ทดสอบการบันทึกบัญชี 4-5 ขา (รวมขาประกันภัย) เมื่อมีการจ่ายเงิน

### Phase 2 — สถานะดำเนินการแล้ว

- **Insurance Vault:** `GET /api/admin/insurance/vault` คำนวณ total_liability จาก `payment_ledger_audit`, แยก locked_60 และ manageable_40. `GET /api/admin/insurance/summary` และ `POST /api/admin/insurance/withdraw` ใช้ vault (ledger) เป็นแหล่ง 60/40 และขีดจำกัดถอน. Admin UI (InsuranceManager) แสดงยอดจาก Ledger และข้อความ "จาก payment_ledger_audit".
- **Admin Finance Dashboard:** ตัวควบคุม 60/40 ใน InsuranceManager — แสดง Reserve 60% / Manageable 40% และปุ่มถอนส่วน 40% (ขีดจำกัดจาก Ledger).
- **Ledger Integration:** บันทึกบัญชี 4-5 ขาใน process payment (user_debit, provider_net, commission, insurance_liability + insurance_fund_movements). `GET /api/admin/payment-ledger` ให้ Admin ดูรายการ Ledger ล่าสุด (หรือกรอง job_id) เพื่อตรวจ 4-5 ขา.
- **Exam Database:** ตาราง `questions` และ `user_exam_results` ใน setup-database. Seed Module 1 ครบ 55 ข้อใน `backend/seedModule1Questions.js` (จริยธรรม/ความปลอดภัย ป้องกันมิจฉาชีพ). `GET /api/nexus-exam/questions?module=1` อ่านจาก DB. `POST /api/provider-onboarding/submit-exam` ตรวจคะแนนจากตาราง questions.

---

## Phase 3: World-Class UX/UI Transformation (สัปดาห์ที่ 5)

โฟกัส: ปรับโฉม JobDetails และส่วนอื่นๆ ให้ Luxury

- **Luxury UI Implementation:** ปรับหน้า JobDetails (Glassmorphism, High Contrast, Typography ระดับโลก)
- **Insurance UI Selection:** เพิ่มตัวเลือกการซื้อประกันในหน้าจ้างงานให้ดูหรูหราเหมือน Premium
- **Multilingual Check:** ตรวจสอบไฟล์คำแปล (t()) ทั้งหมดให้ดูเป็นทางการและสุภาพ

---

## Phase 4: Final Testing & Compliance (สัปดาห์ที่ 6)

โฟกัส: เตรียมความพร้อมสำหรับ Store และกฎหมาย

- **KYC Re-verify Logic:** ทดสอบระบบแจ้งเตือนเมื่อ KYC ครบกำหนด 1 ปี
- **Privacy Policy Updates:** เขียนนโยบายการจัดการข้อมูล GPS (EXIF Stripping) และข้อมูลประกันภัยให้ชัดเจน
- **Store Submission Prep:** เตรียม Screenshot ที่สวยที่สุด (เน้นหน้า JobDetails Luxury) และวิดีโอพรีเซนต์ระบบ Safety

---

## Phase 5: GO-LIVE (1 พฤศจิกายน 2569)

- **Full System Report:** สรุปยอดผู้ใช้งาน, เงินในคลังประกัน, และสถิติความปลอดภัย
- **Market Launch:** ปล่อยแอปขึ้น Store และเริ่มระบบ Marketing
