# LIFF_APP_INVENTORY.md

**Last Updated:** 2026-07-13
**Scope:** สถานะ spec/design ของ LIFF app ทั้ง 12 ตัวที่มีอยู่จริงใน LINE Developers Console

---

## ตารางสรุป

| LIFF app | หน้าที่ (ตามที่ยืนยันแล้ว) | Spec ที่มีอยู่ | สถานะ |
|---|---|---|---|
| **AQOND Booking** | จองบริการ (ล้างแอร์, ตัดผม ฯลฯ) แบบ step-by-step บังคับ + resume ได้ | `LINE_CHAT_TRANSACTION_FLOW.md` (ตัวอย่างล้างแอร์) | ✅ พร้อมส่ง Cursor |
| **AQOND Shop** | หาสินค้า, สั่งซื้อ, ติดตามสินค้า, ขอคืนสินค้า/ข้อพิพาท, จดจำร้านค้า, ให้คะแนนร้านค้า **+ AI search ช่วยหาสินค้าในแชท** (ย้ายมาจาก Hermes) | `SHOP_AI_SEARCH_FLOW.md` (ส่วน AI search) — **ยังขาด spec ของ flow พื้นฐาน** (browse ปกติ, favorite, review ที่ไม่ผ่าน AI) | ⚠️ มีบางส่วน — ต้องเพิ่ม spec ส่วนที่ไม่ใช่ AI |
| **AQOND Hermes Agent** | AI ช่วย **merchant/worker**: ลงเมนู/เพิ่ม/แก้ไขสินค้าด้วยคำสั่ง, อำนวยความสะดวกจ้างงาน, ช่วยตรวจงาน/ผู้รับงาน (เช่น ร้านตัดผมสั่ง voice จัดคิว) | ยังไม่มี — ของเดิม (`AI_HERMES_SHOPPING_FLOW.md`) ย้ายไป Shop แล้ว | ❌ ต้องออกแบบใหม่ทั้งหมด (สเปกเดิมใช้ไม่ได้กับนิยามใหม่) |
| **AQOND Easy** | สรุปงาน, analytics, อำนวยความสะดวกทั่วไป | ยังไม่มี | ⚠️ ยังไม่ชัดว่ากลุ่มผู้ใช้คือใคร (merchant? admin? ทุกคน?) — ต้องถามเพิ่มก่อนออกแบบได้ |
| **AQOND Food** | สั่งอาหาร, ติดตาม rider | ไม่มี spec ตรงๆ แต่ reuse pattern จาก dispatch-svc/food-svc ที่มีโค้ดอยู่แล้ว | ⚠️ ควรเขียน spec เฉพาะ ผูกกับของที่มีอยู่ |
| **AQOND Partner Rider** | รับงาน/ติดตามสถานะของไรเดอร์ | ไม่มี | ❌ |
| **AQOND Partner Shop store** | จัดการร้านค้า (marketplace merchant) | ไม่มี | ❌ |
| **AQOND Partner Mall** | ไม่ทราบความหมายชัดเจน — คนละอันกับ Shop store หรือเป็นระดับที่ใหญ่กว่า (รวมร้านหลายร้าน)? | ไม่มี | ❌ ต้องถามเพิ่ม |
| **AQOND Partner Merchant food** | จัดการร้านอาหาร | ไม่มี | ❌ |
| **AQOND Partner Skill** | ผู้ให้บริการทักษะ (ช่างตัดผม, ช่างแอร์ ฯลฯ) จัดการคิว/งาน | ไม่มี — **แต่ตรงกับตัวอย่าง voice command ของ Hermes เป๊ะ** (ร้านตัดผมสั่งจัดคิว) | ❌ **แนะนำออกแบบคู่กับ Hermes Agent เพราะเป็นกลุ่มผู้ใช้เดียวกัน** |
| **AQOND JobBoard** | ประกาศ/หางาน (advance job) | ไม่มี | ❌ |
| **AQOND MatchJob** | จับคู่งาน (matchjob) | ไม่มี | ❌ |

---

## Insight สำคัญที่พบระหว่างทำ inventory นี้

### Hermes Agent อาจไม่ใช่ LIFF แอปเดี่ยว แต่เป็น "AI layer ที่ฝังอยู่ใน Partner apps หลายตัว"

จากนิยามใหม่ (ลงสินค้า, จัดการคิว, ช่วยจ้างงาน, ช่วยผู้รับงาน) พบว่า scope ของ Hermes ทับซ้อนกับ**อย่างน้อย 4 app**:
- **Partner Merchant food / Partner Shop store** — ใช้ Hermes ลงเมนู/สินค้าด้วยคำสั่ง
- **Partner Skill** — ใช้ Hermes จัดการคิวด้วย voice (ตัวอย่างร้านตัดผม)
- **JobBoard / MatchJob** — ใช้ Hermes อำนวยความสะดวกเรื่องจ้างงาน

**คำถามสถาปัตยกรรมที่ต้องตัดสินใจ:** Hermes ควรเป็น
1. LIFF app แยกต่างหาก 1 ตัว ที่ทุก partner เข้ามาใช้ร่วมกัน หรือ
2. AI assistant ฝังอยู่ในแต่ละ Partner app (ปุ่ม/ช่องแชทลอยอยู่ในทุกหน้า Partner)

แนวทาง 2 น่าจะสมเหตุสมผลกว่า เพราะ context ของแต่ละ Partner app ต่างกันมาก (merchant ลงสินค้า vs skill worker จัดคิว) — แต่ต้องยืนยันกับคุณก่อนเริ่มออกแบบ spec จริง

---

## สิ่งที่ต้องตัดสินใจต่อก่อนออกแบบ Hermes Agent spec ใหม่

1. **AQOND Partner Mall คืออะไร** — ต่างจาก Partner Shop store ตรงไหน?
2. **AQOND Easy ใช้โดยกลุ่มไหน** — merchant, admin, หรือทุก role?
3. **Hermes ควรเป็น LIFF แยก หรือฝังในแต่ละ Partner app** (ตาม insight ข้างบน)?

---

## ลำดับความสำคัญที่แนะนำสำหรับงานถัดไป

1. ตอบ 3 คำถามข้างบนก่อน (เร็ว ไม่เสียเวลามาก)
2. ออกแบบ spec "Hermes Agent — Merchant/Worker Ops" ใหม่ทั้งหมด (แยกจาก Shop AI search ที่เสร็จไปแล้ว)
3. เติม spec ที่ยังขาดให้ Shop (ส่วน browse/favorite/review ที่ไม่ผ่าน AI)
4. Partner apps ที่เหลือ (Rider, Shop store, Merchant food, Skill, JobBoard, MatchJob) — ออกแบบทีละตัวตามลำดับความสำคัญทางธุรกิจ
