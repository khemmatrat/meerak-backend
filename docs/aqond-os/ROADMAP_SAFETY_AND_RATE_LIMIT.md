# Roadmap: Rate Limit, KYC Re-Verify, Job Complete + OTP/GPS

เอกสารนี้เป็นแผนการแก้ไขและลำดับการ implement ตามที่ระบุใน WORKFLOW_FLOWCHART.md (Safety Flow + Technical)

---

## 1. สรุปภาพรวม

| หัวข้อ | Backend | Frontend | สถานะ |
|--------|---------|----------|--------|
| **1. Rate limiting** | Redis rate limit ใส่ Login + OTP | แสดงข้อความ 429 / Retry-After | ✅ ตาม roadmap |
| **2. KYC Re-Verify** | คอลัมน์ + API re-verify, สถานะครบปี/เปลี่ยนบัญชี | หน้า KYC แจ้ง re-verify + ฟอร์ม | ✅ ตาม roadmap |
| **3. Job complete + OTP/GPS** | API complete รับ OTP/GPS, ตรวจก่อนเปลี่ยน Done | งาน Physical: ขอ OTP หรือตรวจ GPS | ✅ ตาม roadmap |

### สถานะการ implement (ทำต่อตาม roadmap แล้ว)
- **Backend:** Redis rate limit (login), `sendRateLimitResponse`, Circuit Breaker (payment release เมื่อ dispute), Audit (KYC_STATUS_CHANGED, JOB_COMPLETE_OTP_VERIFIED, JOB_COMPLETE_GPS_VERIFIED), POST `/api/jobs/:id/complete` + `/request-completion-otp`, KYC re-verify (GET status + POST re-verify), EXIF strip สำหรับ KYC upload (`forKyc`/`?for=kyc`), from-dispute อัปเดต `payment_details.dispute_status = pending`
- **Frontend:** api.ts interceptor 429 + `retry_after`, Login Smart Retry (เลขนับถอยหลัง + ติดต่อ Support / ลืมรหัสผ่าน), mockApi.markJobAsDone ส่ง `userId` + `otpCode`, JobDetails ช่อง OTP งาน physical, Profile แบนเนอร์ Re-Verify + reVerifyKYC

---

## 2. Rate Limiting (Redis)

### 2.1 เป้าหมาย
- ป้องกัน Brute Force ที่หน้า Login (1.1)
- ป้องกันการยิง API ส่ง OTP ซ้ำๆ (เมื่อมี backend OTP)

### 2.2 Backend
- **ที่อยู่:** `backend/server.js`
- **การทำ:**
  - สร้าง helper ใช้ Redis นับจำนวนครั้งต่อ key (เช่น `ratelimit:login:${phone}`, `ratelimit:login:ip:${ip}`).
  - กำหนด: Login อย่างมาก 5 ครั้ง / 15 นาที ต่อ phone และ 10 ครั้ง / 15 นาที ต่อ IP.
  - ก่อนทำ logic ล็อกอินใน `POST /api/auth/login` เรียก helper; ถ้าเกินให้ตอบ 429 พร้อม `Retry-After`.
  - (ถ้ามี) ใส่ rate limit ให้ endpoint ส่ง OTP ด้วย (เช่น 3 ครั้ง / ชั่วโมง ต่อเบอร์).
- **ทางเลือก:** ใช้ package `rate-limit-redis` หรือเขียนนับด้วย `INCR`/`EXPIRE` เองใน Redis.

### 2.3 Frontend
- **ที่อยู่:** `pages/Login.tsx`, (ถ้ามี) หน้า/ฟังก์ชันที่เรียกส่ง OTP
- **การทำ:**
  - จับ response 429 จาก login (และ OTP ถ้ามี).
  - แสดงข้อความว่า "ลองใหม่อีกครั้งใน X วินาที" โดยใช้ค่า `Retry-After` จาก header หรือ body.

---

## 3. KYC Re-Verify

### 3.1 เป้าหมาย
- Re-verify ทุก 1 ปี
- Re-verify เมื่อเปลี่ยนข้อมูลสำคัญ (เช่น บัญชีธนาคาร)

