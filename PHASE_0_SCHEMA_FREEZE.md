# Phase 0: Schema Freeze Policy

## 📋 Overview

This document outlines the **Schema Freeze Policy** for the Meerak platform to ensure database stability, data integrity, and easy debugging across all environments.

---

## 🎯 Goals

1. **Prevent Schema Breakage** - No breaking changes to existing fields
2. **Enable Debug Tracing** - Every record has trace_id for investigation
3. **Audit Everything** - Complete trail of who changed what and when
4. **Reference Tracking** - Human-readable reference numbers for all transactions

---

## 📊 Core Schema Requirements

### 1. **Timestamp Fields** (Required for ALL collections/tables)

Every document/record MUST have:

```typescript
{
  created_at: string;      // ISO 8601 timestamp
  updated_at: string;      // ISO 8601 timestamp (auto-update)
  created_by?: string;     // User ID who created
  updated_by?: string;     // User ID who last updated
}
```

**Firebase/Firestore Implementation:**
```typescript
import { doc, setDoc, updateDoc } from 'firebase/firestore';

// Create
await setDoc(doc(db, 'jobs', id), {
  ...jobData,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_by: user.id
});

// Update
await updateDoc(doc(db, 'jobs', id), {
  ...updates,
  updated_at: new Date().toISOString(),
  updated_by: user.id
});
```

**PostgreSQL Implementation:**
```sql
-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### 2. **Tracing Fields** (Required for ALL operations)

Every operation MUST have:

```typescript
{
  request_id: string;      // UUID per HTTP request
  trace_id: string;        // UUID per transaction chain
}
```

**Usage:**
```typescript
import { createRequestContext } from '@/utils/tracing';

// In API route/function
const context = createRequestContext('web');

await setDoc(doc(db, 'jobs', id), {
  ...jobData,
  request_id: context.request_id,
  trace_id: context.trace_id
});
```

---

### 3. **Reference Numbers** (Required for Financial Operations)

All bills, transactions, and payments MUST have:

```typescript
{
  bill_no: string;         // Format: BL-YYYYMMDD-XXXX
  transaction_no: string;  // Format: TX-YYYYMMDD-XXXX
  payment_no: string;      // Format: PY-YYYYMMDD-XXXX
}
```

**Usage:**
```typescript
import { generateBillNo, generateTransactionNo } from '@/utils/referenceNumbers';

// Create job bill
const billNo = await generateBillNo();  // => "BL-20260127-0001"

await setDoc(doc(db, 'job_billings', id), {
  bill_no: billNo,
  job_id: jobId,
  amount: 500,
  ...
});
```

---

## 🔒 Schema Freeze Rules

### ✅ **ALLOWED Changes:**

1. **Add new optional fields**
   ```typescript
   // ✅ OK: Adding optional field
   interface Job {
     title: string;
     description: string;
     deadline?: string;  // NEW: Optional field
   }
   ```

2. **Add new collections/tables**
   ```typescript
   // ✅ OK: New collection
   const disputesRef = collection(db, 'disputes');
   ```

3. **Add indexes**
   ```sql
   -- ✅ OK: New index
   CREATE INDEX idx_jobs_deadline ON jobs(deadline);
   ```

4. **Add computed fields**
   ```typescript
   // ✅ OK: Computed field
   interface User {
     first_name: string;
     last_name: string;
     full_name?: string;  // Computed from first + last
   }
   ```

---

### ❌ **FORBIDDEN Changes:**

1. **Rename existing fields**
   ```typescript
   // ❌ FORBIDDEN: Renaming field
   interface Job {
     // title: string;        // OLD
     job_title: string;       // NEW - BREAKS OLD CODE!
   }
   ```

2. **Change field types**
   ```typescript
   // ❌ FORBIDDEN: Changing type
   interface Job {
     // price: number;        // OLD
     price: string;           // NEW - BREAKS OLD CODE!
   }
   ```

3. **Make optional fields required**
   ```typescript
   // ❌ FORBIDDEN: Making optional field required
   interface Job {
     // deadline?: string;    // OLD
     deadline: string;        // NEW - BREAKS OLD DATA!
   }
   ```

4. **Delete fields without deprecation**
   ```typescript
   // ❌ FORBIDDEN: Deleting field immediately
   interface Job {
     title: string;
     // description: string;  // Deleted - OLD DATA HAS THIS!
   }
   ```

---

## 🛠️ Safe Migration Process

If you MUST change schema, follow this process:

### Step 1: Deprecate (Not Delete)
```typescript
interface Job {
  title: string;
  /** @deprecated Use title_v2 instead */
  old_title?: string;
  title_v2?: string;  // New field
}
```

### Step 2: Add Migration Script
```typescript
// migration_001_update_job_titles.ts
async function migrateJobTitles() {
  const snapshot = await getDocs(collection(db, 'jobs'));
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    if (data.old_title && !data.title_v2) {
      await updateDoc(doc.ref, {
        title_v2: data.old_title,
        updated_at: new Date().toISOString()
      });
    }
  }
}
```

### Step 3: Update All Code
```typescript
// Update all references
function getJobTitle(job: Job): string {
  // Fallback to old field if new field not available
  return job.title_v2 || job.old_title || job.title;
}
```

### Step 4: Wait 30 Days
```typescript
// After 30 days of monitoring, mark for deletion
interface Job {
  title: string;
  /** @deprecated SCHEDULED FOR DELETION: 2026-03-01 */
  old_title?: string;
  title_v2?: string;
}
```

### Step 5: Delete Old Field (After Confirmation)
```typescript
// Only after 100% migration confirmed
interface Job {
  title: string;
  title_v2?: string;  // Now safe to delete old_title
}
```

---

## 📝 Audit Requirements

### All Data Changes Must Be Logged

```typescript
import { logUpdate } from '@/utils/auditLog';

