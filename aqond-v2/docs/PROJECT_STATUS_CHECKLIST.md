# PROJECT_STATUS_CHECKLIST.md

**Last Updated:** 2026-07-18

---

## ✅ เสร็จแล้ว

- [x] Login/Register/Forgot-password บน Android เสถียรแล้ว (Capacitor keyboard/viewport, back button, autofill attributes)
- [x] Docs governance: `AGENT_BOOTSTRAP.md`, `STATUS_INDEX.md`, CURRENT_STATUS แยก track, API_REGISTRY/CATALOG แก้ overlap
- [x] `.gitignore` แก้ไขให้ track docs ได้ — verify แล้ว (commit d536bc0e)
- [x] Sprint 29-35 archive แล้ว
- [x] Payment/Job safety audit (Double Release, dispute lock, ledger 3 ขา) — implement แล้วในระบบเก่า (`backend/server.js`)
- [x] LICENSE_AND_VULN_REVIEW — ตัดสินใจ build in-house ไม่ใช้ LobeChat/Open WebUI
- [x] LIFF_APP_INVENTORY ครบ 12 app พร้อมสถานะ + เส้นแบ่ง Shop/Hermes/Easy ชัดเจน
- [x] Shop AI Search Step 1-4 implement แล้ว (gate Step 5-10 ไว้รอ audit)
- [x] Easy: evidence + schema proposal เสร็จ (`/api/easy/summary`, `/api/easy/support`)

## 🔄 กำลังทำ

- [ ] **LINE LIFF integration** — เริ่มแล้ว (ตามที่แจ้ง) ใช้ spec `LINE_RICHMENU_LINK_MAP.md`, `LINE_CHAT_TRANSACTION_FLOW.md`
- [x] **Hermes voice assistant — Partner onboarding ทุกหมวด** — **Phase 0-3 เสร็จครบ + smoke test ผ่านจริงทุก phase** (rider/merchant/partner_skill) — ดูรายละเอียดในหัวข้อด้านล่าง

## ⚙️ พร้อมใช้งาน แต่รอ config ก่อน launch จริง (ไม่ใช่งานโค้ด)

- [ ] ตั้ง `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` — nudge ทาง LINE ยัง degrade เป็น log
- [ ] ตั้ง Firebase creds สำหรับ FCM — nudge ทาง push ยัง degrade เป็น log
- [x] Commit Phase 0-3 เข้า repo — commits f46b67e4, 0b15e6b3

## 🛑 Food OS Release Gate — คำตัดสิน Opus 4.8 (2026-07-19): NOT PRODUCTION READY

**ผล:** 2 FAIL (G1 clean install, G5 backup/restore) + 3 CONDITIONAL (G4, G6 monitor schedule, G7) — G2 migration hygiene ปิดแล้ว; COD P1 fix แล้ว

**COD P1 (Opus verdict — commit 1f5066db):** `/cod/reserve` handler + cap-exceed unassign — **แก้แล้ว**

**Checklist เต็มก่อน production-ready จริง** (ดูรายละเอียดในผลตัดสินเต็ม — ยังไม่ทำในรอบนี้เพราะ budget จำกัด):
- [x] COD-1, COD-2 — commit 1f5066db
- [ ] G1: Linux VM สะอาด + build ผ่าน (หรือแก้ spec ยอมรับ Windows อย่างเป็นทางการ)
- [ ] G5: restore→fresh DB→happy-path ให้ครบ + แก้ template1 corruption
- [x] G2: commit migration 042 + จัดระเบียบ orphan 037-042 — commits 081dc13c, 5393f232
- [ ] G4: รัน rollback matrix ครบ 5 flag
- [x] G6: แก้ alert `food_outbox_dlq_nonzero` — commit bfc26716 (logic แก้แล้ว, รอ schedule monitor ใน prod)
- [ ] G7: รันโหลดใหม่บน env ที่นิยามชัดเจน (441ms vs 1995ms เป็นคนละ code state จริง แต่ต้องยืนยันใน env ตาม spec)