### 3.2 Backend
- **ที่อยู่:** `backend/server.js`, DB migrations
- **การทำ:**
  - **Migration:** เพิ่มคอลัมน์ใน `users` หรือตาราง KYC (แล้วแต่ schema ปัจจุบัน):
    - `kyc_verified_at` (timestamp)
    - `kyc_next_reverify_at` (timestamp, ครบ 1 ปีจาก verified_at)
  - ใน flow อัปเดต KYC status เป็น approved: set `kyc_verified_at = NOW()`, `kyc_next_reverify_at = NOW() + interval '1 year'`.
  - เมื่อ user แก้ไขบัญชีธนาคาร (หรือข้อมูลสำคัญอื่น): set `kyc_next_reverify_at = NOW()` หรือ flag `kyc_needs_reverify = true`.
  - **GET `/api/kyc/status/:userId`:** คืนค่าเพิ่ม เช่น `needs_reverify: boolean`, `kyc_next_reverify_at`, `kyc_verified_at`.
  - **POST `/api/kyc/re-verify`:** รับการส่งเอกสาร/ข้อมูล re-verify (ใช้ logic เดียวกับ submit หรือลดขั้นตอนตามนโยบาย) แล้วอัปเดต `kyc_verified_at` และ `kyc_next_reverify_at`.

### 3.3 Frontend
- **ที่อยู่:** หน้า Profile/KYC (เช่น `pages/KYCApp.tsx`, `KYCWizard.tsx` หรือหน้าโปรไฟล์ที่แสดงสถานะ KYC)
- **การทำ:**
  - จาก `GET /api/kyc/status/:userId` ถ้า `needs_reverify === true` แสดงปุ่ม/แบนเนอร์ "ต้องยืนยันตัวตนใหม่ (Re-Verify)".
  - กดแล้วนำไปหน้า flow re-verify (ส่งเอกสาร/ข้อมูล แล้วเรียก `POST /api/kyc/re-verify`).

---

## 4. Job Complete + OTP/GPS (Safety)

### 4.1 เป้าหมาย
- งาน **Physical** (เช่น ช่างมาบ้าน): ก่อนเปลี่ยนสถานะเป็น Done ต้องผ่านอย่างน้อยหนึ่งอย่าง: **OTP จาก Employer** หรือ **Location Check (GPS)**.

### 4.2 Backend
- **ที่อยู่:** `backend/server.js`
- **การทำ:**
  - **POST `/api/jobs/:id/complete`** (หรือใช้ของเดิมถ้ามีอยู่แล้ว):
    - Body: `providerLocation: { lat, lng }`, (optional) `otpCode` สำหรับงาน physical.
    - ถ้างานเป็น physical (ดูจาก `category` หรือฟิลด์ `is_physical` ถ้ามี):
      - **ตัวเลือก A – OTP:** สร้าง OTP ส่งให้ Employer (เบอร์/อีเมล), เก็บใน Redis/DB ด้วย TTL สั้น (เช่น 5–10 นาที). เมื่อ Provider เรียก complete ส่ง `otpCode` มาด้วย; ตรวจว่า OTP ตรงและยังไม่หมดอายุ แล้วจึงอัปเดตสถานะเป็น Done (หรือ WAITING_FOR_APPROVAL ตาม flow ปัจจุบัน).
      - **ตัวเลือก B – GPS:** ตรวจว่า `providerLocation` อยู่ภายในระยะ X เมตรจาก job location (เก็บใน job หรือ address). ถ้าอยู่ในระยะให้ผ่าน.
    - ถ้าไม่ใช่ physical: ใช้แค่การยืนยันจาก Provider (และส่ง location ถ้ามี) แล้วอัปเดตสถานะได้เลย.
  - อัปเดต job status ตาม flow ปัจจุบัน (เช่น เป็น `waiting_for_approval` หลัง complete).

### 4.3 Frontend
- **ที่อยู่:** `pages/JobDetails.tsx`, `services/mockApi.ts`
- **การทำ:**
  - กำหนดว่า job ใดถือเป็น "physical" (จาก `category` หรือฟิลด์จาก API เช่น `is_physical`).
  - **Flow ปัจจุบัน:** Provider กด "ส่งงาน" → ขอ GPS → เรียก `markJobAsDone(id, location)`.
  - **เพิ่มสำหรับ physical:**
    - **แบบ OTP:** หลัง Provider กดส่งงาน ระบบขอ OTP จาก Employer (backend ส่ง OTP ไปให้ employer); แสดงช่องให้ Provider กรอก OTP แล้วเรียก API complete พร้อม `otpCode` + `providerLocation`. หรือ flow แบบ Employer ได้รับ OTP แล้วนำมากรอกในแอปก็ได้.
    - **แบบ GPS only:** ใช้ flow เดิม (ส่ง location) แต่ backend ต้องตรวจระยะ; ถ้าไกลเกินไปให้ API คืน 400 และ frontend แสดงข้อความ "กรุณาอยู่ในบริเวณจุดงาน".
  - อัปเดต `mockApi.markJobAsDone` ให้ส่ง `otpCode` (ถ้ามี) ไปที่ backend.

