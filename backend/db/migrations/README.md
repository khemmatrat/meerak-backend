# วิธีรัน Migration (อัปเดตฐานข้อมูล)

โปรเจกต์นี้ **ไม่มีหน้า UI ในแอปให้กดรัน migration** — ต้องรันจาก **Terminal (คำสั่ง)** หรือใช้โปรแกรมจัดการฐานข้อมูล (เช่น pgAdmin, DBeaver) เอง

---

## รายการ Migration

| เลข | ไฟล์ | เรื่อง |
|-----|------|--------|
| 006 | `006_payment_ledger_audit.sql` | Ledger ชำระเงิน |
| 007 | `007_ledger_recon_audit.sql` | การกระทบยอด |
| 008 | `008_idempotency_and_ledger_invariants.sql` | Idempotency |
| 009 | `009_rbac_and_recon_uploads.sql` | RBAC |
| 010 | `010_admin_login_schema.sql` | Admin login |
| 011 | `011_user_account_status.sql` | สถานะบัญชีผู้ใช้ |
| 012 | `012_kyc_rejection_reason.sql` | KYC |
| 013 | `013_financial_admin_tables.sql` | ตารางการเงิน Admin |
| 014 | `014_audit_log_schema.sql` | Audit log |
| 015 | `015_kyc_reverify.sql` | KYC re-verify |
| 016 | `016_audit_append_only_and_job_disputes.sql` | Audit append-only + job_disputes |
| **017** | **`017_insurance_vault.sql`** | **คลังประกัน (insurance_settings, insurance_fund_movements)** |
| **018** | **`018_insurance_rate_by_category.sql`** | **อัตราประกันแยกตามหมวดงาน** |

---

## รันทุก migration 006–018 ตามลำดับ (แนะนำถ้ายังไม่เคยรัน)

รันทีเดียวตามลำดับเลข — แต่ละไฟล์ใช้ `CREATE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` จึงรันซ้ำได้โดยไม่ทับข้อมูลเดิม:

```bash
# จาก root โปรเจกต์ (g:\meerak)
npm run migrate:all
```

หรือระบุเลขเอง (จาก root):

```bash
node backend/scripts/run-migration.js 006 007 008 009 010 011 012 013 014 015 016 017 018
```

---

## วิธีที่ 1: ใช้สคริปต์ Node (จาก root โปรเจกต์)

ต้องมีตัวแปร DB ใน `backend/.env` (เช่น `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` หรือ `DATABASE_URL`)

```bash
# รันทีละไฟล์
node backend/scripts/run-migration.js 006
node backend/scripts/run-migration.js 017

# รันหลายไฟล์ตามลำดับ
node backend/scripts/run-migration.js 006 007 008 009 010 011 012 013 014 015 016 017 018
```

---

## วิธีที่ 2: ใช้ psql (ต้องติดตั้ง PostgreSQL client)

### Windows (PowerShell)

```powershell
# ไปที่ root โปรเจกต์
cd g:\meerak

# ถ้ามี DATABASE_URL ใน .env (backend หรือ root)
# ตั้งค่าแล้วรัน (แก้ connection string ตามจริง)
$env:PGPASSWORD = "รหัสผ่าน"
psql -h localhost -p 5432 -U postgres -d meera_db -f backend/db/migrations/017_insurance_vault.sql
psql -h localhost -p 5432 -U postgres -d meera_db -f backend/db/migrations/018_insurance_rate_by_category.sql
```

### Linux / Mac / Git Bash

```bash
cd /path/to/meerak
psql -h localhost -p 5432 -U postgres -d meera_db -f backend/db/migrations/017_insurance_vault.sql
psql -h localhost -p 5432 -U postgres -d meera_db -f backend/db/migrations/018_insurance_rate_by_category.sql
```

_(แก้ `-h -p -U -d` ให้ตรงกับฐานข้อมูลจริง)_

---

## วิธีที่ 3: ใช้ pgAdmin / DBeaver

1. เปิดโปรแกรมแล้วเชื่อมต่อกับฐานข้อมูลที่ Backend ใช้
2. เปิด Query Tool / SQL Editor
3. เปิดไฟล์ `backend/db/migrations/017_insurance_vault.sql` แล้วกด Run
4. เปิดไฟล์ `backend/db/migrations/018_insurance_rate_by_category.sql` แล้วกด Run

---

## สำหรับ Insurance (017 + 018)

ถ้าจะใช้ฟีเจอร์ **ประกันงาน** และ **ตั้งอัตราประกันแยกตามหมวด** ใน Nexus Admin ต้องรันอย่างน้อย:

- **017** — สร้างตาราง `insurance_settings`, `insurance_fund_movements`
- **018** — สร้างตาราง `insurance_rate_by_category` (ใช้ตอนกด "บันทึกอัตราต่อหมวด")

ถ้ายังไม่รัน 018 การกด "บันทึกอัตราต่อหมวด" ใน InsuranceManager จะ error และแจ้งให้รัน migration 018
