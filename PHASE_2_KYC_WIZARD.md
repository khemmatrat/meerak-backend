# 🎯 Phase 2: KYC Wizard - Step-by-Step Verification

## ✨ **Features Overview**

### **Multi-Step KYC Process:**
```
Step 1: Personal Info (ข้อมูลส่วนตัว)
  ├── ชื่อ-นามสกุล
  ├── เลขบัตรประชาชน (13 หลัก + validation)
  ├── วันเกิด
  └── ที่อยู่

Step 2: ID Card Upload (อัปโหลดบัตรประชาชน)
  ├── รูปบัตรด้านหน้า
  └── รูปบัตรด้านหลัง

Step 3: Selfie (ถ่ายรูปใบหน้า)
  └── รูปถ่ายใบหน้าตรง

Step 4: Driver License (ใบขับขี่ - ถ้ามี) ⭐ NEW!
  ├── เลขใบขับขี่
  ├── ประเภท (ชั่วคราว/ถาวร/สากล)
  ├── ชั้นใบขับขี่
  ├── วันหมดอายุ
  └── รูปใบขับขี่

Step 5: Vehicle Registration (ทะเบียนรถ - ถ้ามี) ⭐ NEW!
  ├── ทะเบียนรถ
  ├── ประเภทรถ (รถยนต์/มอเตอร์ไซค์/กระบะ)
  ├── ยี่ห้อ/รุ่น
  ├── ปีจดทะเบียน
  ├── สี
  ├── จังหวัด
  ├── รูปเล่มทะเบียนรถ
  ├── วันหมดอายุ พ.ร.บ.
  ├── ชื่อเจ้าของรถ
  └── ความสัมพันธ์กับเจ้าของ (ถ้าไม่ใช่เจ้าของ)

Step 6: Review & Submit (ตรวจสอบและส่งข้อมูล)
  └── สรุปข้อมูลทั้งหมดก่อนส่ง
```

---

## 🛡️ **Security Features**

### **1. Field-Level Encryption**
```typescript
// ข้อมูลที่เข้ารหัส:
- เลขบัตรประชาชน (national_id_encrypted)
- ชื่อ-นามสกุล (first_name_encrypted, last_name_encrypted)
- วันเกิด (date_of_birth_encrypted)
- ที่อยู่ (address_encrypted)
- เลขใบขับขี่ (license_number_encrypted)
- ทะเบียนรถ (license_plate_encrypted)
- เลขตัวถังรถ (chassis_number_encrypted)
- ชื่อเจ้าของรถ (owner_name_encrypted)
```

### **2. Thai National ID Validation**
```typescript
// Algorithm: Check digit validation
validateThaiID("1234567890123") → true/false

// Format: 13 digits with checksum
// Example: 1-2345-67890-12-3
```

### **3. Data Masking**
```typescript
// UI Display (masked):
National ID: 1-xxxx-xxxxx-xx-3
Phone: 08xxx5678
License Plate: กก xxxx กรุงเทพมหานคร
```

---

## 🚗 **Why Vehicle Registration?**

### **Fraud Prevention:**

1. **Anti-Impersonation (ป้องกันการสวมสิทธิ์)**
   - ตรวจสอบว่าผู้ขับเป็นเจ้าของรถหรือมีสิทธิ์ขับรถ
   - ป้องกันการยืมรถผู้อื่นมาใช้ในทางที่ผิด

2. **Legal Compliance (ถูกกฎหมาย)**
   - ตรวจสอบว่ารถมีเอกสารครบถ้วน
   - ตรวจสอบวันหมดอายุ พ.ร.บ.
   - ป้องกันการใช้รถผิดกฎหมาย

3. **Accountability (รับผิดชอบ)**
   - ระบุตัวตนผู้ขับได้ชัดเจน
   - ติดตามได้ในกรณีเกิดเหตุ
   - สร้างความน่าเชื่อถือ

4. **Insurance Protection (ประกันภัย)**
   - ตรวจสอบความคุ้มครอง
   - ลดความเสี่ยงทางกฎหมาย

---

## 📋 **New Data Types**

### **Driver License:**
```typescript
interface DriverLicense {
  id: string;
  license_number_encrypted: string;     // เลขใบขับขี่ (encrypted)
  license_number_hash: string;          // Hash for lookup
  license_type: string;                 // ชั่วคราว/ถาวร/สากล
  license_class: string[];              // ชั้น (รถยนต์, มอเตอร์ไซค์)
  issue_date: string;
  expiry_date: string;
  license_photo_url: string;
  status: 'active' | 'expired' | 'suspended';
}
```

