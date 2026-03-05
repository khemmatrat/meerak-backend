# รัน Migration 013 (Financial Admin)

สร้างตาราง: `job_guarantees`, `financial_expenses`, `investors`, `market_cap_snapshots`

---

## วิธีที่ 1: ใช้ Node (แนะนำ — ใช้ได้บน Windows/Linux/Mac)

จากโฟลเดอร์ **backend** (ต้องมี `DATABASE_URL` ใน `backend/.env`):

```bash
cd backend
npm run migrate:financial
```

หรือเรียกสคริปต์โดยตรง (จาก root หรือจาก backend):

```bash
node backend/scripts/run-migration.js 013
# หรือจาก backend: node scripts/run-migration.js 013
```

---

## วิธีที่ 2: ใช้ psql โดยตรง

### ถ้ามี DATABASE_URL (เช่น Neon / connection string เดียว)

**Linux / Mac / Git Bash:**

```bash
cd backend
# โหลด .env ก่อน (หรือ export DATABASE_URL เอง)
export $(grep -v '^#' .env | xargs)
psql "$DATABASE_URL" -f db/migrations/013_financial_admin_tables.sql
```

**Windows (PowerShell):**

```powershell
cd backend
# ตั้งค่า DATABASE_URL จาก .env แล้วรัน (หรือใส่ connection string ตรงๆ)
$env:DATABASE_URL = "postgresql://user:password@host:port/dbname?sslmode=require"
psql $env:DATABASE_URL -f db\migrations\013_financial_admin_tables.sql
```

### ถ้าใช้ค่าแยก (จาก .env ระดับโปรเจกต์)

```bash
psql -h localhost -p 5432 -U meera -d meera_db -f backend/db/migrations/013_financial_admin_tables.sql
```

_(แก้ `-h -p -U -d` ให้ตรงกับ DB จริง)_

---

รันจาก **root โปรเจกต์** (`g:\meerak`): path ไฟล์คือ `backend/db/migrations/013_financial_admin_tables.sql`
