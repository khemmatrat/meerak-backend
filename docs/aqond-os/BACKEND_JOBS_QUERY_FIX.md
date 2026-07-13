# แก้ปัญหา Backend: รายละเอียดงาน + งานของ user (query/ข้อมูล)

## สอง endpoint ที่เกี่ยวข้อง

1. **รายละเอียดงาน:** `GET /api/jobs/:id` (เช่น `/api/jobs/job_123_abc`)
2. **งานของ user:** `GET /api/users/jobs/:userId` (เช่น `/api/users/jobs/demo-bob-id`)

---

## สิ่งที่ backend ทำอยู่แล้ว

- **GET /api/jobs/:id**  
  - ลอง `WHERE id = $1` ก่อน แล้วถ้าไม่เจอลอง `WHERE id::text = $1`
- **GET /api/users/jobs/:userId**  
  - ลอง `WHERE created_by = $1 OR accepted_by = $1`  
  - ถ้าได้ 0 แถว จะลอง `created_by::text = $1 OR accepted_by::text = $1`  
  - ถ้า query หลัก error (เช่น column ไม่มี) จะ fallback เป็น `SELECT id, title, description, category, price, status, created_by, created_at FROM jobs WHERE created_by = $1`
- ตอนสตาร์ท backend มี migration เพิ่ม column ในตาราง `jobs` (accepted_by, location, datetime ฯลฯ)

---

## เช็คที่ฝั่ง query/ข้อมูล

### 1. ให้ตาราง `jobs` มีและครบ column

รัน setup ให้ backend สร้าง/อัปเดต schema (เรียกครั้งเดียวหลัง deploy):

```http
GET http://localhost:3001/api/db/setup
```

หรือใน PostgreSQL ตรงๆ:

```sql
-- สร้างตารางถ้ายังไม่มี (หรือใช้จาก backend setup)
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  category VARCHAR(100),
  price DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'open',
  location TEXT,
  location_lat DECIMAL(10,6),
  location_lng DECIMAL(10,6),
  datetime TIMESTAMP,
  created_by VARCHAR(255),
  created_by_name VARCHAR(255),
  created_by_avatar TEXT,
  client_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  accepted_by VARCHAR(255),
  accepted_at TIMESTAMP,
  submitted_at TIMESTAMP,
  payment_details JSONB,
  payment_status VARCHAR(50),
  paid_at TIMESTAMP
);

-- ถ้าตารางมีอยู่แล้วแต่ขาด column ให้เพิ่ม
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS datetime TIMESTAMP;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
-- (ซ้ำกับที่ migration ใน server.js รันตอนสตาร์ท)
```

### 2. ตรวจว่ามีข้อมูลและค่า `created_by` ตรงกับที่เรียก

เปิด debug endpoint (มีใน backend แล้ว):

```http
GET http://localhost:3001/api/debug/jobs
```

จะได้ `rowCount` และ `sample` (ตัวอย่างแถวใน `jobs`) ดูว่า:

- มีแถวหรือไม่
- `created_by` เป็น string อะไร (เช่น `demo-bob-id`) — ต้องตรงกับ `:userId` ที่เรียก `GET /api/users/jobs/:userId`

### 3. ทดสอบสองเส้นนี้หลังแก้ schema/ข้อมูล

- รายละเอียดงาน (ใช้ `id` จริงจากตาราง `jobs`):

```http
GET http://localhost:3001/api/jobs/<id ของงานจริง>
```

- งานของ user (ใช้ userId เดียวกับที่ใช้ตอนสร้างงาน):

```http
GET http://localhost:3001/api/users/jobs/demo-bob-id
```

ถ้าสองอันนี้คืน 200 และ JSON ถูกต้อง แสดงว่าแก้ที่ query/ข้อมูลครบแล้ว แล้วค่อยไล่ต่อที่ frontend ถ้ายังไม่โผล่ใน UI.
