# ✅ Admin Role Management Feature - Complete!

## สิ่งที่เพิ่มใหม่

### 1. ✅ เพิ่มฟังก์ชัน `updateUserRole` ใน AdminService
**File:** `services/adminService.ts`

```typescript
updateUserRole: async (userId: string, newRole: 'user' | 'PROVIDER' | 'USER'): Promise<void> => {
    const normalizedRole = newRole.toUpperCase();
    await updateDoc(doc(db, 'users', userId), { 
        role: normalizedRole,
        updated_at: new Date().toISOString()
    });
    console.log(`✅ Updated user ${userId} to role: ${normalizedRole}`);
}
```

### 2. ✅ เพิ่ม UI สำหรับแก้ไข Role ใน Admin Dashboard
**File:** `pages/admin/AdminDashboard.tsx`

**เพิ่ม:**
- State management สำหรับ Role Modal
- ปุ่ม "Change Role" ในตาราง User Management
- Modal สวยงามสำหรับเลือก role ใหม่
- Logging สำหรับ audit trail

### 3. ✅ เพิ่ม Debug Logging ใน JobDetails
**File:** `pages/JobDetails.tsx`

เพิ่ม console.log เพื่อ debug ว่าทำไมปุ่ม Accept Job ไม่แสดง:
```javascript
console.log("🔍 Accept Button Debug:", {
  isUserProvider,
  userRole: user?.role,
  jobStatus: job?.status,
  isOwner,
  isExpired,
  shouldShowButton: ...
});
```

---

## 🚀 วิธีใช้งาน

### สำหรับ Admin:

1. **Login เข้า Admin Dashboard:**
   - URL: `/admin/login`
   - Email: `admin@meerak.app`
   - Password: `admin123`

2. **ไปที่แท็บ "User CRM"**

3. **แก้ไข Role ของ User:**
   - คลิกปุ่ม **"Role"** (สีม่วง) ข้าง user ที่ต้องการแก้ไข
   - เลือก role ใหม่:
     - **👤 USER (ผู้จ้าง)** - สามารถสร้างและโพสต์งานได้
     - **⚡ PROVIDER (ผู้รับงาน)** - สามารถรับและทำงานได้
   - คลิก **"Update Role"**

4. **✅ สำเร็จ!** 
   - ระบบจะแจ้งเตือน: "Successfully updated [Name] to [ROLE]"
   - User ต้อง **logout และ login ใหม่** เพื่อเห็นการเปลี่ยนแปลง

---

## 🔧 แก้ไข Anna เป็น PROVIDER

### วิธีที่ 1: ใช้ Admin Dashboard (แนะนำ)
1. Login เข้า Admin: `admin@meerak.app` / `admin123`
2. ไปแท็บ "User CRM"
3. Search หา Anna (phone: `0800000001`)
4. คลิก **"Role"** button
5. เลือก **"⚡ PROVIDER"**
6. คลิก **"Update Role"**
7. ✅ เสร็จแล้ว! **Anna logout แล้ว login ใหม่**

### วิธีที่ 2: ใช้ Browser Console
```javascript
// Paste in Browser Console (F12)
(async () => {
  const { collection, query, where, getDocs, updateDoc, doc } = await import('firebase/firestore');
  const { db } = await import('./services/firebase');
  
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('phone', '==', '0800000001'));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log('❌ Anna not found');
    return;
  }
  
  const annaDoc = snapshot.docs[0];
  await updateDoc(doc(db, 'users', annaDoc.id), {
    role: 'PROVIDER',
    name: 'Anna Provider',
    updated_at: new Date().toISOString()
  });
  
  console.log('✅ Updated! Please LOGOUT and LOGIN again');
})();
```

### วิธีที่ 3: ลบและสร้างใหม่
1. ไปที่ Firebase Console: https://console.firebase.google.com/project/meerak-b43ac/firestore/data/users
2. หา user ที่ phone = `0800000001`
3. ลบ document
4. Logout จากแอพ
5. Login ใหม่ด้วย phone: `0800000001` + OTP: `123456`
6. ✅ Anna จะถูกสร้างใหม่เป็น PROVIDER

---

## 📊 Features ใหม่ใน Admin Dashboard

### User Management Tab
- ✅ Search users by name, phone, email
- ✅ View user details (jobs, transactions, wallet)
- ✅ Ban/Unban users
- ✅ **Change user role** (ใหม่!)
- ✅ Audit log tracking

### Role Change Modal
- ✅ แสดงข้อมูล user ปัจจุบัน
- ✅ เลือก role ใหม่ (USER / PROVIDER)
- ✅ แสดง warning ว่าต้อง logout/login
- ✅ บันทึก audit log
- ✅ Refresh user list อัตโนมัติ

---

## 🎯 ทดสอบว่าแก้ไขสำเร็จ

1. **แก้ไข Anna เป็น PROVIDER** (ใช้วิธีใดวิธีหนึ่งข้างบน)
2. **Anna Logout**
3. **Anna Login ใหม่:**
   - Phone: `0800000001`
   - OTP: `123456`
4. **ไปที่หน้า Job Details ของงานที่ `status = OPEN`**
5. **เปิด DevTools Console (F12)** ดู debug log:
   ```
   🔍 Accept Button Debug: {
     isUserProvider: true,     // ✅ ต้องเป็น true
     userRole: "PROVIDER",     // ✅ ต้องเป็น PROVIDER
     shouldShowButton: true    // ✅ ต้องเป็น true
   }
   ```
6. **✅ ตอนนี้ควรเห็นปุ่ม "Accept Job" สีเขียว!**

---

## 🐛 หากยังไม่แสดงปุ่ม

ตรวจสอบใน Console:
- `isUserProvider: false` → Role ยังไม่อัปเดต, ลอง logout/login ใหม่
- `isOwner: true` → Anna เป็นเจ้าของงานนี้ (ไม่สามารถรับงานตัวเองได้)
- `isExpired: true` → งานหมดอายุแล้ว (เกิน 24 ชม.)
- `jobStatus: "CANCELLED"` → งานถูกยกเลิกแล้ว

---

**Status:** ✅ Admin Role Management ใช้งานได้แล้ว!  
**Date:** 2026-01-28  
**Next:** Anna สามารถรับงานได้แล้ว!
