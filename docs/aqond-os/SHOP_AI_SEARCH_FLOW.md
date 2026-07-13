# Shop AI Search Flow (เดิมชื่อ AI_HERMES_SHOPPING_FLOW.md)

**Last Updated:** 2026-07-13
**สถานะ:** ⚠️ **ย้าย scope แล้ว** — เดิมออกแบบไว้ใต้ "Hermes Agent" แต่ตามการตัดสินใจล่าสุด ฟีเจอร์ค้นหา/สั่งซื้อสินค้าในแชท (AI ช่วย buyer หาสินค้า) ย้ายไปอยู่ใต้ **AQOND Shop** แทน (เป็นออปชัน "AI search" ใน Shop ไม่ใช่ Hermes)
**เหตุผลที่ย้าย:** Hermes Agent ถูกนิยามใหม่ให้เป็น AI ช่วยฝั่ง **merchant/worker** เท่านั้น (ลงสินค้า, จัดการคิว, จ้างงาน) ไม่ใช่ฝั่ง buyer — ดู `LIFF_APP_INVENTORY.md` สำหรับภาพรวมล่าสุด
**เกี่ยวข้องกับ:** `LINE_CHAT_TRANSACTION_FLOW.md`, `PAYMENT_JOB_SAFETY.md`, `security-audit-prompt-v2.md`

---

## สิ่งที่ทำได้เลยตอนนี้ vs ต้องรอ audit

| ส่วนของ flow | ทำตอนนี้ได้ไหม | เหตุผล |
|---|---|---|
| AI ค้นหาสินค้า, แสดง list ในแชท | ✅ ได้เลย | ไม่แตะเงิน/บัญชี |
| ผู้ใช้พิมพ์ "เอาลีปอนเอฟที่ถูกสุด" → AI resolve สินค้า | ✅ ได้เลย (แต่ resolve ด้วย DB query จริง ไม่ใช่ AI เดา — ดูข้อ 3) | อ่านอย่างเดียว |
| เลือกจำนวน, สร้าง cart | ✅ ได้เลย | ยังไม่ตัดเงิน |
| ปุ่ม "สั่งซื้อ" → สร้าง QR จ่ายเงินจริง | ⛔ รอ audit | ตรงกับ audit ข้อ 1, 4 (token scope, price validation) |
| ยืนยันจ่าย + PIN | ⛔ รอ audit | ตรงกับ audit ข้อ 2, 5 (PIN bypass, user เห็นรายละเอียดครบก่อนกด) |
| Tracking, สถานะ, รีวิว | ✅ ได้เลย | ไม่แตะเงินโดยตรง (เป็น read/status update) |
| Refund/คืนสินค้า | ⛔ รอ audit | เชื่อมกับ `PAYMENT_JOB_SAFETY.md` ข้อ 3 (refund reverse-ledger) |

**คำแนะนำ:** สั่ง Cursor สร้างทั้ง flow ได้เลยตามสเปกนี้ แต่ **ใส่ feature flag ที่จุดสั่งซื้อจริง** (`ENABLE_AI_CHECKOUT=false` เป็น default) เปิดเฉพาะตอน audit ผ่านแล้วเท่านั้น แบบนี้ dev ไม่ต้องรอ ได้ progress ไปพร้อมกัน แต่ระบบจริงจะไม่มีทางให้ AI ตัดเงินได้จนกว่าจะปลอดภัยจริง

---

## Flow เต็ม

### 1. ค้นหาสินค้า (AI Hermes)
User: "อยากได้น้ำยาล้างจาน"
→ Hermes query ฐานข้อมูลสินค้าจริง (ไม่ใช่ AI แต่งขึ้นเอง) → ส่ง Flex Message carousel 5-10 รายการ (รูป, ชื่อ, ราคา, ร้านค้า)

