# ✅ Thai ID Auto-Load from KYC Verification

## 🎯 **สิ่งที่เพิ่มแล้ว:**

### **1. ฟิลด์ใหม่ใน UserProfile** 📝

```typescript
// types.ts - เพิ่มใน UserProfile interface
national_id?: string;                        // เลขบัตรประชาชน
id_card_front_url?: string;                  // รูปบัตรหน้า
id_card_back_url?: string;                   // รูปบัตรหลัง
driver_license_number?: string;              // เลขใบขับขี่
driver_license_photo_url?: string;           // รูปใบขับขี่
driver_license_expiry?: string;              // วันหมดอายุใบขับขี่
vehicle_license_plate?: string;              // ทะเบียนรถ
vehicle_registration_photo_url?: string;     // รูปเล่มทะเบียนรถ
```

### **2. Auto-Load Function** ⚡

```typescript
// Load KYC data from user profile
const loadKYCData = async () => {
  if (!user) return;

  try {
    // Priority: Settings fields > KYC docs > Legacy fields
    const national_id =
      user.national_id || user.kyc_id_card_number || user.id_card_number || "";

    const id_card_front =
      user.id_card_front_url || user.kyc_docs?.id_card_front || null;

    const id_card_back =
      user.id_card_back_url || user.kyc_docs?.id_card_back || null;

    const driver_license_photo =
      user.driver_license_photo_url ||
      user.kyc_docs?.driving_license_front ||
      null;

    setThaiIDForm({
      national_id,
      id_card_front,
      id_card_back,
      driver_license_number: user.driver_license_number || "",
      driver_license_photo,
      driver_license_expiry: user.driver_license_expiry || "",
      vehicle_license_plate: user.vehicle_license_plate || "",
      vehicle_registration_photo: user.vehicle_registration_photo_url || null,
    });

    console.log("✅ Loaded KYC data");
  } catch (error) {
    console.error("❌ Error loading KYC data:", error);
  }
};
```

### **3. Auto-Trigger on Modal Open** 🔄

```typescript
// Load KYC data when Thai ID modal opens
useEffect(() => {
  if (activeModal === "thai_id" && user) {
    loadKYCData();
  }
}, [activeModal, user]);
```

### **4. Save Function** 💾

```typescript
onClick={async () => {
  try {
    // Save to user profile
    const updatedUser = await MockApi.updateProfile({
      national_id: thaiIDForm.national_id,
      id_card_front_url: thaiIDForm.id_card_front,
      id_card_back_url: thaiIDForm.id_card_back,
      driver_license_number: thaiIDForm.driver_license_number,
      driver_license_photo_url: thaiIDForm.driver_license_photo,
      driver_license_expiry: thaiIDForm.driver_license_expiry,
      vehicle_license_plate: thaiIDForm.vehicle_license_plate,
      vehicle_registration_photo_url: thaiIDForm.vehicle_registration_photo
    });

    if (token) login(updatedUser, token);
    notify('✅ บันทึกข้อมูลสำเร็จ', 'success');
    setActiveModal(null);
  } catch (error) {
    notify('❌ บันทึกข้อมูลไม่สำเร็จ', 'error');
  }
}}
```

---

## 🔄 **Data Flow:**

### **Step 1: User Verify KYC (KYCWizard)**

```
KYCWizard → submitKYCLite() → Save to Firestore
├── national_id_encrypted
├── documents[] (id_card_front, id_card_back)
├── driver_license (optional)
└── vehicles[] (optional)
```

### **Step 2: Load KYC Data (Settings)**

```
Settings → Open Thai ID Modal → loadKYCData()
├── Read from user.national_id
├── Read from user.kyc_docs
├── Read from user.driver_license_number
└── Pre-fill form
```

### **Step 3: Display in Form**

```
Thai ID Form (Pre-filled)
├── ✅ เลขบัตรประชาชน: 1234567890123
├── ✅ บัตรหน้า: [รูปที่อัปโหลดไว้]
├── ✅ บัตรหลัง: [รูปที่อัปโหลดไว้]
├── ✅ เลขใบขับขี่: 12345678
└── ✅ เลขทะเบียนรถ: กก 1234 กทม
```

---

## 📊 **Data Priority:**

### **National ID:**

```
1. user.national_id (Settings)
2. user.kyc_id_card_number (KYC)
3. user.id_card_number (Legacy)
```

### **ID Card Photos:**

```
1. user.id_card_front_url (Settings)
2. user.kyc_docs?.id_card_front (KYC)
```