---

## 5. ลำดับการทำที่แนะนำ

1. **Rate limiting (Backend + Frontend)** – ลดความเสี่ยงทันที
2. **KYC Re-Verify (Backend migration + API แล้วตามด้วย Frontend)** – ข้อมูลครบก่อนจึงทำ UI
3. **Job complete + OTP/GPS (Backend API แล้วตามด้วย Frontend)** – กำหนดนิยาม physical และ flow OTP/GPS ให้ชัดก่อน

---

## 6. ไฟล์ที่เกี่ยวข้อง (สรุป)

| งาน | ไฟล์หลัก |
|-----|-----------|
| Rate limit | `backend/server.js` (middleware/helper + route login), `pages/Login.tsx` |
| KYC re-verify | `backend/server.js` (GET status, POST re-verify), `backend/db/migrations/`, หน้า KYC/Profile |
| Job complete | `backend/server.js` (POST complete), `pages/JobDetails.tsx`, `services/mockApi.ts` |

หลังจากวาง roadmap นี้แล้ว จะทำการปรับและแก้ไขในโค้ดตามลำดับด้านบน โดยเริ่มจาก rate limit ไปจนจบ job complete + OTP/GPS

---

## 7. Centralized Error Handling (429 Rate Limit) — ทั้งระบบ

### 7.1 เป้าหมาย
- รองรับสถานะ **429 (Rate Limit)** แบบเดียวกันทั้ง Backend และ Frontend
- Backend ส่ง `Retry-After` (header + body) ทุกครั้งที่ rate limit ถูกเกิน
- Frontend จับ 429 แล้วแสดงข้อความ + เลขนับถอยหลัง + ปุ่มทางเลือก (Smart Retry)

### 7.2 Backend
- **ที่อยู่:** `backend/server.js`
- **การทำ:**
  - มี helper/middleware ส่ง 429 แบบเดียวกัน: `res.status(429).set('Retry-After', retryAfter).json({ error, message, retry_after })`
  - (ทำแล้วใน `rateLimitLogin`) — ถ้ามี endpoint อื่นที่ rate limit ให้ใช้รูปแบบเดียวกัน

### 7.3 Frontend
- **ที่อยู่:** `services/api.ts` (axios interceptor), `pages/Login.tsx`
- **การทำ:**
  - ใน response interceptor: ถ้า `status === 429` ให้ reject ด้วย error ที่มี `retry_after` จาก header หรือ body
  - หน้า Login (และ OTP ถ้ามี): แสดงข้อความ "ลองใหม่อีกครั้งใน X วินาที" + ปุ่ม "ติดต่อ Support" / "ลืมรหัสผ่าน" (Smart Retry — ดูข้อ 9)

---

## 8. Audit Middleware — บันทึก Safety Flow อัตโนมัติ

### 8.1 เป้าหมาย
- **Audit Log Automation:** ทุกครั้งที่มีการ Verified OTP หรือตรวจ GPS ผ่าน หรือ KYC Status เปลี่ยน ให้บันทึกเข้า `audit_log` (PostgreSQL) พร้อม Metadata
- ใช้เป็นหลักฐานเมื่อแอดมินตัดสิน Dispute (ดูได้ว่า Provider อยู่ที่หน้างานจริงหรือไม่)

### 8.2 Backend
- **ที่อยู่:** `backend/auditService.js` (มีอยู่แล้ว), `backend/server.js`
- **การทำ:**
  - ใช้ `createAuditService(pool).log(actorId, action, entityData, context)` ที่มีอยู่
  - **Actions ที่ต้องบันทึก:**
    - `JOB_COMPLETE_OTP_VERIFIED` — เมื่อ Provider ส่งงานแล้ว OTP ถูกต้อง: metadata = { job_id, provider_id, otp_used: '[masked]', verified_at }
    - `JOB_COMPLETE_GPS_VERIFIED` — เมื่อตรวจ GPS ผ่าน: metadata = { job_id, provider_id, lat, lng, job_lat, job_lng, distance_m }
    - `KYC_STATUS_CHANGED` — เมื่อ KYC ผ่าน/ไม่ผ่าน/re-verify: metadata = { user_id, old_status, new_status, reason? }
  - เรียก audit.log หลัง OTP verify / GPS check ผ่าน / KYC update ใน endpoint ที่เกี่ยวข้อง (ไม่บล็อก main flow — fire-and-forget)