### 2. Refine ด้วยภาษาธรรมชาติ
User: "เอาลีปอนเอฟที่ถูกที่สุดตอนนี้"
→ **สำคัญ:** AI ต้อง resolve คำสั่งนี้เป็น **DB query จริง** (`SELECT * FROM products WHERE name LIKE 'ลีปอนเอฟ%' ORDER BY price ASC LIMIT 1`) ไม่ใช่ให้ AI จำราคาจาก context เองแล้วสรุปมาตรงๆ — ป้องกันปัญหาเดียวกับ audit ข้อ 4 (price validation)

### 3. เลือกจำนวน
Quick Reply ตัวเลข 1-10 + ปุ่ม "พิมพ์จำนวนเอง"
→ เก็บลง cart (server-side cart, ไม่ใช่ AI จำไว้ในบทสนทนาเฉยๆ)

### 4. สรุป cart + ปุ่มสั่งซื้อ
Flex Message สรุป: รายการ, จำนวน, ราคารวม, ร้านค้า, ค่าส่ง (ถ้ามี)
→ **ต้องแสดงครบทุกอย่างก่อนกดสั่งซื้อ** ตรงกับ audit ข้อ 5

### 5. สร้าง QR จ่ายเงิน (ผ่าน Payso Gateway) — 🔒 หลัง audit ผ่านเท่านั้น
- QR สร้างจากยอดที่ validate กับ DB อีกรอบ ณ ตอนนี้ (ไม่ใช่ยอดที่ AI สรุปไว้ตอน step 2)
- แสดง QR ในแชทโดยตรง (Flex Message รูป QR)
- ใช้ pattern เดียวกับ `POST /api/payments/process` ที่มีอยู่แล้วใน `PAYMENT_JOB_SAFETY.md`

### 6. สถานะจ่ายเงิน
Payso webhook → อัปเดต order status → ส่งข้อความในแชท "ชำระเงินแล้ว ✅ รอร้านค้ารับออเดอร์"

### 7. ร้านค้ารับออเดอร์
Merchant กดรับในระบบ merchant dashboard → ส่งข้อความ "ร้านค้ารับคำสั่งซื้อแล้ว กำลังเตรียมจัดส่ง"

### 8. Tracking realtime
ใช้ pattern เดียวกับ food tracking ที่มีอยู่แล้ว (`/api/food/tracking/[orderId]`, dispatch-svc) — ขยายมาใช้กับ product order:
- อัปเดตทุกจุดเช็คพอยต์: รับสินค้าจากร้าน → ถึงโกดัง → ออกจากโกดัง → กำลังส่ง → ถึงมือผู้รับ
- ส่งเป็นข้อความ/Flex Message อัปเดตในแชทอัตโนมัติทุกครั้งที่สถานะเปลี่ยน (ไม่ต้องให้ user เข้าไปเช็คเอง)

### 9. ยืนยันรับสินค้า
User กดปุ่ม "ได้รับสินค้าแล้ว" ในแชท → ปลด escrow (`payments/release` — ต้องผ่าน Double Lock check ตาม `PAYMENT_JOB_SAFETY.md` ข้อ 2 เหมือนเดิม)

### 10a. กรณีปกติ — จบด้วยรีวิว
→ ส่งข้อความขอให้ให้คะแนน 1-5 ดาว + comment (Quick Reply ดาว)

### 10b. กรณีมีปัญหา — คืนสินค้า/ข้อพิพาท
1. User กด "สินค้ามีปัญหา" → เปิด dispute (เข้า `job_disputes` pattern เดิม, **hard-block การปล่อยเงินทันที** ตามที่มีอยู่แล้ว)
2. ระบบเสนอ **"ให้แพลตฟอร์มไปรับสินค้าคืน"** — สร้าง job ประเภทใหม่ `return_pickup` (ใช้โครง rider job เดิมจาก `API_REGISTRY.md` แต่ทิศทางกลับด้าน: รับจากผู้ซื้อ → ส่งกลับร้านค้า)
3. เมื่อร้านค้ายืนยันรับของคืนแล้ว → Admin/ระบบ resolve dispute → refund ตาม reverse-ledger 3 ขาที่มีอยู่แล้ว (`PAYMENT_JOB_SAFETY.md` ข้อ 3)
4. ปิดข้อพิพาททั้งสองฝ่าย → แจ้งผลในแชท

