# AGENT_BOOTSTRAP.md
*อ่านไฟล์นี้เป็นไฟล์แรกเสมอ ก่อนเริ่มงานใดๆ ห้ามอ่านไฟล์นอกเหนือจากที่ระบุด้านล่าง เว้นแต่จำเป็นต้อง debug ประวัติ*

## ขั้นตอนที่ 1 — อ่านเสมอทุก session (Tier 1)
1. `README.md` (root)
2. `STATUS_INDEX.md`  ← สารบัญสถานะทุก track (ดูหัวข้อ "Status Index" ด้านล่าง) — **อ่านไฟล์นี้แทน CURRENT_STATUS.md ตัวเดียว**
3. `MASTER_BLUEPRINT.md`
4. `DECISIONS.md`
5. `CODING_STANDARDS.md`

> ⚠️ มี `CURRENT_STATUS.md` มากกว่า 1 ไฟล์ในระบบนี้ เพราะแต่ละไฟล์คือคนละ track (ดู Status Index) **ห้ามอ่านทุกไฟล์ทุกครั้ง** ให้ดูจาก `STATUS_INDEX.md` ก่อนว่า track ไหนเกี่ยวกับงานที่กำลังทำ แล้วอ่านเฉพาะไฟล์นั้น

## Status Index (ต้องตั้งค่าไฟล์จริงตามนี้)

| Track | ไฟล์ (เปลี่ยนชื่อใหม่) | อ่านเมื่อไหร่ | สถานะไฟล์ |
|---|---|---|---|
| Storefront / Merchant-Ad | `CURRENT_STATUS__STOREFRONT_MERCHANT_AD.md` | งานเกี่ยวกับ storefront, PDP, merchant ad video, catalog | ✅ พร้อมใช้ |
| Jarvis Architecture | `CURRENT_STATUS__JARVIS_ARCHITECTURE.md` | งานเกี่ยวกับ Jarvis stack, sprint 31+, architecture layer | ✅ พร้อมใช้ (sprint 29-35 complete, archived) |
| Release/Production Readiness | `PLATFORM_READINESS_STATUS.md` (รวมจาก REGRESSION_STATUS + PRODUCTION_READINESS_FINAL + PLATFORM_COMPLETION) | **เฉพาะงาน deploy/QA/release เท่านั้น — ไม่ใช่งานฟีเจอร์ประจำวัน** | ⏳ รอเนื้อหา 3 ไฟล์ต้นฉบับ |

> เพิ่มแถวใหม่ทุกครั้งที่มี track ใหม่เกิดขึ้น ห้ามสร้างไฟล์ชื่อ `CURRENT_STATUS.md` เปล่าๆ อีก ต้องมี track suffix เสมอ

## API Docs (แก้ overlap แล้ว)

| ไฟล์ | Scope | สถานะ |
|---|---|---|
| `API_REGISTRY.md` | Source of truth ปัจจุบันทั้งหมด: Orders, Food, Rider, Merchant, Admin, Storefront Commerce | ✅ พร้อมใช้ |
| `API_CATALOG.md` | เฉพาะ AIVOS merchant-ad detail + legacy backend prefixes เท่านั้น (ตัด section ที่ทับออกแล้ว) | ✅ พร้อมใช้ |

## Payment & Job Safety (พบไฟล์ซ้ำจริง — ต่างจากเคส API)

`PAYMENT_AND_JOB_SAFETY.md` และ `PAYMENT_JOB_SAFETY.md` เป็นเอกสารเรื่องเดียวกัน 100% ไม่ใช่คนละ scope:
- ไฟล์ที่มีหัวข้อ "5. สรุป Tuning (PaymentService & JobController)" + double-release protection + refund reverse-ledger เต็ม = **ฉบับสมบูรณ์ → เก็บไว้ใช้จริง**
- ไฟล์ที่ลงท้ายด้วย "สรุป Prompt ที่ให้ Cursor AI ทำเพิ่ม" = **ฉบับร่างเก่ากว่า → ย้ายเข้า `archive/`**

> ระบุชื่อไฟล์จริงในระบบคุณให้ตรงกับสองอันนี้ แล้ว `mv` ฉบับร่างเข้า `archive/` ได้เลย

## ขั้นตอนที่ 2 — เลือกอ่านตามประเภทงาน (Tier 2)

**กำลังเพิ่มฟีเจอร์ใหม่ทั่วไป** → อ่านเพิ่ม:
- `MODULE_MAP.md`
- `API_CATALOG.md`
- `FEATURE_REGISTRY.md`
- `DATABASE_SCHEMA.md`

**กำลังทำงานฝั่ง payment/transaction** → อ่านเพิ่ม:
- `PAYMENT_FEE_DESIGN.md`
- `PAYMENT_JOB_SAFETY.md`
- `PAYMENT_SYSTEM_PRODUCTION_R...md`

