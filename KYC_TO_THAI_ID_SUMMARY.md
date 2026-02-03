# ✅ Summary: KYC → Thai ID Auto-Load

## 🎯 **สิ่งที่ทำเสร็จ:**

### **1. เพิ่มฟิลด์ใหม่ใน types.ts**

```typescript
// UserProfile interface
national_id?: string;
id_card_front_url?: string;
id_card_back_url?: string;
driver_license_number?: string;
driver_license_photo_url?: string;
driver_license_expiry?: string;
vehicle_license_plate?: string;
vehicle_registration_photo_url?: string;
```

### **2. Auto-Load Function**

```typescript
const loadKYCData = async () => {
  // Priority: Settings > KYC docs > Legacy
  const national_id = user.national_id
                   || user.kyc_id_card_number
                   || user.id_card_number;

  // Load images from KYC docs
  const id_card_front = user.id_card_front_url
                     || user.kyc_docs?.id_card_front;

  // Pre-fill form
  setThaiIDForm({ ... });
};
```

### **3. Trigger on Modal Open**

```typescript
useEffect(() => {
  if (activeModal === "thai_id" && user) {
    loadKYCData(); // Load when opened
  }
}, [activeModal, user]);
```

### **4. Visual Indicators**

```typescript
// Menu Item
<Item
  label="Thai ID & Documents"
  value={hasData ? '✓ มีข้อมูล' : ''}  // ← Show status
/>

// Modal Banner
{hasData && (
  <div className="bg-blue-50 ...">
    ✓ ข้อมูลจาก KYC: ดึงมาจากการยืนยันตัวตน
  </div>
)}
```

### **5. Save Function**

```typescript
await MockApi.updateProfile({
  national_id: thaiIDForm.national_id,
  id_card_front_url: thaiIDForm.id_card_front,
  // ... all fields
});
```

---

## 🎨 **UI Changes:**

### **Before:**

```
Settings → Thai ID & Documents
[Empty form]
```

### **After:**

```
Settings → Thai ID & Documents [✓ มีข้อมูล]

┌──────────────────────────────────┐
│ Thai ID & Documents          [×] │
├──────────────────────────────────┤
│ ℹ️ ✓ ข้อมูลจาก KYC:             │
│   ดึงมาจากการยืนยันตัวตน         │
├──────────────────────────────────┤
│ เลขบัตร: [1234567890123] ← PRE  │
│ [✓ บัตรหน้า] [✓ บัตรหลัง] ← PRE│
│ เลขใบขับขี่: [12345678] ← PRE   │
│ ทะเบียนรถ: [กก 1234] ← PRE      │
│                                  │
│ [บันทึกข้อมูล]                   │
└──────────────────────────────────┘
```

---

## 🔄 **Complete Flow:**

```
Step 1: User completes KYC
┌─────────────┐
│ KYC Wizard  │ → Fill: ID, Photos, License, Vehicle
└──────┬──────┘
       ↓
┌─────────────┐
│  Firestore  │ → Save encrypted data
└──────┬──────┘
       ↓

Step 2: User opens Settings
┌─────────────┐
│  Settings   │ → Click "Thai ID & Documents"
│  Menu       │   (shows "✓ มีข้อมูล")
└──────┬──────┘
       ↓
┌─────────────┐
│ Load Data   │ → loadKYCData()
│  Function   │   Priority: Settings > KYC > Legacy
└──────┬──────┘
       ↓
┌─────────────┐
│ Thai ID     │ → Form PRE-FILLED ✅
│  Modal      │   All data from KYC
└──────┬──────┘
       ↓

Step 3: User can edit/save
┌─────────────┐
│ Edit Form   │ → Change if needed
└──────┬──────┘
       ↓
┌─────────────┐
│ Save to DB  │ → updateProfile()
└──────┬──────┘
       ↓
┌─────────────┐
│ Updated ✅  │ → Next time shows new data
└─────────────┘
```

---

## 📊 **Data Sources (Priority):**

### **National ID:**