---

## Guardrail สรุปรวม (ต้องมีครบก่อนเปิด `ENABLE_AI_CHECKOUT`)

- [ ] AI agent token จำกัดสิทธิ์แค่ search + cart-build เท่านั้น ไม่มีสิทธิ์เรียก payment endpoint ตรงๆ
- [ ] ราคา/จำนวนสินค้า validate กับ DB จริงทุกครั้งก่อนสร้าง QR (ไม่เชื่อสิ่งที่ AI สรุปจาก context)
- [ ] คำอธิบายสินค้าที่ร้านค้ากรอกเอง ถูก sanitize ก่อนป้อนเข้า prompt ของ AI (กัน prompt injection ตามที่ audit เช็ค)
- [ ] แสดงสรุป order ครบก่อน generate QR ทุกครั้ง
- [ ] Rate limit จำนวน order ที่ AI agent สร้างได้ต่อ user ต่อช่วงเวลา
- [ ] Return pickup flow ผูกกับ dispute lock เดิม ไม่สร้าง path ใหม่ที่ข้าม Double Lock check

---

## Implementation (Step 1–4)

**API:** `POST /api/shop/ai-search` — รับข้อความ LINE / LIFF, คืน LINE message objects (text, flex, quickReply)

**โมดูล:** `aqond-v2/apps/storefront/lib/server/shopAiSearch/`

| Step | สถานะ implement |
|------|-----------------|
| 1 ค้นหา + carousel | ✅ `productQuery.searchProducts` + `flexMessages.productCarousel` |
| 2 refine ถูกสุด | ✅ `productQuery.findCheapest` (DB sort ไม่ใช้ AI จำราคา) |
| 3 เลือกจำนวน | ✅ Quick Reply 1–10 + server cart |
| 4 สรุป cart | ✅ `flexMessages.cartSummary` |
| 5–10 checkout/QR/PIN | ⛔ หลัง `ENABLE_AI_CHECKOUT` (default `false`) |

---

## Prompt สำหรับส่งให้ Cursor (ต่อจาก LINE_CHAT_TRANSACTION_FLOW.md)

```
ใช้โมเดล: Opus 4.8

อ่าน AGENT_BOOTSTRAP.md ก่อน แล้วอ่านเพิ่มเฉพาะ:
- LINE_CHAT_TRANSACTION_FLOW.md
- SHOP_AI_SEARCH_FLOW.md (ไฟล์นี้)
- PAYMENT_JOB_SAFETY.md
- security-audit-prompt-v2.md (เพื่อรู้ว่าจุดไหนต้อง gate ไว้)

งาน: implement Shop AI search flow ตามสเปกใน SHOP_AI_SEARCH_FLOW.md

กฎสำคัญ: ทุก endpoint ที่เกี่ยวกับ step 5 เป็นต้นไป (สร้าง QR, จ่ายเงิน, ปล่อย
escrow, refund) ต้องครอบด้วย feature flag ENABLE_AI_CHECKOUT (default false)
ห้าม implement แบบเปิดใช้งานจริงจนกว่าจะได้รับคำสั่งเปิดหลัง audit ผ่าน

implement เรียงตามนี้:
1. Step 1-4 (ค้นหา, refine, เลือกจำนวน, สรุป cart) — ทำได้เต็มที่ ไม่ gate
2. Step 5-10 — เขียนโค้ดได้ แต่อยู่หลัง feature flag ที่ปิดอยู่
3. รายงานว่า guardrail ทั้ง 6 ข้อในหัวข้อ "Guardrail สรุปรวม" ข้อไหน
   implement ครบแล้ว ข้อไหนยังไม่ครบ ก่อนขอเปิด flag

ห้ามเปิด ENABLE_AI_CHECKOUT เป็น true เองโดยไม่ได้รับคำสั่งชัดเจน
```
