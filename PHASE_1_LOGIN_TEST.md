# 🧪 Phase 1: Login OTP Testing Guide

## เตรียมตัวก่อนทดสอบ

### 1. เปิด Browser Console
- กด `F12` หรือ `Ctrl+Shift+I` (Windows)
- กด `Cmd+Option+I` (Mac)
- ไปที่แท็บ **Console**

### 2. เปิด Application Tab (ดู localStorage)
- กด `F12` → แท็บ **Application**
- ทางซ้ายไปที่ **Local Storage** → `http://localhost:5173`

---

## 🎯 Test Case 1: OTP Login (User ใหม่)

### ขั้นตอน:

1. **ไปที่หน้า Login**
   ```
   http://localhost:5173/login
   ```

2. **กรอกเบอร์โทรศัพท์**
   ```
   +66812345678
   ```
   หรือเบอร์อะไรก็ได้

3. **กด "Send OTP"**
   
   ✅ **ควรเห็น:**
   - UI เปลี่ยนเป็นหน้า "Enter OTP"
   - เห็นข้อความ "OTP sent to +66812345678"
   - เห็น countdown timer (5:00)

4. **ดู OTP Code ใน Console**
   
   ✅ **ควรเห็นข้อความแบบนี้:**
   ```
   📱 SMS OTP to +66812345678: 123456
   ⏱️ Expires in 5 minutes
   ```

5. **กรอก OTP Code**
   ```
   123456
   ```
   (ดู code จาก console)

6. **เลือก "Trust this device" (Optional)**
   - ✅ Check = จำ device นี้ 30 วัน
   - ❌ Uncheck = ต้อง OTP ทุกครั้ง

7. **กด "Verify & Login"**

   ✅ **ควรเห็น:**
   - Console แสดง:
     ```
     ✅ OTP verified for phone: +66812345678
     🆕 New user - auto registering
     ✅ Auto-registered new user: user_xxxxx
     ✅ Device trusted for 30 days (ถ้าเลือก trust)
     ✅ Login complete
     ```
   - Redirect ไปหน้า Dashboard
   - ดู Local Storage จะมี:
     - `meerak_access_token`
     - `meerak_refresh_token`
     - `meerak_device_id`
     - `meerak_token`
     - `meerak_user_id`

---

## 🎯 Test Case 2: Trusted Device Login (ครั้งที่ 2)

### เงื่อนไข:
- ต้องทำ Test Case 1 ก่อน
- ต้องเลือก "Trust this device"
- ใช้ browser เดิม (device_id เดิม)

### ขั้นตอน:

1. **Logout ก่อน**
   - ไปที่ Settings → Logout
   - หรือ clear localStorage ยกเว้น `meerak_device_id`

2. **กลับมาหน้า Login**
   ```
   http://localhost:5173/login
   ```

3. **กรอกเบอร์เดิม**
   ```
   +66812345678
   ```

4. **กด "Send OTP"**

   ✅ **ควรเห็น:**
   - Console แสดง:
     ```
     ✅ Trusted device - skip OTP
     ✅ Login complete
     ```
   - **ข้ามหน้า OTP ทันที!**
   - Redirect ไปหน้า Dashboard เลย
   - ไม่ต้องกรอก OTP

---

## 🎯 Test Case 3: OTP ผิด (Failed Verification)

### ขั้นตอน:

1. **Request OTP ตาม Test Case 1**

2. **กรอก OTP ผิด**
   ```
   999999
   ```

3. **กด "Verify & Login"**

   ✅ **ควรเห็น:**
   - Error message สีแดง: "Invalid OTP"
   - Console แสดง:
     ```
     ❌ Invalid OTP code
     Attempts: 1/3
     ```
   - ยังอยู่หน้า OTP
   - ลองใหม่ได้ (max 3 attempts)

---

## 🎯 Test Case 4: OTP Expired

### ขั้นตอน:

1. **Request OTP**

2. **รอ 5+ นาที** (หรือแก้ code ให้ expire เร็วขึ้น)

3. **กรอก OTP (ถึงจะถูกก็ตาม)**

   ✅ **ควรเห็น:**
   - Error: "OTP expired"
   - Console แสดง:
     ```
     ❌ OTP expired
     ```

4. **กด "Didn't receive code? Send again"**
   - กลับไปหน้ากรอกเบอร์
   - Request OTP ใหม่ได้

---

## 🎯 Test Case 5: Rate Limiting

### ขั้นตอน:

