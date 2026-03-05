# 🔐 ระบบผู้ใช้ MEERAK - คู่มือการตั้งค่า

## 📋 สรุประบบที่สร้าง

ระบบผู้ใช้ที่สมบูรณ์พร้อม Firebase Authentication integration:

### ✅ Features ที่สร้างแล้ว

1. **Firebase Authentication Integration**
   - Firebase Admin SDK setup
   - Token verification middleware
   - Custom claims สำหรับ role-based access

2. **User Management**
   - สมัครสมาชิก (Register)
   - เข้าสู่ระบบ (Login)
   - ดึงข้อมูลโปรไฟล์
   - อัพเดทโปรไฟล์
   - KYC level management

3. **Wallet System**
   - Wallet summary (balance, pending)
   - Deposit (เพิ่มเงิน)
   - Withdraw (ถอนเงิน)
   - Transaction history
   - Pending balance management

4. **Skills & Certifications**
   - เพิ่ม/ลบ/อัพเดท Skills
   - เพิ่ม/ลบ Certifications
   - Skills verification

---

## 🚀 การติดตั้ง

### 1. ติดตั้ง Dependencies

```bash
cd backend
npm install firebase-admin
```

### 2. ตั้งค่า Environment Variables

เพิ่มในไฟล์ `.env`:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# หรือใช้ JSON string (ถ้าต้องการ)
# FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=meerak_db
DB_DATABASE=meerak_db
DB_USER=meerak_user
DB_PASSWORD=your_password

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Server
PORT=3001
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

### 3. ดาวน์โหลด Firebase Service Account Key

1. ไปที่ [Firebase Console](https://console.firebase.google.com/)
2. เลือกโปรเจกต์ของคุณ
3. ไปที่ **Project Settings** > **Service Accounts**
4. คลิก **Generate New Private Key**
5. บันทึกไฟล์ JSON
6. Copy ค่าจากไฟล์ JSON มาใส่ใน `.env`:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (ต้องมี `\n` ใน string)

---

## 📡 API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/register`
สมัครสมาชิกใหม่

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "phone": "0812345678",
  "fullName": "ชื่อ นามสกุล",
  "role": "user" // หรือ "provider"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "firebase_uid": "firebase-uid",
    "email": "user@example.com",
    "role": "user",
    "kyc_level": "level_1",
    "wallet_balance": 0,
    "wallet_pending": 0
  },
  "message": "Registration successful"
}
```

#### POST `/api/auth/login`
เข้าสู่ระบบ

**Request:**
```json
{
  "idToken": "firebase-id-token"
}
```

**Response:**
```json
{
  "success": true,
  "user": { /* user object */ },
  "message": "Login successful"
}
```

#### POST `/api/auth/verify`
Verify token และดึงข้อมูล user

**Headers:**
```
Authorization: Bearer <firebase-id-token>
```

#### GET `/api/auth/me`
ดึงข้อมูล user ที่ login อยู่

**Headers:**
```
Authorization: Bearer <firebase-id-token>
```

---

### User Routes (`/api/users`)

#### GET `/api/users/profile/:id`
ดึง profile โดย ID หรือ Firebase UID

#### GET `/api/users/profile`
ดึง profile ของตัวเอง

**Headers:**
```
Authorization: Bearer <firebase-id-token>
```

#### PATCH `/api/users/profile`
อัพเดท profile

**Request:**
```json
{
  "full_name": "ชื่อใหม่",
  "phone": "0812345678",
  "avatar_url": "https://...",
  "location": {
    "lat": 13.736717,
    "lng": 100.523186
  }
}
```

---

### Wallet Routes (`/api/users/wallet`)

#### GET `/api/users/wallet/summary`
ดึง wallet summary

**Response:**
```json
{
  "available": 5000,
  "pending": 1000,
  "total": 6000,
  "recentTransactions": [...]
}
```

#### POST `/api/users/wallet/deposit`
เพิ่มเงินเข้า wallet

**Request:**
```json
{
  "amount": 1000,
  "description": "Top up wallet",
  "metadata": {}
}
```

#### POST `/api/users/wallet/withdraw`
ถอนเงินจาก wallet

**Request:**
```json
{
  "amount": 500,
  "description": "Withdrawal",
  "metadata": {}
}
```

#### GET `/api/users/wallet/transactions`
ดึง transaction history

**Query Parameters:**
- `limit` (default: 50)
- `offset` (default: 0)

---

### Skills Routes (`/api/users/skills`)

#### GET `/api/users/skills`
ดึง skills ของ user

#### POST `/api/users/skills`
เพิ่ม skill

**Request:**
```json
{
  "skill_name": "ขับรถ",
  "skill_category": "Transportation",
  "certification_id": "optional-cert-id"
}
```

#### PUT `/api/users/skills/:skillId`
อัพเดท skill

#### DELETE `/api/users/skills/:skillId`
ลบ skill

---

### Certifications Routes (`/api/users/certifications`)

#### GET `/api/users/certifications`
ดึง certifications ของ user

#### POST `/api/users/certifications`
เพิ่ม certification

**Request:**
```json
{
  "certification_name": "ใบขับขี่",
  "certification_type": "Driving License",
  "issuer": "กรมการขนส่ง",
  "certificate_url": "https://...",
  "issued_date": "2024-01-01",
  "expiry_date": "2029-01-01"
}
```

#### DELETE `/api/users/certifications/:certificationId`
ลบ certification

---

## 🔒 Authentication Flow

### Frontend Integration

```javascript
// 1. Login ด้วย Firebase Auth (Frontend)
import { signInWithEmailAndPassword, getIdToken } from 'firebase/auth';