### **Vehicle Registration:**
```typescript
interface VehicleRegistration {
  id: string;
  license_plate_encrypted: string;      // ทะเบียนรถ (encrypted)
  license_plate_hash: string;
  vehicle_type: 'car' | 'motorcycle' | 'truck' | 'other';
  vehicle_brand: string;                // Toyota, Honda, etc.
  vehicle_model: string;                // Camry, Civic, etc.
  vehicle_year: number;
  vehicle_color: string;
  vehicle_province: string;
  registration_book_photo_url: string;
  registration_expiry_date: string;
  owner_name_encrypted: string;         // ชื่อเจ้าของรถ (encrypted)
  is_owner: boolean;                    // เป็นเจ้าของรถเองหรือไม่
  relationship_to_owner?: string;       // ความสัมพันธ์ (ถ้าไม่ใช่เจ้าของ)
  status: 'active' | 'expired' | 'sold';
}
```

---

## 🎨 **UI/UX Improvements**

### **Before (Profile.tsx):**
```
❌ Single long form (scroll forever)
❌ Overwhelming amount of fields
❌ No progress indication
❌ Hard to navigate back
❌ No validation feedback
```

### **After (KYCWizard.tsx):**
```
✅ Step-by-step process (6 steps)
✅ Progress indicator (visual steps)
✅ One focus area per step
✅ Easy back/next navigation
✅ Real-time validation
✅ Clear instructions per step
✅ Preview before submit
```

---

## 🚀 **How to Use**

### **1. Import Component:**
```typescript
import { KYCWizard } from './pages/KYCWizard';
```

### **2. Add Route:**
```typescript
// In App.tsx or router config
<Route path="/kyc" element={<KYCWizard />} />
```

### **3. Navigate from Profile:**
```typescript
<button onClick={() => navigate('/kyc')}>
  ยืนยันตัวตน (KYC)
</button>
```

---

## 📸 **Screenshot Flow**

### **Step 1: Personal Info**
```
┌─────────────────────────────────┐
│  ข้อมูลส่วนตัว                 │
├─────────────────────────────────┤
│  [ชื่อจริง]  [นามสกุล]         │
│  [เลขบัตรประชาชน 13 หลัก]     │
│  [วันเกิด]                     │
│  [ที่อยู่]                      │
│                                 │
│  ℹ️ ข้อมูลจะถูกเข้ารหัสก่อนบันทึก │
└─────────────────────────────────┘
```

### **Step 2: ID Card**
```
┌─────────────────────────────────┐
│  อัปโหลดบัตรประชาชน            │
├─────────────────────────────────┤
│  [ด้านหน้า]  [ด้านหลัง]        │
│   📷 Upload    📷 Upload         │
│                                 │
│  💡 คำแนะนำ:                    │
│  - ถ่ายในที่มีแสงสว่าง           │
│  - บัตรต้องชัดเจน อ่านได้       │
└─────────────────────────────────┘
```

### **Step 4: Driver License (NEW!)**
```
┌─────────────────────────────────┐
│  ใบขับขี่ (ถ้ามี)              │
├─────────────────────────────────┤
│  ☑ ฉันมีใบขับขี่               │
│                                 │
│  [เลขใบขับขี่]                 │
│  [ประเภท: ถาวร ▼]              │
│  [วันหมดอายุ]                  │
│  [รูปใบขับขี่]                  │
│   📷 Upload                      │
└─────────────────────────────────┘
```

### **Step 5: Vehicle (NEW!)**
```
┌─────────────────────────────────┐
│  ทะเบียนรถ (ถ้ามี)             │
├─────────────────────────────────┤
│  ☑ ฉันมีรถยนต์/มอเตอร์ไซค์     │
│                                 │
│  ┌─ รถคันที่ 1 ────────────┐  │
│  │ [ทะเบียน: กก 1234 กทม]  │  │
│  │ [ประเภท: รถยนต์ ▼]      │  │
│  │ [ยี่ห้อ: Toyota]         │  │
│  │ [รุ่น: Camry]            │  │
│  │ ☑ ฉันเป็นเจ้าของรถคันนี้ │  │
│  └──────────────────────────┘  │
│                                 │
│  [+ เพิ่มรถอีกคัน]             │
│                                 │
│  🛡️ ป้องกันการสวมสิทธิ์และ    │
│     การใช้รถผิดกฎหมาย          │
└─────────────────────────────────┘
```

---

## ✅ **Validation Rules**

### **Step 1: Personal Info**
- ✅ First name: Required
- ✅ Last name: Required
- ✅ National ID: Required, 13 digits, valid checksum
- ✅ Date of birth: Required, < today
- ✅ Address: Required

### **Step 2: ID Card**
- ✅ Front photo: Required
- ✅ Back photo: Required
- ✅ Image format: JPG, PNG
- ✅ Max size: 5MB

