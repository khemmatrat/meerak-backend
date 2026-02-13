# ✅ Frontend API URL Updated

## สิ่งที่แก้ไขแล้ว

### 1. `.env`
```diff
- REACT_APP_API_BASE_URL=http://localhost:3001
+ REACT_APP_API_BASE_URL=https://meerak-backend.onrender.com
```

### 2. `.env.local`
```diff
- REACT_APP_API_BASE_URL=http://localhost:4000
+ REACT_APP_API_BASE_URL=https://meerak-backend.onrender.com

- REACT_APP_API_URL=http://localhost:5001/...
+ REACT_APP_API_URL=https://meerak-backend.onrender.com

- REACT_APP_USE_MOCK=true
+ REACT_APP_USE_MOCK=false

- REACT_APP_USE_BACKEND=false
+ REACT_APP_USE_BACKEND=true

- REACT_APP_BACKEND_URL=http://localhost:3001
+ REACT_APP_BACKEND_URL=https://meerak-backend.onrender.com
```

### 3. `.env.production`
```diff
- REACT_APP_API_URL=https://us-central1-meerak-project.cloudfunctions.net/api
+ REACT_APP_API_URL=https://meerak-backend.onrender.com
```

---

## ขั้นตอนต่อไป

### 1. Restart Frontend
```bash
# หยุด frontend
Ctrl+C

# รันใหม่เพื่อโหลด .env ใหม่
npm start
```

### 2. ทดสอบการเชื่อมต่อ
- เปิด browser console (F12)
- ดูว่า API calls ไปที่ `https://meerak-backend.onrender.com` แล้ว
- ตรวจสอบว่าไม่มี CORS errors

### 3. ทดสอบ Features
- ✅ Login/Register
- ✅ Profile fetch
- ✅ Job listing
- ✅ สร้างงานใหม่

---

## หมายเหตุ

### ถ้ายังเจอ localhost
อาจมีไฟล์อื่นที่ hardcode URL ไว้:
- Check `src/config.ts`
- Check `src/api/`
- Check component files

### ถ้าเจอ CORS Error
ต้องแก้ CORS ใน backend:
```javascript
// server.js
app.use(cors({
  origin: ['https://your-frontend-url.com', 'http://localhost:3000'],
  credentials: true
}));
```

---

**สถานะ:** ✅ แก้เสร็จแล้ว  
**อัพเดท:** 2026-01-27 17:15  
**Action Required:** Restart frontend