```
1️⃣ user.national_id           (Settings)
2️⃣ user.kyc_id_card_number    (KYC Wizard)
3️⃣ user.id_card_number         (Legacy)
```

### **ID Photos:**

```
1️⃣ user.id_card_front_url     (Settings)
2️⃣ user.kyc_docs.id_card_front (KYC Wizard)
```

### **Driver License:**

```
1️⃣ user.driver_license_number  (Settings)
2️⃣ user.driver_license_photo_url (Settings)
3️⃣ user.kyc_docs.driving_license_front (KYC)
```

---

## ✅ **Benefits:**

```
✓ ไม่ต้องกรอกซ้ำ
✓ ดึงข้อมูลจาก KYC อัตโนมัติ
✓ แสดง status "✓ มีข้อมูล"
✓ แสดง banner บอกที่มาของข้อมูล
✓ Edit ได้ตามต้องการ
✓ Save กลับไป user profile
✓ Sync ระหว่าง KYC และ Thai ID
```

---

## 🧪 **Test Scenarios:**

### **Scenario 1: New User (No KYC)**

```bash
1. New user account
2. Settings → Thai ID
3. No "✓ มีข้อมูล" badge
4. Form is empty
5. Fill manually
6. Save
7. Next time: See "✓ มีข้อมูล" ✅
```

### **Scenario 2: After KYC Verification**

```bash
1. Complete KYC Wizard:
   - National ID: 1234567890123
   - ID photos: ✓
   - Driver license: 12345678
   - Vehicle: กก 1234

2. Settings → Thai ID
3. See "✓ มีข้อมูล" badge ✅
4. See blue info banner ✅
5. Form PRE-FILLED with all data ✅
6. Can edit if needed
7. Save updates
```

### **Scenario 3: Mixed Data (Partial KYC)**

```bash
1. User has:
   - National ID from KYC ✓
   - No driver license ✗
   - No vehicle ✗

2. Settings → Thai ID
3. Form shows:
   - National ID: PRE-FILLED ✅
   - Driver license: Empty (can add)
   - Vehicle: Empty (can add)

4. Add driver license manually
5. Save
6. Next time: All data present ✅
```

---

## 🎨 **UI Elements:**

### **1. Menu Badge:**

```
Thai ID & Documents [✓ มีข้อมูล]
                     └─ Shows if has data
```

### **2. Info Banner:**

```
┌────────────────────────────────┐
│ ℹ️ ✓ ข้อมูลจาก KYC:           │
│ ดึงมาจากการยืนยันตัวตน         │
│ คุณสามารถแก้ไขได้ตามต้องการ    │
└────────────────────────────────┘
```

### **3. Pre-filled Fields:**

```
เลขบัตร: [1234567890123]  ← Blue border
         └─ Has value from KYC

[✓ บัตรหน้า]  ← Green checkmark
└─ Image loaded from KYC
```

---

## 🔧 **Technical Details:**

### **Files Modified:**

```
1. types.ts
   - Added 8 new fields to UserProfile

2. Settings.tsx
   - Added loadKYCData() function
   - Added useEffect trigger
   - Added info banner
   - Updated save function
   - Added status badge
```

### **Functions:**

```typescript
// Load
loadKYCData() → Read from user profile → Pre-fill form

// Save
onClick() → updateProfile() → Update DB → Refresh UI
```

---

## 📝 **Console Logs:**

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

## 🎉 **Summary:**

```
✅ Auto-load KYC data into Thai ID form
✅ Priority system (Settings > KYC > Legacy)
✅ Visual indicators (badge + banner)
✅ Pre-fill all fields
✅ Editable
✅ Saveable
✅ Sync between KYC and Settings
✅ Console logs for debugging
```

---

**ลองเลยครับ!** 🚀

```bash
# Test Flow:
1. Complete KYC Wizard
2. Go to Settings
3. Click "Thai ID & Documents"
   → See "✓ มีข้อมูล" badge
4. Form opens PRE-FILLED ✅
5. Edit if needed
6. Save
```

---

**Status:** ✅ COMPLETED
**Last Updated:** 2026-01-28 21:15
