# ✅ Profile Update: เพิ่มปุ่มยืนยันตัวตนกลับมา

## 🎯 **สิ่งที่เพิ่ม:**

### **Identity Verification Section** 🛡️
```
ตำแหน่ง: ด้านบนสุดของแท็บ Info (ก่อน Resume sections)
```

#### **Layout:**
```
┌──────────────────────────────────────────────┐
│ 🛡️ Identity Verification (KYC)              │
│                                              │
│ ยืนยันตัวตนเพื่อเพิ่มความน่าเชื่อถือ         │
│                           [ยืนยันตัวตน] ปุ่ม │
│                                              │
│ ✓ เพิ่มความน่าเชื่อถือ                       │
│ ✓ รับงานได้มากขึ้น                          │
│ ✓ ปลอดภัยยิ่งขึ้น                            │
└──────────────────────────────────────────────┘
```

---

## 🎨 **Features:**

### **1. แสดงสถานะ KYC:**
```javascript
if (kyc_level === "level_2") {
  // แสดง "✓ Verified" badge สีเขียว
  // ซ่อนปุ่ม "ยืนยันตัวตน"
  // แสดงข้อความ "บัญชีของคุณได้รับการยืนยันตัวตนแล้ว"
} else {
  // แสดงปุ่ม "ยืนยันตัวตน" สีน้ำเงิน-ม่วง
  // แสดงข้อความชักชวน
  // แสดงประโยชน์ 3 ข้อ
}
```

### **2. ปุ่ม "ยืนยันตัวตน":**
```
- สีไล่เฉด: น้ำเงิน → ม่วง
- มี icon ShieldCheck
- คลิกแล้วไปหน้า /kyc
- มี hover effect
- มี shadow
```

### **3. แสดงประโยชน์ (Benefits):**
```
┌─────────────────────────────────┐
│ ✓ เพิ่มความน่าเชื่อถือ          │
│ ✓ รับงานได้มากขึ้น             │
│ ✓ ปลอดภัยยิ่งขึ้น               │
└─────────────────────────────────┘
```

---

## 📂 **โครงสร้างหน้า Info (อัพเดต):**

```
Profile → Info Tab
├── 🛡️ Identity Verification (NEW!)
│   ├── Icon + Title
│   ├── Description
│   ├── [ยืนยันตัวตน] Button
│   └── Benefits (3 items)
│
├── 👤 About (Resume)
├── ⭐ Skills & Expertise
├── 💼 Experience
├── 🎓 Education
├── 🏆 Licenses & Certifications
│
└── 📞 Contact Info
```

---

## 🎯 **User Flow:**

### **Step 1: ดูหน้า Profile**
```
→ คลิกแท็บ "Info"
→ เห็น Identity Verification section ด้านบน
```

### **Step 2: ยังไม่ยืนยัน (kyc_level !== "level_2")**
```
┌────────────────────────────────┐
│ 🛡️ Identity Verification      │
│                                │
│ ยืนยันตัวตนเพื่อเพิ่มความ...   │
│              [ยืนยันตัวตน] ←  │
│                                │
│ ✓ เพิ่มความน่าเชื่อถือ         │
│ ✓ รับงานได้มากขึ้น            │
│ ✓ ปลอดภัยยิ่งขึ้น              │
└────────────────────────────────┘
```

### **Step 3: คลิกปุ่ม "ยืนยันตัวตน"**
```
→ Navigate to /kyc
→ เข้าสู่ KYC Wizard (6 steps)
```

### **Step 4: ยืนยันสำเร็จแล้ว (kyc_level === "level_2")**
```
┌────────────────────────────────┐
│ 🛡️ Identity Verification      │
│              [✓ Verified] ←   │
│                                │
│ บัญชีของคุณได้รับการยืนยัน...  │
│ (ไม่แสดงปุ่มอีกต่อไป)          │
└────────────────────────────────┘
```

---

## 🎨 **Design Details:**

### **Colors:**
```css
- Background: gradient from blue-50 via purple-50 to pink-50
- Border: blue-200 (2px)
- Button: gradient from blue-600 to purple-600
- Icon Circle: gradient from blue-500 to purple-600
- Verified Badge: emerald-500
```