// Before update
const oldData = (await getDoc(jobRef)).data();

// Update
await updateDoc(jobRef, newData);

// Log audit
await logUpdate(
  'jobs',           // table name
  jobId,            // record ID
  oldData,          // before
  newData,          // after
  context,          // request context
  {
    user_id: user.id,
    user_role: user.role,
    reason: 'Admin correction',
    action_type: 'update_job_status'
  }
);
```

---

## 🔍 Debug Tracing

### How to Debug Any Issue:

Given a `trace_id`, you can find ALL related operations:

```typescript
import { getTraceAuditHistory } from '@/utils/auditLog';

// Get all operations in this transaction chain
const history = await getTraceAuditHistory('f47ac10b-58cc-4372-a567-0e02b2c3d479');

// Prints:
// [2026-01-27 10:15:23] User bob (user123) CREATE jobs/job_456
// [2026-01-27 10:15:24] User bob (user123) CREATE transactions/tx_789
// [2026-01-27 10:15:25] System (system) UPDATE users/user123 (wallet_balance)
// [2026-01-27 10:15:26] User anna (user456) UPDATE jobs/job_456 (status)
```

---

## 📊 Schema Documentation

### Current Frozen Schema (Phase 0)

#### **Users Collection**
```typescript
interface User {
  // Core
  id: string;
  phone: string;
  email: string;
  name: string;
  role: UserRole;
  
  // Audit
  created_at: string;      // ✅ Required
  updated_at: string;      // ✅ Required
  created_by?: string;     // ✅ Required
  updated_by?: string;     // ✅ Required
  
  // Optional
  kyc_level?: string;
  wallet_balance?: number;
  rating?: number;
}
```

#### **Jobs Collection**
```typescript
interface Job {
  // Core
  id: string;
  title: string;
  description: string;
  price: number;
  location: JobLocation;
  status: JobStatus;
  
  // Relationships
  created_by: string;
  accepted_by?: string;
  
  // Audit
  created_at: string;      // ✅ Required
  updated_at: string;      // ✅ Required
  request_id?: string;     // ✅ Recommended
  trace_id?: string;       // ✅ Recommended
  
  // Optional
  datetime?: string;
  duration_minutes?: number;
}
```

#### **Transactions Collection**
```typescript
interface Transaction {
  // Core
  id: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'payment' | 'income';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  
  // References
  transaction_no: string;  // ✅ Required (TX-YYYYMMDD-XXXX)
  bill_no?: string;        // ✅ Required for payments (BL-YYYYMMDD-XXXX)
  payment_no?: string;     // ✅ Required for external payments (PY-YYYYMMDD-XXXX)
  
  // Tracing
  request_id: string;      // ✅ Required
  trace_id: string;        // ✅ Required
  
  // Audit
  created_at: string;      // ✅ Required
  updated_at: string;      // ✅ Required
  created_by: string;      // ✅ Required
  
  // Optional
  description?: string;
  related_job_id?: string;
}
```

---

## ✅ Acceptance Criteria (Phase 0)

- [x] All collections have `created_at`, `updated_at`, `created_by`, `updated_by`
- [x] All transactions have `request_id`, `trace_id`
- [x] All financial operations have reference numbers (bill_no, transaction_no)
- [x] Audit logging system implemented
- [x] Schema freeze policy documented
- [x] Migration process defined

---

## 🚀 Next Steps

### Phase 1: Authentication & OTP
- Build on top of this stable foundation
- All auth operations will have full tracing

### Phase 2: KYC System
- KYC documents will have complete audit trail
- Admin actions fully tracked

### Phase 3: Payment Gateway
- Payment reconciliation enabled by reference numbers
- Full transaction chain tracing

---

## 📞 Support

For schema change requests, contact:
- **Developer Lead:** @developer
- **Database Admin:** @dba
- **Security Team:** @security

**Remember:** When in doubt, DON'T change the schema. Add a new field instead!

---

**Last Updated:** 2026-01-27
**Version:** 1.0.0
**Status:** ✅ ACTIVE