1. **Request OTP 3 ครั้งติดกัน** (เบอร์เดิม)

   ✅ **ครั้งที่ 1:** OK
   ✅ **ครั้งที่ 2:** OK
   ✅ **ครั้งที่ 3:** OK

2. **Request ครั้งที่ 4**

   ✅ **ควรเห็น:**
   - Error: "Too many OTP requests. Please try again later."
   - Console แสดง:
     ```
     ❌ Rate limit exceeded for OTP request
     Try again in: 3600 seconds
     ```

---

## 🎯 Test Case 6: Demo Login (ไม่ผ่าน OTP)

### ขั้นตอน:

1. **กดปุ่ม "Anna (Employer)"**

   ✅ **ควรเห็น:**
   - Login ทันที (ไม่ต้อง OTP)
   - Redirect ไปหน้า Employer Dashboard
   - Console แสดง:
     ```
     ✅ Demo login: Anna (Employer)
     ```

2. **กดปุ่ม "Bob (Provider)"**

   ✅ **ควรเห็น:**
   - Login ทันที
   - Redirect ไปหน้า Provider Dashboard
   - Console แสดง:
     ```
     ✅ Demo login: Bob (Provider)
     ```

---

## 🔍 ตรวจสอบ Firebase Console

### 1. เปิด Firebase Console
```
https://console.firebase.google.com/
```

### 2. เลือก Project "Meerak"

### 3. ไปที่ Firestore Database

### 4. ตรวจสอบ Collections ใหม่:

#### `otp_records` (OTP logs)
```javascript
{
  id: "otp_1706360400_abc123",
  phone: "+66812345678",
  code: "123456",  // Hashed ใน production
  type: "login",
  status: "verified",
  expires_at: "2026-01-27T10:20:00Z",
  attempts: 1,
  max_attempts: 3,
  device_id: "device_1706360400_xyz789",
  created_at: "2026-01-27T10:15:00Z"
}
```

#### `devices` (Trusted devices)
```javascript
{
  id: "device_1706360400_xyz789",
  user_id: "user_1706360400_abc123",
  device_name: "Chrome",
  platform: "web",
  is_trusted: true,
  trust_expires_at: "2026-02-26T10:15:00Z",
  last_login_at: "2026-01-27T10:15:00Z",
  created_at: "2026-01-27T10:15:00Z"
}
```

#### `sessions` (Active sessions)
```javascript
{
  id: "session_1706360400_def123",
  user_id: "user_1706360400_abc123",
  device_id: "device_1706360400_xyz789",
  access_token: "mock_eyJ1c2VyX2lkIjoi...",
  refresh_token: "mock_eyJ1c2VyX2lkIjoi...",
  is_active: true,
  expires_at: "2026-02-26T10:15:00Z",
  created_at: "2026-01-27T10:15:00Z"
}
```

#### `rate_limits` (Rate limiting)
```javascript
{
  id: "otp_phone:+66812345678",
  count: 3,
  window_start: "2026-01-27T10:00:00Z",
  window_end: "2026-01-27T11:00:00Z",
  blocked_until: null
}
```

#### `users` (Auto-registered users)
```javascript
{
  id: "user_1706360400_abc123",
  phone: "+66812345678",
  name: "User 5678",
  email: "user5678@meerak.app",
  role: "USER",
  wallet_balance: 0,
  created_at: "2026-01-27T10:15:00Z"
}
```

---

## 🧹 Clear Test Data

### วิธีที่ 1: Clear localStorage
```javascript
// ใน Browser Console
localStorage.clear();
```

### วิธีที่ 2: Clear Firestore (ระวัง! ลบหมด)
```javascript
// ใน Browser Console (ต้อง import function ก่อน)

// ลบ OTP records
const otpQuery = query(collection(db, 'otp_records'));
const otpSnapshot = await getDocs(otpQuery);
otpSnapshot.forEach(async (doc) => {
  await deleteDoc(doc.ref);
});

// ลบ sessions
const sessionsQuery = query(collection(db, 'sessions'));
const sessionsSnapshot = await getDocs(sessionsQuery);
sessionsSnapshot.forEach(async (doc) => {
  await deleteDoc(doc.ref);
});

// ลบ devices
const devicesQuery = query(collection(db, 'devices'));
const devicesSnapshot = await getDocs(devicesQuery);
devicesSnapshot.forEach(async (doc) => {
  await deleteDoc(doc.ref);
});

// ลบ rate_limits
const rateLimitsQuery = query(collection(db, 'rate_limits'));
const rateLimitsSnapshot = await getDocs(rateLimitsQuery);
rateLimitsSnapshot.forEach(async (doc) => {
  await deleteDoc(doc.ref);
});

console.log('✅ Test data cleared');
```