### **Icons:**
```
- Main Icon: ShieldCheck (28px, white)
- Benefits Icons: CheckCircle (20px, blue/purple/pink)
- Button Icon: ShieldCheck (20px, white)
```

### **Spacing:**
```
- Padding: 6 (1.5rem)
- Gap between elements: 4 (1rem)
- Benefits grid: 3 columns
```

---

## 💻 **Code Added:**

### **Location:**
```typescript
// G:\meerak\pages\Profile.tsx
// Line ~957-1009
```

### **Structure:**
```tsx
<div className="border-2 border-blue-200 rounded-xl p-6 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50">
  {/* Header with Icon + Title + Badge */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-4">
      {/* Icon Circle */}
      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 ...">
        <ShieldCheck ... />
      </div>
      
      {/* Title + Description */}
      <div>
        <h3>Identity Verification (KYC)</h3>
        <p>ยืนยันตัวตนเพื่อ...</p>
      </div>
    </div>
    
    {/* Button (if not verified) */}
    {profile.kyc_level !== "level_2" && (
      <button onClick={() => navigate('/kyc')}>
        ยืนยันตัวตน
      </button>
    )}
  </div>
  
  {/* Benefits (if not verified) */}
  {profile.kyc_level !== "level_2" && (
    <div className="mt-4 pt-4 border-t ...">
      <div className="grid grid-cols-3 gap-4">
        {/* 3 benefits */}
      </div>
    </div>
  )}
</div>
```

---

## ✅ **Testing:**

### **Test Case 1: ยังไม่ยืนยัน**
```
1. Login as Anna or Bob
2. Go to Profile → Info tab
3. เห็น Identity Verification section
4. เห็นปุ่ม "ยืนยันตัวตน"
5. เห็นประโยชน์ 3 ข้อ
6. คลิกปุ่ม
7. ไปหน้า /kyc ได้
```

### **Test Case 2: ยืนยันแล้ว**
```
1. Set profile.kyc_level = "level_2"
2. Go to Profile → Info tab
3. เห็น Identity Verification section
4. เห็น "✓ Verified" badge
5. ไม่เห็นปุ่ม "ยืนยันตัวตน"
6. ไม่เห็นประโยชน์ 3 ข้อ
```

---

## 📸 **Screenshot Layout:**

```
┌─────────────────────────────────────────────┐
│ Profile Header                              │
│ [Anna] [Employer] [880฿]                    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ [Info] [Training] [Reviews] [Wallet]       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🛡️ Identity Verification (KYC)              │
│                                              │
│ ยืนยันตัวตนเพื่อเพิ่มความน่าเชื่อถือและ...  │
│                           [ยืนยันตัวตน]     │
│                                              │
│ ✓ เพิ่มความน่าเชื่อถือ                       │
│ ✓ รับงานได้มากขึ้น                          │
│ ✓ ปลอดภัยยิ่งขึ้น                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 👤 About                                    │
│ [bio ของผู้ใช้...]                          │
│ ✏️ แก้ไข                                    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ⭐ Skills & Expertise          + เพิ่มทักษะ │
│ [React] [Node.js] [Python]✓                 │
│ 5 ทักษะ | 3 Certified | 4.5⭐               │
└─────────────────────────────────────────────┘

... (Experience, Education, Certifications)
```

---

## 🎉 **Summary:**

### **✅ เพิ่มแล้ว:**
- ✅ Identity Verification section ด้านบนสุด
- ✅ ปุ่ม "ยืนยันตัวตน" (ถ้ายังไม่ยืนยัน)
- ✅ แสดงสถานะ "✓ Verified" (ถ้ายืนยันแล้ว)
- ✅ แสดงประโยชน์ 3 ข้อ
- ✅ เชื่อมต่อไปหน้า /kyc
- ✅ UI สวยงาม gradient สีน้ำเงิน-ม่วง-ชมพู

### **✅ ยังคงมี:**
- ✅ Resume/CV sections ทั้งหมด
- ✅ About, Skills, Experience, Education, Certifications

---

**ลองดูได้เลยครับ!** 🚀

```bash
# Refresh page
Ctrl + R

# Go to Profile → Info tab
# จะเห็นปุ่ม "ยืนยันตัวตน" ด้านบนสุดแล้ว!
```