**หมายเหตุ:** G3 (integration tests) = PASS แล้ว — regression bug เดิม ("ready without proof got 200") ถูก fix ไปแล้วในโค้ดปัจจุบัน ไม่ต้องแก้ซ้ำ

## ⏸ รอ audit ก่อนเปิดใช้งานจริง

- [ ] Shop AI Search Step 5-10 (payment/QR/PIN) — รอผล gap-closing audit + document 6
- [ ] Gap-closing audit เอง — **ยังไม่ยืนยันว่ารันแล้วหรือยัง** (ค้างมาหลายรอบ)

## ❌ ยังไม่เริ่ม / รอข้อมูล

- [ ] **B2: รวม 3 ไฟล์ readiness** (`REGRESSION_STATUS.md`, `PRODUCTION_READINESS_FINAL.md`, `PLATFORM_COMPLETION_RE...md`) — รอเนื้อหาจากคุณ
- [x] **Git verify** — commit d536bc0e, docs tracked แล้ว
- [ ] Payment file ซ้ำ (`PAYMENT_AND_JOB_SAFETY.md` vs `PAYMENT_JOB_SAFETY.md`) — archive ฉบับร่าง (ค้างจากรอบเก่ามาก)
- [ ] Hermes backend channel-agnostic check (คุยไว้ว่าต้องเช็คก่อนต่อ LINE)
- [ ] Partner Rider / Shop store / Mall / Merchant food / Skill / JobBoard / MatchJob — ยังไม่มี spec เฉพาะ (Skill ควรทำคู่กับ Hermes onboarding เพราะ user เดียวกัน)
- [ ] `/api/easy/summary`, `/api/easy/support` — schema เสร็จแล้ว รอ implement จริง

---

## Hermes Voice Assistant — Partner Onboarding (เสร็จแล้ว Phase 0-3)

**ผลลัพธ์สุดท้าย:** Hermes ช่วยสมัครพาร์ทเนอร์ทุกหมวด (rider/merchant/partner_skill) ผ่าน voice, นำทางจนสำเร็จ, ติดตามสถานะฝั่ง server, และส่ง nudge อัตโนมัติเมื่อ user ค้าง — ครบทั้ง 3 คำถามที่เคยเป็น blocker:
1. Voice: client STT (Web Speech, `th-TH`)
2. นำทาง: "fill" กลุ่ม A (text/JSON) auto-submit ผ่าน consent+audit, กลุ่ม B (KYC/exam) guided-capture เท่านั้น (กฎหมาย/integrity)
3. Nudge: FCM+LINE คู่ขนาน, cap 1/วัน สูงสุด 3 ครั้งตลอดชีพ, ต้อง consent ก่อนส่งทาง LINE

**Smoke test ผ่านทุก phase ด้วยหลักฐานจริงจาก DB/log** (ไม่ใช่แค่ static review) — รวม audit trail ครบ (`HERMES_TOOL_PROPOSED/EXECUTED/REJECTED`, `ONBOARDING_NUDGE_SENT/OPT_OUT`)

**เจอและแก้บั๊กจริงระหว่างทาง:** mask regex กว้างเกิน (`bank_book` โดน mask ผิด) — พิสูจน์คุณค่าของการ smoke test จริงแทน static check อย่างเดียว

---

## ลำดับความสำคัญที่แนะนำ

1. ~~Commit Phase 0-3 (Hermes onboarding) เข้า repo~~ ✅ f46b67e4, 0b15e6b3
2. ตั้ง config LINE/Firebase ก่อน nudge จะทำงานจริง
3. ~~ปิด git verify~~ ✅ d536bc0e — ต่อด้วย B2 (ค้างมานานที่สุดในบรรดางานทั้งหมด)
4. เริ่ม implement `/api/easy/summary` (schema พร้อมแล้ว)
5. เดินหน้า LINE LIFF ต่อ (rich menu link map, chat transaction flow)