---

## 9. Smart Retry & Fallback (Login / OTP)

### 9.1 เป้าหมาย
- เมื่อ User เจอ **429** ไม่ให้รู้สึกว่าถูกทิ้งไว้กลางทาง
- แสดงเลขนับถอยหลัง + ปุ่ม "ติดต่อ Support" หรือ "ลืมรหัสผ่าน" โดยอัตโนมัติ

### 9.2 Frontend
- **ที่อยู่:** `pages/Login.tsx`
- **การทำ:**
  - จับ error 429 จาก login (และ OTP ถ้ามี)
  - แสดงข้อความ "ลองใหม่อีกครั้งใน X วินาที" (ใช้ `retry_after` จาก response)
  - แสดงปุ่ม "ติดต่อ Support" (ลิงก์ไปหน้า Help/Support หรือสร้างตั๋ว)
  - แสดงปุ่ม "ลืมรหัสผ่าน" (ถ้ามี flow ลืมรหัส)

---

## 10. Circuit Breaker — ล็อกเงินเมื่อ Dispute

### 10.1 เป้าหมาย
- เมื่อ Job ถูกเปลี่ยนสถานะเป็น **DISPUTED** ให้ระบบ **Lock เงินใน Escrow** ทันที
- ไม่มีใคร (รวมถึง Provider) สามารถกดเบิกเงินได้ จนกว่าสถานะจะถูกเปลี่ยนโดย Admin

### 10.2 Backend
- **ที่อยู่:** `backend/server.js` — endpoint `POST /api/payments/release`
- **การทำ:**
  - ก่อนปล่อยเงิน: ตรวจสอบว่า job ไม่ได้อยู่ในสถานะ dispute
  - ถ้า `job.dispute_status === 'pending'` หรือ `job.status === 'disputed'` (ตาม schema จริง): return 403 พร้อมข้อความ "Cannot release payment while dispute is open. Wait for admin resolution."
  - เฉพาะ Admin เท่านั้นที่สามารถปล่อยเงินหลัง resolve dispute ได้ (หรือมี endpoint แยก เช่น POST /api/admin/payments/release-after-dispute)

---

## 11. Data Sanitization & Privacy (KYC Upload)

### 11.1 เป้าหมาย
- ลบ **EXIF Data** (รวมถึงพิกัด GPS) จากรูปที่อัปโหลดสำหรับ KYC
- เบลอข้อมูลที่ไม่จำเป็นในรูปบัตรประชาชนอัตโนมัติก่อนส่งไป Cloudinary (ความเป็นส่วนตัว)

### 11.2 Backend
- **ที่อยู่:** `backend/server.js` — `POST /api/upload/image` (หรือ endpoint ที่ใช้สำหรับ KYC โดยเฉพาะ เช่น `/api/upload/form` เมื่อใช้กับ KYC)
- **การทำ:**
  - เมื่อ request ระบุว่าเป็น KYC (query `?for=kyc` หรือ folder `kyc_uploads`): ก่อนอัปโหลด Cloudinary ให้ใช้ library ลบ EXIF (เช่น `sharp` ด้วย `.withMetadata({ keep: false })` หรือ strip EXIF)
  - (Optional) เบลอส่วนที่ไม่จำเป็นในรูปบัตร — เช่น เบลอที่อยู่ย่อย ถ้ามีการ detect region; หรือใช้ Cloudinary transformation เบลอหลังอัปโหลดสำหรับการแสดงผลในบาง context

---

## 12. ลำดับการทำที่แนะนำ (รวมของใหม่)

1. **Centralized 429 + Smart Retry (Frontend)** — ให้ผู้ใช้เห็นผลทันทีเมื่อโดน rate limit
2. **Audit Middleware (Backend)** — เตรียม log ก่อนทำ OTP/GPS/KYC flow
3. **Circuit Breaker (Backend)** — ล็อกเงินเมื่อ dispute
4. **KYC Re-Verify + Job Complete OTP/GPS** — ตามข้อ 3–4 เดิม + เรียก audit ในจุดที่เกี่ยวข้อง
5. **EXIF Strip สำหรับ KYC upload** — เพิ่มใน endpoint upload ที่ใช้กับ KYC