### วิธีที่ 3: Manual (Firebase Console)
1. ไปที่ Firebase Console
2. Firestore Database
3. ลบ documents ใน collections:
   - `otp_records`
   - `sessions`
   - `devices`
   - `rate_limits`

---

## 🐛 Common Issues & Solutions

### Issue 1: OTP ไม่แสดงใน Console
**Solution:**
- ตรวจสอบว่าเปิด Console แล้ว
- ตรวจสอบว่าไม่มี filter ใน Console
- ดู `otpService.ts` → function `sendSMS` → มี `console.log` หรือไม่

### Issue 2: "Session not found" error
**Solution:**
```javascript
// Clear localStorage
localStorage.clear();
// Refresh page
location.reload();
```

### Issue 3: "Device not trusted" แต่เพิ่ง trust ไป
**Solution:**
- ตรวจสอบว่า device_id เดิมหรือไม่:
  ```javascript
  console.log(localStorage.getItem('meerak_device_id'));
  ```
- ถ้าเปลี่ยน browser/incognito จะได้ device_id ใหม่

### Issue 4: Firestore permission denied
**Solution:**
- ไปที่ Firebase Console → Firestore → Rules
- เปลี่ยน rules เป็น:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true; // ⚠️ DEV ONLY!
      }
    }
  }
  ```

### Issue 5: "Token expired" ทันที
**Solution:**
- ตรวจสอบเวลาของระบบ
- ตรวจสอบว่า `TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY` ถูกต้อง

---

## ✅ Success Checklist

- [ ] Test Case 1: OTP Login (New User) - ✅ Pass
- [ ] Test Case 2: Trusted Device Login - ✅ Pass
- [ ] Test Case 3: Wrong OTP - ✅ Pass
- [ ] Test Case 4: OTP Expired - ✅ Pass
- [ ] Test Case 5: Rate Limiting - ✅ Pass
- [ ] Test Case 6: Demo Login - ✅ Pass
- [ ] Firebase: `otp_records` created - ✅ Pass
- [ ] Firebase: `devices` created - ✅ Pass
- [ ] Firebase: `sessions` created - ✅ Pass
- [ ] Firebase: `rate_limits` created - ✅ Pass
- [ ] Firebase: `users` auto-created - ✅ Pass
- [ ] localStorage: tokens saved - ✅ Pass
- [ ] localStorage: device_id saved - ✅ Pass

---

## 📊 Quick Test Script (Copy-Paste ใน Console)

```javascript
// ทดสอบเร็วๆ
const testOTP = async () => {
  console.log('🧪 Starting OTP Test...');
  
  // 1. Check device ID
  const deviceId = localStorage.getItem('meerak_device_id');
  console.log('📱 Device ID:', deviceId);
  
  // 2. Check tokens
  const accessToken = localStorage.getItem('meerak_access_token');
  const refreshToken = localStorage.getItem('meerak_refresh_token');
  console.log('🔑 Access Token:', accessToken ? '✅ Found' : '❌ Not found');
  console.log('🔑 Refresh Token:', refreshToken ? '✅ Found' : '❌ Not found');
  
  // 3. Decode mock token
  if (accessToken && accessToken.startsWith('mock_')) {
    try {
      const payload = JSON.parse(atob(accessToken.substring(5)));
      console.log('📦 Token Payload:', payload);
      
      const now = Date.now();
      const expired = payload.exp < now;
      console.log('⏱️ Token Status:', expired ? '❌ Expired' : '✅ Valid');
      console.log('⏱️ Expires in:', Math.floor((payload.exp - now) / 1000), 'seconds');
    } catch (e) {
      console.error('❌ Failed to decode token:', e);
    }
  }
  
  console.log('✅ Test complete!');
};

// Run test
testOTP();
```

---

## 🎯 Next Steps

หลังจากทดสอบเสร็จแล้ว:

1. ✅ **Phase 0 & 1 Complete!**
2. 📝 Update `PHASE_1_COMPLETE.md`
3. 🚀 พร้อมไป Phase 2: KYC

---

**หมายเหตุ:**
- OTP code ตอนนี้แสดงใน console เพื่อความสะดวกในการทดสอบ
- สำหรับ production ต้องส่ง SMS/Email จริงๆ ผ่าน Twilio/AWS SNS
- Mock JWT tokens ใช้ได้เฉพาะ development
- Production ต้องสร้าง JWT ที่ backend และ sign ด้วย secret key

**มีปัญหาการทดสอบแจ้งได้เลย!** 🚀
