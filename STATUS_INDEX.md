# STATUS_INDEX.md

**Last Updated:** 2026-07-19  
**Purpose:** สารบัญสถานะทุก track — อ่านไฟล์นี้ก่อน `CURRENT_STATUS*.md` (ตาม `docs/aqond-os/AGENT_BOOTSTRAP.md`)

| Track | Status file | Read when | Notes |
|-------|-------------|-----------|-------|
| **Platform (default)** | [CURRENT_STATUS.md](./CURRENT_STATUS.md) | งานทั่วไป / handoff รวม | สรุปล่าสุดทุก track |
| Storefront / Merchant-Ad | `CURRENT_STATUS__STOREFRONT_MERCHANT_AD.md` | storefront, PDP, merchant ad | ⏳ ยังไม่สร้างไฟล์ |
| Jarvis Architecture | `CURRENT_STATUS__JARVIS_ARCHITECTURE.md` | Jarvis stack, sprint 31+ | ⏳ ยังไม่สร้างไฟล์ |
| Release / Production | [aqond-v2/docs/PROJECT_STATUS_CHECKLIST.md](./aqond-v2/docs/PROJECT_STATUS_CHECKLIST.md) | deploy, QA, release gate | Food OS gate + COD P1 |
| Rider OS (code map) | [aqond-v2/docs/rider-os/IMPLEMENTATION_MAP.md](./aqond-v2/docs/rider-os/IMPLEMENTATION_MAP.md) | dispatch, COD, rider BFF | SSOT mapping |
| Talent OS (discovery) | [aqond-v2/docs/talent-os/00-TALENT-DISCOVERY.md](./aqond-v2/docs/talent-os/00-TALENT-DISCOVERY.md) | Talent lifecycle blueprint | TOS-0 / TOS-0.5 docs only |
| Agent bootstrap | [docs/aqond-os/AGENT_BOOTSTRAP.md](./docs/aqond-os/AGENT_BOOTSTRAP.md) | ทุก session เริ่มงาน | Tier-1 read order |

> เพิ่มแถวเมื่อมี track ใหม่ — **ห้าม** สร้าง `CURRENT_STATUS.md` หลายไฟล์โดยไม่มี suffix ยกเว้น root default นี้