### **Driver License:**

```
1. user.driver_license_number (Settings)
2. user.driver_license_photo_url (Settings)
3. user.kyc_docs?.driving_license_front (KYC)
```

---

## 🎯 **User Experience:**

### **Scenario 1: First Time User**

```
1. Go to Settings → Thai ID
2. Form is empty
3. Fill manually
4. Save
```

### **Scenario 2: After KYC Verification**

```
1. Complete KYC Wizard
2. Go to Settings → Thai ID
3. Form is PRE-FILLED ✅
4. Can edit if needed
5. Save to update
```

### **Scenario 3: Already Saved**

```
1. Go to Settings → Thai ID
2. Form shows saved data
3. Can edit
4. Save updates
```

---

## 🔍 **Console Logs:**

### **Success:**

```javascript
✅ Loaded KYC data: {
  has_national_id: true,
  has_id_front: true,
  has_id_back: true,
  has_driver_license: true,
  has_vehicle: true
}
```

### **Empty:**

```javascript
✅ Loaded KYC data: {
  has_national_id: false,
  has_id_front: false,
  has_id_back: false,
  has_driver_license: false,
  has_vehicle: false
}
```

---

## ✅ **Benefits:**

### **1. No Duplicate Entry:**

```
✓ ไม่ต้องกรอกซ้ำ
✓ ดึงข้อมูลจาก KYC มาใช้
✓ Edit ได้ตามต้องการ
```

### **2. Centralized Storage:**

```
✓ เก็บข้อมูลที่เดียว (UserProfile)
✓ Sync ระหว่าง KYC และ Thai ID
✓ ง่ายต่อการจัดการ
```

### **3. Better UX:**

```
✓ Auto-fill form
✓ Show verified data
✓ Edit anytime
```

---

## 🧪 **Testing:**

### **Test Case 1: No KYC Data**

```bash
1. New user (no KYC)
2. Go to Settings → Thai ID
3. Form is empty
4. Fill manually
5. Save
6. Reopen → See saved data ✅
```

### **Test Case 2: After KYC Verification**

```bash
1. Complete KYC Wizard
2. Submit with:
   - National ID: 1234567890123
   - ID photos
   - Driver license
   - Vehicle
3. Go to Settings → Thai ID
4. Form is PRE-FILLED with KYC data ✅
```

### **Test Case 3: Edit Existing Data**

```bash
1. Open Thai ID (pre-filled)
2. Change vehicle plate: กก 5678
3. Save
4. Reopen
5. See updated data ✅
```

---

## 🎨 **UI Indicators:**

### **Empty State:**

```
┌──────────────────────────────┐
│ Thai ID & Documents          │
├──────────────────────────────┤
│ เลขบัตร: [____________]     │ Empty
│ [📷 อัปโหลด] [📷 อัปโหลด]  │ No images
└──────────────────────────────┘
```

### **Pre-filled State:**

```
┌──────────────────────────────┐
│ Thai ID & Documents          │
├──────────────────────────────┤
│ เลขบัตร: [1234567890123]   │ ← From KYC
│ [✓ บัตรหน้า] [✓ บัตรหลัง] │ ← Has images
└──────────────────────────────┘
```

---

## 📝 **Summary:**

```
✅ เพิ่มฟิลด์ใน UserProfile (8 fields)
✅ เพิ่ม loadKYCData() function
✅ Auto-load เมื่อเปิด modal
✅ Priority system (Settings > KYC > Legacy)
✅ Save function เชื่อมต่อ MockApi
✅ Console logs สำหรับ debug
✅ Pre-fill form ด้วยข้อมูล KYC
```

---

## 🚀 **How It Works:**

```
User Flow:
┌─────────────┐
│ KYC Wizard  │ → Submit verification
└──────┬──────┘
       ↓
┌─────────────┐
│  Firestore  │ → Save KYC data
└──────┬──────┘
       ↓
┌─────────────┐
│   Settings  │ → Load from profile
│  Thai ID    │
└──────┬──────┘
       ↓
┌─────────────┐
│ Pre-filled  │ → Show data ✅
│    Form     │
└─────────────┘
```

---

**ลองเลยครับ!** 🎉

```bash
# Test Flow:
1. Complete KYC Wizard (fill all data)
2. Go to Settings
3. Click "Thai ID & Documents"
4. See form PRE-FILLED with your KYC data! ✅
```

---

**Last Updated:** 2026-01-28 21:00
**Status:** ✅ READY
**Feature:** Auto-load KYC data into Thai ID form
