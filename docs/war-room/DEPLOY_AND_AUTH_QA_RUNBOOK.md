# WAR-ROOM — Deploy & Auth QA Runbook

**เป้าหมาย:** ปิด P0 (deploy) แล้วยืนยันว่า **สมัครสมาชิก / ลืมรหัสผ่าน / ล็อกอิน** ใช้งานได้จริงบน Safari, Chrome, iOS, Android

> Deploy บน Render ต้องทำจาก **Render Dashboard** โดยตรง — runbook นี้ให้ทีมทำตามทีละขั้น

**Git baseline (ต้องอยู่บน deploy):** `master` ≥ `ed8acd0a` (รวม `7007ff71` WAR-P0-01 build, `797bdf5e` smoke, SRP-W1 phone OTP, IRP meta/bootstrap)

---

## ขั้นที่ 1 — Deploy `master` บน Render (ปลด P0 STOP rule)

1. Render Dashboard → service backend (`api.aqond.com`)
2. **Manual Deploy** → branch **`master`**
3. Build log ต้องจบไม่ error — build command ต้องเป็น **`npm ci --prefix backend`** (WAR-P0-01)
4. **Environment variables** (ตัวอย่าง origin ที่มักใช้ — ปรับให้ตรง production จริง):

   | Key | หมายเหตุ |
   | --- | --- |
   | `JWT_SECRET` | บังคับ — ต้องตรงกับที่ client คาด (อย่า rotate กลางวัน launch ถ้าไม่จำเป็น) |
   | `CORS_ORIGIN` | คั่นด้วย comma **ไม่มีช่องว่างเกินจำเป็น** — ต้อง **exact origin** (scheme + host + port) |
   | SMS (Twilio ฯลฯ) | ถ้า OTP ยิงผ่าน server — ดู `backend/lib/smsOtpDelivery.js` และ `.env` ใน repo |

   **CORS_ORIGIN ที่ควรพิจารณา (ตรวจกับ URL ที่ user เปิดจริง):**

   - `https://app.aqond.com` — mobile web / PWA หลัก
   - `https://aqond.com` — landing / storefront
   - `https://admin.aqond.com` — Nexus Admin (ถ้า login ผ่าน admin)
   - Dev/staging origins ตามที่ทีมใช้ (ไม่ใส่ใน prod ถ้าไม่จำเป็น)

   Backend อ่าน `CORS_ORIGIN` แบบ split comma ใน `backend/server.js` — ไม่มี wildcard ใน prod.

5. **Restart** service หลังแก้ env

---

## ขั้นที่ 2 — ยืนยัน Deploy ด้วย Smoke Test

```bash
cd backend
npm run war-room:auth-smoke -- https://api.aqond.com
```

**เกณฑ์ผ่าน (exit code 0):**

| Probe | เกณฑ์ |
| --- | --- |
| `GET /api/health` | 200 |
| `GET /api/meta` | 200 (ไม่ใช่ 404 HTML) |
| `GET /api/app/bootstrap` | 200 |
| `POST /api/auth/phone-otp/send` | **ไม่ใช่ 404** (400 validation OK) |
| `POST /api/auth/phone-otp/verify` | **ไม่ใช่ 404** |
| `GET /api/videos/my` (no token) | 401 |
| `GET /api/videos/my` (invalid JWT) | 401 |

Auth routes อื่น (login/register/forgot) คาด **400** เมื่อ body ว่าง — แปลว่า route มีอยู่

**บันทึกหลักฐาน:** copy JSON output ไป `docs/war-room/evidence/prod-smoke.json` หรือแนบใน issue report

ถ้ายัง **404** ที่ `/api/meta`, `/api/app/bootstrap`, หรือ phone-otp → deploy ยังไม่ใช่ `master` ล่าสุด → กลับขั้นที่ 1

---

## ขั้นที่ 3 — Cross-Browser / Cross-Platform Auth Checklist

ทดสอบ 3 flow: **Register → Login → Forgot Password (OTP/reset)**  
บันทึก PASS/FAIL + screenshot หรือ HAR — ใช้แม่แบบ: [`evidence/cross-platform-auth-matrix.md`](./evidence/cross-platform-auth-matrix.md)

| Platform | Register | Login | Forgot Password | หมายเหตุ |
| --- | --- | --- | --- | --- |
| Chrome (Desktop) | ☐ | ☐ | ☐ | |
| Safari (Desktop/macOS) | ☐ | ☐ | ☐ | CORS / cookie |
| Safari (iOS) | ☐ | ☐ | ☐ | autofill, OTP keyboard |
| Chrome (Android) | ☐ | ☐ | ☐ | |
| WebView iOS (ถ้ามี) | ☐ | ☐ | ☐ | |
| WebView Android (ถ้ามี) | ☐ | ☐ | ☐ | |

**URL ที่แนะนำให้เทส:** `https://app.aqond.com` (Register UI แนะนำ Chrome/Safari ใน `mobile/pages/Register.tsx`)

### Safari / iOS — จุดที่มักพัง

- **`CORS_ORIGIN`** ไม่ตรง exact origin → Safari มัก fail เงียบกว่า Chrome
- Auth ใช้ **JWT ใน client storage** เป็นหลัก (ไม่พึ่ง HttpOnly cookie สำหรับ API Bearer) — ถ้าเพิ่ม cookie ภายหลัง ต้อง `SameSite=None; Secure` ข้าม origin
- OTP flow ที่เปิด tab/popup ใหม่ — ทดสอบบน iOS Safari
- **ไม่มี Refresh token API** — session หมดอายุต้อง login ใหม่; UI ต้องไม่ค้าง error กลางจอ

### วิธีดึง evidence

- Desktop: DevTools → Network → filter `api.aqond.com` → HAR หรือ screenshot headers/body
- iOS: Mac Safari → Develop → อุปกรณ์ → Web Inspector
- Android: `chrome://inspect` + USB debugging

---

## ขั้นที่ 4 — เกณฑ์ปิดงาน (Auth Acceptance = COMPLETE)

| Item | เกณฑ์ผ่าน |
| --- | --- |
| Production smoke | ขั้นที่ 2 exit 0 |
| Register / Login / Forgot | ทุกช่องใน matrix ☑ PASS + หลักฐาน |
| Refresh token API | **Known gap** — ไม่บล็อก MVP ถ้า UI redirect login ชัด |
| Logout | **MVP:** client ลบ JWT + ไม่เรียก protected API — ยืนยันบน 1 platform อย่างน้อย |
| Rate limit OTP | ทดสอบ spam send แล้วได้ 429/ข้อความ rate limit (ถ้าเปิด `RATE_LIMIT_OTP_REQUEST_IP`) |

เมื่อครบ → อัปเดต [`WAR_ROOM_Status.md`](./WAR_ROOM_Status.md) เป็น **Auth acceptance: COMPLETE** แล้วเข้า load test / monitoring ตามลำดับ P3–P5

---

## Rollback (Render)

1. Dashboard → **Rollback** ไป deploy ก่อนหน้า หรือ deploy commit เก่าที่รู้ว่า stable
2. รัน smoke อีกครั้ง — บันทึกว่า meta/bootstrap กลับเป็น 404 หรือไม่
3. Git revert (ถ้าโค้ดเป็นสาเหตุ): `git revert <commit>` แล้ว deploy ใหม่

---

## สถานะ production ล่าสุด (จาก agent smoke)

ดู timestamp ใน [`evidence/prod-smoke.json`](./evidence/prod-smoke.json) — ถ้ายัง 404 ที่ meta/bootstrap/phone-otp แปลว่ายัง **รอขั้นที่ 1**