### **Step 3: Selfie**
- ✅ Photo: Required
- ✅ Clear face visible

### **Step 4: Driver License (Optional)**
- If has license:
  - ✅ License number: Required
  - ✅ Expiry date: Required, > today
  - ✅ License photo: Required

### **Step 5: Vehicle (Optional)**
- If has vehicle:
  - ✅ At least 1 vehicle
  - ✅ License plate: Required
  - ✅ Brand/Model: Required
  - ✅ Registration book photo: Required
  - ✅ Owner info: Required if not owner

---

## 🧪 **Testing Guide**

### **Test Case 1: Complete KYC with All Options**
```
1. Go to /kyc
2. Fill personal info (valid Thai ID)
3. Upload ID card (front + back)
4. Upload selfie
5. ✅ Check "ฉันมีใบขับขี่"
   - Fill license number
   - Upload license photo
6. ✅ Check "ฉันมีรถยนต์/มอเตอร์ไซค์"
   - Add vehicle info
   - Upload registration book
7. Review all data
8. Submit
9. ✅ Check Firestore: kyc_records collection
```

### **Test Case 2: Minimal KYC (No License/Vehicle)**
```
1-4. Same as above
5. ❌ Skip driver license
6. ❌ Skip vehicle
7-9. Review and submit
```

### **Test Case 3: Multiple Vehicles**
```
1-4. Same as Test 1
5. Skip license
6. ✅ Check vehicle
   - Add 1st vehicle
   - Click "+ เพิ่มรถอีกคัน"
   - Add 2nd vehicle
7-9. Review and submit
```

---

## 📊 **Firestore Data Structure**

### **After Submission:**
```javascript
// Collection: kyc_records
{
  id: "kyc_1769602180000_abc123",
  user_id: "user_1769600571617_98xg5d",
  
  // Personal Info (ENCRYPTED)
  national_id_encrypted: "eyJhbGciOiJBMjU2R0NNIiwi...",
  national_id_hash: "abc123def456...",
  first_name_encrypted: "eyJhbGci...",
  last_name_encrypted: "eyJhbGci...",
  date_of_birth_encrypted: "eyJhbGci...",
  address_encrypted: "eyJhbGci...",
  
  // Documents
  documents: [
    {
      type: "thai_id_card",
      url: "https://res.cloudinary.com/..."
    },
    {
      type: "selfie",
      url: "https://res.cloudinary.com/..."
    }
  ],
  
  // Driver License (Optional)
  driver_license: {
    license_number_encrypted: "eyJhbGci...",
    license_number_hash: "xyz789...",
    license_type: "ถาวร",
    expiry_date: "2028-12-31",
    license_photo_url: "https://res.cloudinary.com/...",
    status: "active"
  },
  
  // Vehicles (Optional - Array)
  vehicles: [
    {
      id: "vehicle_001",
      license_plate_encrypted: "eyJhbGci...",
      license_plate_hash: "plate123...",
      vehicle_type: "car",
      vehicle_brand: "Toyota",
      vehicle_model: "Camry",
      vehicle_year: 2023,
      vehicle_color: "Silver",
      vehicle_province: "กรุงเทพมหานคร",
      registration_book_photo_url: "https://res.cloudinary.com/...",
      registration_expiry_date: "2027-06-30",
      owner_name_encrypted: "eyJhbGci...",
      is_owner: true,
      status: "active"
    }
  ],
  
  // Status
  kyc_level: 1,  // LITE
  kyc_status: "pending",
  submitted_at: "2026-01-28T12:30:00Z",
  
  // Audit
  created_at: "2026-01-28T12:30:00Z",
  updated_at: "2026-01-28T12:30:00Z"
}
```

---

## 🎯 **Next Steps**

### **Phase 2.1 (Current):**
- [x] KYC Wizard UI
- [x] Driver License registration
- [x] Vehicle registration
- [ ] Admin review dashboard

### **Phase 2.2:**
- [ ] Face matching AI
- [ ] ID card OCR extraction
- [ ] Auto-verify if confidence > 90%

---

## 🔗 **Files Created/Modified**

### **New Files:**
- `pages/KYCWizard.tsx` - Main wizard component (1000+ lines)
- `PHASE_2_KYC_WIZARD.md` - This documentation

### **Modified Files:**
- `types.ts` - Added DriverLicense & VehicleRegistration interfaces
- `utils/encryption.ts` - Encryption utilities
- `utils/dataMasking.ts` - Data masking utilities
- `services/kycService.ts` - KYC service functions

---

**Last Updated:** 2026-01-28
**Status:** ✅ READY FOR TESTING
**Security Level:** 🔒🔒🔒🔒🔒 (5/5 - Maximum)
