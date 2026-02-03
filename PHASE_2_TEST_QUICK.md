# 🧪 Phase 2: KYC Wizard - Quick Test Guide

## ⚡ **Quick Start (5 นาที)**

### **Step 1: รันโปรเจค**
```bash
npm run dev
```

### **Step 2: Login**
```
1. ไปที่ http://localhost:5173/login
2. กด "Anna (Employer)" หรือ "Bob (Provider)"
   (หรือ login ด้วย OTP)
```

### **Step 3: ไปหน้า Profile**
```
1. คลิกที่รูปโปรไฟล์ (มุมขวาบน)
2. เลือก "Profile" หรือ
3. ไปที่ http://localhost:5173/profile
```

### **Step 4: เปิดแท็บ Info**
```
1. ที่หน้า Profile คุณจะเห็นแท็บหลายแท็บ:
   - Info ← คลิกตรงนี้
   - Training
   - Reviews
   - Wallet
   
2. หา section "ยืนยันตัวตน (KYC)"
```

### **Step 5: คลิกปุ่ม "ยืนยันตัวตนเลย"**
```
คุณจะเห็นปุ่มสีน้ำเงิน-ม่วง:
┌──────────────────────────┐
│ 🛡️ ยืนยันตัวตนเลย      │
└──────────────────────────┘
```

---

## 📋 **Test Flow Complete:**

### **Step 1: ข้อมูลส่วนตัว**
```
✏️ กรอก:
- ชื่อจริง: สมชาย
- นามสกุล: ใจดี
- เลขบัตรประชาชน: 1234567890128 ← ใช้เลขนี้ (valid checksum)
- วันเกิด: 1990-01-01
- ที่อยู่: 123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110

✅ กด "ถัดไป"
```

### **Step 2: อัปโหลดบัตรประชาชน**
```
📷 อัปโหลดรูป:
- บัตรประชาชนด้านหน้า (คลิกกล่องแรก)
- บัตรประชาชนด้านหลัง (คลิกกล่องที่สอง)

💡 เลือกรูปอะไรก็ได้ (สำหรับทดสอบ)

✅ กด "ถัดไป"
```

### **Step 3: ถ่ายรูปใบหน้า**
```
📷 อัปโหลดรูป:
- รูปถ่ายใบหน้า (selfie)

💡 เลือกรูปอะไรก็ได้

✅ กด "ถัดไป"
```

### **Step 4: ใบขับขี่ (Optional)**
```
Option 1: ไม่มีใบขับขี่
  ❌ ไม่ต้อง check "ฉันมีใบขับขี่"
  ✅ กด "ถัดไป" ได้เลย

Option 2: มีใบขับขี่ (ทดสอบ)
  ☑️ Check "ฉันมีใบขับขี่"
  
  ✏️ กรอก:
  - เลขใบขับขี่: 12345678
  - ประเภท: ถาวร
  - วันหมดอายุ: 2028-12-31
  - อัปโหลดรูปใบขับขี่
  
  ✅ กด "ถัดไป"
```

### **Step 5: ทะเบียนรถ (Optional)**
```
Option 1: ไม่มีรถ
  ❌ ไม่ต้อง check "ฉันมีรถยนต์/มอเตอร์ไซค์"
  ✅ กด "ถัดไป" ได้เลย

Option 2: มีรถ (ทดสอบ) ⭐ NEW!
  ☑️ Check "ฉันมีรถยนต์/มอเตอร์ไซค์"
  
  ┌─ รถคันที่ 1 ────────────┐
  │ ทะเบียน: กก 1234 กทม   │
  │ ประเภท: รถยนต์          │
  │ ยี่ห้อ: Toyota          │
  │ รุ่น: Camry             │
  │ ปี: 2023                │
  │ สี: Silver              │
  │ จังหวัด: กรุงเทพมหานคร   │
  │ ☑️ ฉันเป็นเจ้าของรถคันนี้│
  └─────────────────────────┘
  
  💡 อยากเพิ่มอีกคัน? กด "+ เพิ่มรถอีกคัน"
  
  ✅ กด "ถัดไป"
```

### **Step 6: ตรวจสอบข้อมูล**
```
📋 ตรวจสอบข้อมูลทั้งหมด:
- ข้อมูลส่วนตัว ✅
- เอกสาร (รูปภาพ) ✅
- ใบขับขี่ (ถ้ามี) ✅
- รถยนต์ (ถ้ามี) ✅

🚀 กด "ส่งข้อมูล KYC"
```

---

## ✅ **Expected Results:**

### **1. Console Log:**
```javascript
✅ OTP request started
✅ OTP sent successfully
✅ Device registered successfully
✅ Tokens generated
✅ KYC submitted successfully
```

### **2. Alert Message:**
```
✅ ส่งข้อมูล KYC สำเร็จ! รอการตรวจสอบจากเจ้าหน้าที่
```

### **3. Redirect:**
```
→ กลับไปที่หน้า Profile อัตโนมัติ
```

### **4. Firestore Console:**
```
ไปตรวจสอบที่:
https://console.firebase.google.com/

→ Firestore Database
→ kyc_records collection
→ จะมี document ใหม่ที่มี:
  - national_id_encrypted (encrypted!)
  - first_name_encrypted (encrypted!)
  - documents: [...]
  - driver_license: {...} (ถ้ามี)
  - vehicles: [...] (ถ้ามี)
  - kyc_status: "pending"
```

---

## 🎯 **What to Look For:**