**กำลังทำงานฝั่ง AI agent / orchestration / Jarvis** → อ่านเพิ่ม:
- `JARVIS_AI_OS.md`
- `INTENT_ENGINE.md`
- `NEXUS_EXAM_ENGINE_AND_O...md`
- `LIFECYCLE_ENGINE.md`

**กำลังทำ QA / validation / ตรวจสอบระบบ** → อ่านเพิ่ม (ในโฟลเดอร์ `platform-validation`):
- `000-program-overview.md`
- `GOVERNANCE.md`
- `BASELINE-REGISTRY.md`
- `MISSION-COVERAGE.md`
- ไฟล์ `0XX-*.md` เฉพาะเลขที่ตรงกับหัวข้อที่กำลังตรวจ (อย่าเปิดทั้งชุด 000-015)

**กำลังเตรียม deploy / release / ตรวจความพร้อมขึ้น production** → อ่านเพิ่ม:
- `PLATFORM_READINESS_STATUS.md` เท่านั้น (ไฟล์รวมจาก REGRESSION_STATUS + PRODUCTION_READINESS_FINAL + PLATFORM_COMPLETION)
- ไม่ต้องอ่านไฟล์นี้สำหรับงานฟีเจอร์ทั่วไป — โหลดเฉพาะตอนใกล้ release เท่านั้น

**กำลังทำระบบการตลาดใหม่** → ยังไม่มีไฟล์กลาง
- ⚠️ ต้องสร้าง `MARKETING_BLUEPRINT.md` ก่อนเริ่มงานนี้จริงจัง
- ระหว่างนี้ให้ระบุ context เพิ่มในคำสั่งแทน อย่าปล่อยให้ agent เดาจากไฟล์อื่น

## ขั้นตอนที่ 3 — ห้ามอ่านอัตโนมัติ (Tier 3 / Archive)
ไฟล์กลุ่มนี้เป็นประวัติ ไม่ใช่สถานะปัจจุบัน ห้ามโหลดเว้นแต่ต้องสืบประวัติบั๊กหรือการตัดสินใจเก่า:
- ✅ `SPRINT_29.md` ถึง `SPRINT_35.md` (รวม 30a-30f) — **สถานะ: เสร็จสมบูรณ์ทั้งหมด, ย้ายเข้า `archive/sprints/` แล้ว** สรุป 1 บรรทัดต่อ sprint อยู่ที่ `archive/sprints/SPRINT_ARCHIVE_INDEX.md`
- `PHASE2-module1-questions*.md`, `PHASE3_PROGRESS.txt`
- `engineering-log/daily/`, `engineering-log/monthly/`, `engineering-log/weekly/`
- `sessions/`
- `RIDER-OS-PHASE1.md` (ถ้าปิด phase แล้ว)
- ไฟล์ one-off จาก `docs/` root: `AUTH_SIMPLIFIED_COMPLETE.txt`, `AUTH_UPGRADE_COMPLETE.txt`, `FIX_RATE_LIMIT.txt`, `FIXED_DATABASE_COLUMN.txt`, `STEP0_REVIEW_AND_PHASES.txt`, `SYSTEM_OPTIMIZATION_COMPLETE_...txt`, `test_base64.txt`, `test_document.txt`

→ **ย้ายไฟล์กลุ่มนี้เข้า `/archive/` จริงในระดับไฟล์ระบบ** แล้วเพิ่ม `.cursorignore` ที่ root:
```
archive/
```
ไม่งั้น Cursor ยัง semantic-index ไฟล์ใน archive อยู่ดี แม้จะย้ายโฟลเดอร์แล้วก็ตาม

## กฎเสริมสำหรับ Cursor
เพิ่มใน `.cursorrules` หรือ system prompt ของโปรเจกต์:
```
Before starting any task, read AGENT_BOOTSTRAP.md first.
Follow its routing exactly — only load the Tier 2 docs relevant
to the current task type. Never read files under /archive/
unless explicitly asked to investigate history.
If CURRENT_STATUS.md conflicts with any other doc, CURRENT_STATUS.md wins.
```

## งานบำรุงรักษาที่ต้องทำครั้งเดียวก่อนใช้ระบบนี้จริง
1. รวม `CURRENT_STATUS.md`, `REGRESSION_STATUS.md`, `PRODUCTION_READINESS_FINAL.md`, `PLATFORM_COMPLETION_RE...md` ให้เหลือไฟล์เดียว อัปเดตไฟล์เดียวนี้ทุกครั้งที่จบ session แทนการสร้างไฟล์ใหม่
2. ย้ายไฟล์ Tier 3 ทั้งหมดเข้า `/archive/`
3. เขียน one-line description กำกับทุกไฟล์ใน Tier 1-2 ไว้ในตารางนี้ ให้อัปเดตทุกครั้งที่มีไฟล์ใหม่เกิดขึ้น — ป้องกันไม่ให้กลับไปกองรวมกันแบบเดิมอีก