const userCredential = await signInWithEmailAndPassword(auth, email, password);
const idToken = await getIdToken(userCredential.user);

// 2. ส่ง token ไป Backend
const response = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ idToken }),
});

const { user } = await response.json();

// 3. ใช้ token สำหรับ API calls อื่นๆ
const profileResponse = await fetch('http://localhost:3001/api/users/profile', {
  headers: {
    'Authorization': `Bearer ${idToken}`,
  },
});
```

---

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  kyc_level VARCHAR(50) DEFAULT 'level_1',
  kyc_status VARCHAR(50) DEFAULT 'not_submitted',
  wallet_balance DECIMAL(10,2) DEFAULT 0,
  wallet_pending DECIMAL(10,2) DEFAULT 0,
  avatar_url TEXT,
  location JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### User Skills Table
```sql
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  skill_category VARCHAR(255) NOT NULL,
  certification_id UUID,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### User Certifications Table
```sql
CREATE TABLE IF NOT EXISTS user_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  certification_name VARCHAR(255) NOT NULL,
  certification_type VARCHAR(255) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  certificate_url TEXT,
  issued_date DATE,
  expiry_date DATE,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Transactions Table
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  related_job_id UUID,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP
);
```

---

## 🧪 Testing

### Test Authentication

```bash
# Test health check
curl http://localhost:3001/health

# Test register (ต้องมี Firebase token ก่อน)
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "your-firebase-token",
    "phone": "0812345678",
    "fullName": "Test User"
  }'
```

---

## 📝 Notes

1. **Development Mode**: ถ้าไม่มี Firebase token ใน development mode จะใช้ mock user
2. **Redis Cache**: ระบบจะทำงานได้แม้ไม่มี Redis แต่จะไม่มี cache
3. **Error Handling**: ทุก endpoint มี error handling และ return error messages ที่ชัดเจน
4. **Security**: ใช้ Firebase token verification และ role-based access control

---

## 🐛 Troubleshooting

### Firebase Admin SDK Error
- ตรวจสอบว่า environment variables ถูกต้อง
- ตรวจสอบว่า private key มี `\n` ใน string
- ตรวจสอบว่า service account มี permissions ที่ถูกต้อง

### Database Connection Error
- ตรวจสอบว่า PostgreSQL กำลังทำงาน
- ตรวจสอบ connection string ใน `.env`
- ตรวจสอบว่า database และ user ถูกสร้างแล้ว

### Redis Connection Error
- Redis เป็น optional - ระบบจะทำงานได้แม้ไม่มี Redis
- ถ้าต้องการใช้ cache ให้ติดตั้งและตั้งค่า Redis

---

## ✅ Checklist

- [x] Firebase Admin SDK integration
- [x] Authentication middleware
- [x] User service
- [x] Wallet service
- [x] Skills & Certifications service
- [x] User controller
- [x] Auth controller
- [x] Routes setup
- [x] Error handling
- [x] Redis cache support
- [x] Database schema documentation

---

**สร้างโดย:** MEERAK Development Team  
**วันที่:** 2026-01-27