### **✅ ข้อมูลถูกเข้ารหัส:**
```javascript
// ❌ ห้ามเห็นแบบนี้:
national_id: "1234567890128"  // Plaintext!

// ✅ ต้องเห็นแบบนี้:
national_id_encrypted: "eyJhbGciOiJBMjU2R0NNIiwiaXYi..."
national_id_hash: "abc123def456..."
```

### **✅ Audit Log:**
```javascript
// Collection: audit_logs
{
  operation: "CREATE",
  table_name: "kyc_records",
  record_id: "kyc_xxx",
  user_id: "user_xxx",
  new_values: {
    national_id: "1-xxxx-xxxxx-xx-8",  // Masked in audit!
    ...
  }
}
```

---

## 🐛 **Troubleshooting:**

### **ปัญหา 1: ไม่เห็นปุ่ม "ยืนยันตัวตนเลย"**
**แก้ไข:**
```
1. Refresh หน้า (Ctrl+R)
2. ตรวจสอบว่าอยู่ที่แท็บ "Info"
3. Scroll ลงไปหา section KYC
4. ปุ่มจะอยู่ด้านบน มุมขวาของ section
```

### **ปัญหา 2: กด "Send OTP" แล้ว error**
**แก้ไข:**
```
1. ตรวจสอบ Console (F12)
2. ดูว่ามี error อะไร
3. อาจเป็น rate limit (รอ 1 ชั่วโมง)
4. หรือใช้ Demo Login แทน (Anna/Bob)
```

### **ปัญหา 3: อัปโหลดรูปไม่ได้**
**แก้ไข:**
```
1. ตรวจสอบว่ารูปเป็น JPG/PNG
2. ขนาดไม่เกิน 5MB
3. ดู Console error
4. ตรวจสอบ Cloudinary config
```

### **ปัญหา 4: เลขบัตรประชาชนไม่ valid**
**แก้ไข:**
```
ใช้เลขนี้สำหรับทดสอบ (valid checksum):
- 1234567890128 ← แนะนำ
- 1100700000003
- 1000000000018
```

---

## 📸 **Screenshots:**

### **1. Profile - Info Tab:**
```
┌─────────────────────────────────────┐
│ 🛡️ ยืนยันตัวตน (KYC)     [ยืนยัน]│
├─────────────────────────────────────┤
│ ℹ️ ยืนยันตัวตนเพื่อเพิ่มวงเงิน      │
│    และใช้งานฟีเจอร์เต็มรูปแบบ      │
└─────────────────────────────────────┘
```

### **2. KYC Wizard - Progress:**
```
┌─────────────────────────────────────┐
│  ①━━━━②━━━━③━━━━④━━━━⑤━━━━⑥         │
│  ข้อมูล บัตร รูป  ใบ   รถ  ตรวจสอบ│
│                                     │
│  ← ย้อนกลับ            ถัดไป →    │
└─────────────────────────────────────┘
```

### **3. Vehicle Registration (NEW!):**
```
┌─────────────────────────────────────┐
│ 🚗 ทะเบียนรถ (ถ้ามี)               │
├─────────────────────────────────────┤
│ ☑ ฉันมีรถยนต์/มอเตอร์ไซค์          │
│                                     │
│ ┌─ รถคันที่ 1 ───────────────────┐│
│ │ [ทะเบียน: กก 1234 กทม]        ││
│ │ [ประเภท: รถยนต์ ▼]            ││
│ │ [ยี่ห้อ/รุ่น: Toyota Camry]   ││
│ │ ☑ ฉันเป็นเจ้าของรถคันนี้       ││
│ └────────────────────────────────┘│
│                                     │
│ [+ เพิ่มรถอีกคัน]                  │
│                                     │
│ 🛡️ ป้องกันการสวมสิทธิ์และ         │
│    การใช้รถผิดกฎหมาย               │
└─────────────────────────────────────┘
```

---

## ⏱️ **Time Required:**

- ✅ **Minimal Test** (No License/Vehicle): ~3 minutes
- ✅ **Full Test** (With License): ~5 minutes
- ✅ **Complete Test** (With License + Vehicle): ~7 minutes

---

## 🎉 **Success Criteria:**

- [x] เห็นปุ่ม "ยืนยันตัวตนเลย" ในหน้า Profile
- [x] กดปุ่มแล้วไปหน้า KYC Wizard
- [x] เห็น progress indicator 6 steps
- [x] กรอกข้อมูลทุก step ได้
- [x] Validation ทำงาน (Thai ID checksum)
- [x] อัปโหลดรูปได้
- [x] เพิ่มใบขับขี่ได้ (optional)
- [x] เพิ่มทะเบียนรถได้ (optional)
- [x] เพิ่มรถได้หลายคัน
- [x] ตรวจสอบข้อมูลใน Step 6
- [x] ส่งข้อมูลสำเร็จ
- [x] ข้อมูลถูกเข้ารหัสใน Firestore
- [x] Audit log ถูกสร้าง

---

## 🚀 **Next Test:**

หลังจากทดสอบ KYC Wizard เสร็จ:

1. **Test Admin Review** (Phase 2.1 - ต่อไป)
   - Admin login
   - ดู KYC pending list
   - Approve/Reject KYC

2. **Test Face Matching** (Phase 2.2 - future)
   - AI face comparison
   - Auto-verify

---

**Last Updated:** 2026-01-28 19:30
**Status:** ✅ READY FOR TESTING
**Estimated Time:** 5-7 minutes
