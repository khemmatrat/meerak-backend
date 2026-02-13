# แก้ปัญหา Demo Bob / Demo Anna (ยกเลิกงาน + เห็นงานที่โพสต์)

## 1. Demo Bob ยกเลิกงานไม่ได้ (Failed to cancel)

### ที่มีอยู่แล้วในโค้ด
- **Backend:** `POST /api/jobs/:id/cancel` — รับ `{ userId, reason? }` ตรวจว่าเป็นเจ้าของงาน แล้วอัปเดต `status = 'cancelled'`
- **Frontend:** `mockApi.cancelJob(jobId)` เรียก backend ก่อน ถ้า 404/403/400 จะ throw ข้อความจาก backend; ถ้า error อื่นจะลอง Firestore
- **JobDetails:** แสดง `err.message` (จาก backend หรือ "Job not found") แทนแค่ "Failed to cancel"

### ถ้ายังยกเลิกไม่ได้ ให้เช็ค
1. **Backend รันอยู่และ URL ถูก** — ตรวจว่า `REACT_APP_BACKEND_URL` หรือ `VITE_BACKEND_URL` ชี้ไปที่ backend เดียวกับที่รัน (เช่น `http://localhost:3001`)
2. **งานสร้างจาก Backend** — งานที่โพสต์ผ่าน POST /api/jobs จะมี id แบบ `job_xxx`. ถ้างานมีแค่ใน Firestore (id แบบ Firestore) การยกเลิกจะไปที่ Firestore
3. **userId ตรงกับเจ้าของ** — ตอนยกเลิกส่ง `userId` จาก `localStorage.getItem("meerak_user_id")` ต้องตรงกับ `created_by` ของงาน (demo-bob-id)
4. **สถานะงาน** — ยกเลิกได้เฉพาะ `open` หรือ `accepted`

---

## 2. Demo Anna ไม่เห็นงานที่ Demo Bob โพสต์ (ใน Find Jobs / รายการงานเปิด)

### ที่มีอยู่แล้วในโค้ด
- **Backend:** `GET /api/jobs` — query `SELECT * FROM jobs WHERE status = 'open'` แล้วคืน `rows.map(normalizeJobForApi)` (ไม่มี mock เมื่อ 0 แถว); ถ้า query error จะคืน `[]`
- **Frontend:** `mockApi.getJobs()` เรียก `GET /api/jobs` ก่อน แล้ว normalize (location, id, datetime, status); ถ้า backend error จะ fallback ไป Firestore
- **หน้า Jobs:** ใช้ `MockApi.getJobs(category, searchQuery)` แล้วแสดงรายการ ไม่มีการกรองว่า "ไม่แสดงงานของตัวเอง" — งานทุกคนที่ status open ควรโผล่

### ถ้า Demo Anna ยังไม่เห็นงาน ให้เช็ค
1. **ใช้ Backend ตัวเดียวกัน (สำคัญที่สุด)** — ทั้ง Demo Bob และ Demo Anna ต้องชี้ไป backend เดียวกัน (เช่น `REACT_APP_BACKEND_URL=http://localhost:3001/api`). ถ้า Bob โพสต์ที่ localhost แต่ Anna เปิดแอปที่ชี้ไป production (หรือคนละเครื่อง) รายการงานจะไม่โผล่ เพราะงานอยู่ใน DB ของ backend ที่ Bob ใช้เท่านั้น
2. **Backend คืนงานจริง** — เปิด DevTools → Network → โหลดหน้า Find Jobs ดู request `GET /api/jobs` ว่าได้ 200 และ body เป็น array ที่มีงาน (ไม่ใช่ `[]`). ใน Console ควรเห็น `[getJobs] Backend returned N job(s)...` ถ้าเห็น `[getJobs] Firebase fallback` แปลว่า request ไป backend ล้มเหลว จึงไปดึงจาก Firebase (งานที่ Bob โพสต์ผ่าน backend จะไม่มีใน Firebase)
3. **ตรวจว่า DB มีงาน** — เปิดใน browser: `http://localhost:3001/api/debug/open-jobs` (หรือ base URL ของ backend ที่ใช้) ดูว่า `count` > 0 และมี `created_by: "demo-bob-id"` ใน sample. ที่ backend log ควรเห็น `[GET /api/jobs] Returning N open job(s). Ids: [...]`
4. **Migration ตอนสตาร์ท** — ตอน backend สตาร์ทต้องมี log "Jobs table migration: columns ensured" และไม่มี error เรื่องตาราง `jobs`

---

## สรุป
- **ยกเลิก:** ใช้ backend ก่อน; ข้อความ error ที่แสดงจะมาจาก backend หรือ "Job not found" จาก Firestore
- **รายการงานเปิด:** ใช้ GET /api/jobs (งาน status = 'open' ทั้งหมด); ไม่ใช้ mock; error จาก query จะคืน `[]` แทน 500
