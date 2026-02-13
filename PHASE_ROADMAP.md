# 🗺️ Meerak Platform - Phase Development Roadmap

## 📌 หลักคิดการพัฒนา

- ✅ **ทำทีละ Phase** - Focus เดียว, Deploy ได้จริง
- ✅ **แต่ละ Phase = Production Ready** - ไม่เอา Big Bang
- ✅ **ทุก Phase มี Accept Criteria** - ชัดเจน, วัดผลได้
- ✅ **Backward Compatible** - ไม่ทำลายของเก่า

---

## ✅ Completed Phases (2-6)

### Phase 2: Location Tracking ✅
- Real-time provider tracking
- Distance calculation & ETA
- Map integration with Leaflet
- **Status:** DEPLOYED

### Phase 3: Arrival Confirmation ✅
- GPS-based arrival verification
- Distance check (< 500m)
- Auto location tracking
- **Status:** DEPLOYED

### Phase 4: Before/After Photos ✅
- Mandatory work proof photos
- Image upload & preview
- Storage integration
- **Status:** DEPLOYED

### Phase 5: Escrow Payment System ✅
- Payment hold on job accept
- 5-minute dispute window
- Auto-approve mechanism
- Provider withdrawal
- **Status:** DEPLOYED

### Phase 6: Rating & Reviews ✅
- Mandatory post-job reviews
- 5-star rating system
- Review tags & comments
- Optional tip system
- **Status:** DEPLOYED

---

## 🔴 PHASE 0 — Foundation Lock

**🎯 เป้าหมาย:** Backend นิ่ง / Schema ไม่พัง / Debug ง่าย

### งานหลัก

#### 1. Freeze DB Schema
```typescript
// users table
id, phone, email, name, role, kyc_status, kyc_level
created_at, updated_at, created_by, updated_by

// jobs table
id, bill_no, job_no, request_id
created_at, updated_at, status, trace_id

// transactions table
id, transaction_no, bill_no, request_id
amount, type, status, trace_id
created_at, updated_at

// payments table
id, payment_no, transaction_id, request_id
amount, method, status, gateway_ref
created_at, updated_at
```

#### 2. Add Global Tracing
```typescript
interface RequestContext {
  request_id: string;      // UUID per request
  trace_id: string;        // UUID per transaction chain
  user_id: string;
  timestamp: string;
  source: 'web' | 'mobile' | 'admin';
}

// Middleware
app.use((req, res, next) => {
  req.context = {
    request_id: generateUUID(),
    trace_id: req.headers['x-trace-id'] || generateUUID(),
    user_id: req.user?.id,
    timestamp: new Date().toISOString(),
    source: req.headers['x-source'] || 'web'
  };
  next();
});
```

#### 3. Add Timestamps & Audit Fields
```sql
ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN created_by VARCHAR(255);
ALTER TABLE users ADD COLUMN updated_by VARCHAR(255);

-- Trigger for auto-update
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

#### 4. Add Reference Numbers
```typescript
// Bill Number Format: BL-YYYYMMDD-XXXX
// Transaction Number: TX-YYYYMMDD-XXXX
// Payment Number: PY-YYYYMMDD-XXXX

function generateBillNo(): string {
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const seq = getNextSequence('bill'); // from Redis/DB
  return `BL-${date}-${seq.toString().padStart(4,'0')}`;
}
```

### Accept Criteria
- ✅ ทุก transaction มีเลขอ้างอิง (bill_no, transaction_no)
- ✅ Debug ย้อนหลังได้จาก ID เดียว
- ✅ ทุก table มี created_at / updated_at
- ✅ ทุก request มี trace_id
- ✅ Schema documented & frozen

### Cursor Prompt
```
"Setup database schema with audit fields, tracing IDs, and reference number generation system. 
Include:
1. Add created_at/updated_at to all tables
2. Add request_id/trace_id columns
3. Create bill_no/transaction_no generators
4. Setup auto-update triggers
5. Document schema freeze policy"
```

---

## 🟠 PHASE 1 — Authentication & OTP

**🎯 เป้าหมาย:** ผ่าน store policy ขั้นพื้นฐาน / Login ปลอดภัย

### ระบบหลัก

#### 1. OTP System
```typescript
interface OTPRequest {
  phone: string;
  type: 'login' | 'register' | 'verify';
  device_id: string;
}

interface OTPRecord {
  phone: string;
  code: string;           // 6-digit
  expires_at: string;     // 5 minutes
  attempts: number;       // max 3
  device_id: string;
  ip: string;
}

// Rate Limiting
const OTP_RATE_LIMIT = {
  per_phone: '3 per hour',
  per_ip: '10 per hour',
  per_device: '5 per hour'
};
```

#### 2. JWT + Session
```typescript
interface AuthTokens {
  access_token: string;   // 15 minutes
  refresh_token: string;  // 30 days
  device_id: string;
}

interface Session {
  user_id: string;
  device_id: string;
  ip: string;
  user_agent: string;
  last_active: string;
  expires_at: string;
}
```

#### 3. Device Binding
```typescript
interface Device {
  device_id: string;
  user_id: string;
  device_name: string;
  platform: 'ios' | 'android' | 'web';
  last_login: string;
  is_trusted: boolean;
}

// New device → require OTP
// Trusted device → skip OTP (optional)
```

### Tech Stack
- **SMS:** Twilio / AWS SNS / Nexmo
- **Email:** SendGrid / AWS SES
- **Firebase Auth:** สำหรับ OTP (ถ้าใช้ Firebase)
- **Redis:** Rate limiting & OTP storage
- **JWT:** Access/Refresh tokens

### Accept Criteria
- ✅ Login ต้องผ่าน OTP
- ✅ OTP มี expire (5 min) / retry limit (3)
- ✅ Rate limiting ทำงาน (per phone/IP/device)
- ✅ Device binding ทำงาน
- ✅ Refresh token rotation ทำงาน

### Cursor Prompt
```
"Create OTP verification flow with:
1. SMS/Email OTP sending via Twilio
2. Rate limiting (3 per hour per phone)
3. Retry logic (max 3 attempts)
4. Device binding & trusted device
5. JWT access/refresh token system
6. Session management with Redis"
```

---

## 🟡 PHASE 2 — Identity Verification (KYC)

**🎯 เป้าหมาย:** ปลอดภัย + ผ่านกฎหมาย / จำกัดฟีเจอร์ตาม KYC level

### KYC Level 1 (Lite) - Manual Review

```typescript
interface KYCLite {
  user_id: string;
  id_card_front_url: string;
  id_card_back_url: string;
  selfie_url: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

// Feature limits
const LIMITS_BY_KYC = {
  none: {
    max_job_value: 500,
    max_daily_withdraw: 0,
    can_be_provider: false
  },
  lite: {
    max_job_value: 5000,
    max_daily_withdraw: 3000,
    can_be_provider: true
  },
  full: {
    max_job_value: 50000,
    max_daily_withdraw: 50000,
    can_be_provider: true
  }
};
```

### KYC Level 2 (Full) - Automated

```typescript
interface KYCFull {
  user_id: string;
  
  // Face verification
  face_match_score: number;        // 0-100
  liveness_check: boolean;
  liveness_video_url?: string;
  
  // ID verification
  id_type: 'national_id' | 'passport' | 'driving_license';
  id_number: string;               // Encrypted
  id_expiry: string;
  ocr_data: {
    name: string;
    birth_date: string;
    address: string;
  };
  
  // Status
  status: 'pending' | 'approved' | 'rejected';
  verified_at?: string;
}
```

### Tech Stack
- **Face Match:** AWS Rekognition / Face++ / Azure Face API
- **Liveness:** iProov / Onfido / Veriff
- **ID OCR:** Google Vision / AWS Textract
- **Encryption:** AES-256 for PII data
- **Storage:** S3 with encryption at rest

### Accept Criteria
- ✅ User ที่ไม่ผ่าน KYC → จำกัดฟีเจอร์ (ตามตาราง LIMITS_BY_KYC)
- ✅ KYC Lite: Manual review ภายใน 24 ชม.
- ✅ KYC Full: Face match > 80%, Liveness pass
- ✅ ID OCR ดึงข้อมูลได้ครบ
- ✅ PII data encrypted ตลอด

### Cursor Prompt
```
"Implement KYC system with two levels:
1. KYC Lite: ID upload + selfie + manual admin review
2. KYC Full: Face matching (AWS Rekognition) + liveness check + ID OCR
3. Feature limits based on KYC level
4. PII encryption (AES-256)
5. Admin review dashboard
6. Status tracking & notifications"
```

---

## 🟢 PHASE 3 — Payment Gateway & Ledger

**🎯 เป้าหมาย:** เงินต้อง "ตรวจสอบย้อนหลังได้ 100%" / Reconcile รายวันได้

### Payment Gateways

#### 1. PromptPay (QR Code)
```typescript
interface PromptPayPayment {
  payment_id: string;
  qr_code: string;
  amount: number;
  ref1: string;           // bill_no
  ref2: string;           // transaction_no
  expires_at: string;     // 15 minutes
}

// Providers: Omise, GBPrime, SCB Easy
```

#### 2. Credit/Debit Card
```typescript
interface CardPayment {
  payment_id: string;
  card_token: string;     // Tokenized
  amount: number;
  currency: 'THB';
  gateway_ref: string;
}

// Provider: Stripe
```

#### 3. Wallet (TrueMoney)
```typescript
interface WalletPayment {
  payment_id: string;
  wallet_id: string;
  amount: number;
  transaction_ref: string;
}
```

### Immutable Ledger System

```typescript
interface LedgerEntry {
  id: string;             // UUID
  entry_no: string;       // LE-YYYYMMDD-XXXX
  transaction_id: string;
  
  // Double-entry accounting
  debit_account: string;  // e.g., 'user_wallet', 'escrow'
  credit_account: string; // e.g., 'provider_wallet', 'revenue'
  amount: number;
  
  // Metadata
  type: 'payment' | 'refund' | 'fee' | 'withdrawal';
  reference_no: string;   // bill_no, transaction_no
  trace_id: string;
  
  // Immutability
  created_at: string;
  created_by: string;
  hash: string;           // SHA-256 of entry
  prev_hash: string;      // Previous entry hash (blockchain-like)
}

// Example transaction
const jobPayment = [
  {
    debit_account: 'user:bob:wallet',
    credit_account: 'escrow:job_123',
    amount: 500,
    type: 'payment'
  },
  {
    debit_account: 'escrow:job_123',
    credit_account: 'provider:anna:wallet',
    amount: 475,  // 500 - 25 fee
    type: 'payout'
  },
  {
    debit_account: 'escrow:job_123',
    credit_account: 'revenue:platform_fee',
    amount: 25,
    type: 'fee'
  }
];
```

### Webhook Verification

```typescript
interface WebhookPayload {
  event: 'payment.success' | 'payment.failed' | 'refund.completed';
  data: any;
  signature: string;  // HMAC-SHA256
  timestamp: string;
}

function verifyWebhook(payload: WebhookPayload, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload.data) + payload.timestamp)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(payload.signature),
    Buffer.from(expectedSignature)
  );
}
```

### Daily Reconciliation

```typescript
interface DailyReconciliation {
  date: string;
  
  // Summary
  total_payments: number;
  total_refunds: number;
  total_fees: number;
  total_withdrawals: number;
  
  // Breakdown
  by_gateway: Record<string, number>;
  by_status: Record<string, number>;
  
  // Validation
  ledger_balance: number;
  gateway_balance: number;
  variance: number;          // Should be 0
  
  // Status
  status: 'matched' | 'variance_detected';
  reviewed_by?: string;
}
```

### Accept Criteria
- ✅ เงินหาย = trace เจอ (ผ่าน ledger entries)
- ✅ Reconcile รายวันได้ (variance = 0)
- ✅ Webhook verified (signature check)
- ✅ Immutable ledger (hash chain)
- ✅ Double-entry accounting ถูกต้อง

### Cursor Prompt
```
"Setup payment gateway integration with immutable ledger:
1. PromptPay QR via Omise with webhook
2. Stripe card payment
3. Immutable ledger table with hash chain
4. Double-entry accounting system
5. Webhook signature verification
6. Daily reconciliation job
7. Variance detection & alerts"
```

---

## 🔵 PHASE 4 — Admin Dashboard

**🎯 เป้าหมาย:** คุมเงิน คุมคน คุมความเสี่ยง / ทุกอย่าง log หมด

### Modules

#### 1. User Management
```typescript
interface AdminUserManagement {
  search: (query: string) => User[];
  viewProfile: (userId: string) => UserProfile;
  suspendUser: (userId: string, reason: string) => void;
  unsuspendUser: (userId: string) => void;
  viewTransactions: (userId: string) => Transaction[];
  viewJobs: (userId: string) => Job[];
}
```

#### 2. KYC Review
```typescript
interface KYCReviewDashboard {
  pendingList: () => KYCRequest[];
  review: (kycId: string, decision: 'approve' | 'reject', reason?: string) => void;
  viewDocuments: (kycId: string) => KYCDocuments;
  flagForSecondReview: (kycId: string) => void;
}
```

#### 3. Financial Dashboard
```typescript
interface FinancialDashboard {
  overview: {
    daily_revenue: number;
    monthly_revenue: number;
    total_escrow: number;
    pending_withdrawals: number;
  };
  
  transactions: {
    recent: Transaction[];
    byStatus: Record<string, number>;
    byGateway: Record<string, number>;
  };
  
  reconciliation: DailyReconciliation[];
}
```

#### 4. Audit Logs
```typescript
interface AuditLog {
  id: string;
  timestamp: string;
  admin_id: string;
  admin_name: string;
  action: string;         // 'suspend_user', 'refund_payment', etc.
  resource_type: string;  // 'user', 'job', 'payment'
  resource_id: string;
  changes: {
    before: any;
    after: any;
  };
  reason?: string;
  ip: string;
  user_agent: string;
}

// Example
{
  action: 'refund_payment',
  resource_type: 'payment',
  resource_id: 'pay_123',
  changes: {
    before: { status: 'completed', amount: 500 },
    after: { status: 'refunded', amount: 500 }
  },
  reason: 'Customer request - job cancelled'
}
```

#### 5. Manual Override System
```typescript
interface ManualOverride {
  type: 'release_payment' | 'refund' | 'adjust_balance' | 'resolve_dispute';
  resource_id: string;
  amount?: number;
  reason: string;          // Required
  admin_id: string;
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: string;
}
```

### RBAC (Role-Based Access Control)

```typescript
enum AdminRole {
  SUPER_ADMIN = 'super_admin',    // All permissions
  FINANCE = 'finance',            // Payment, refund, reconciliation
  SUPPORT = 'support',            // User management, disputes
  KYC_REVIEWER = 'kyc_reviewer',  // KYC approval only
  AUDITOR = 'auditor'             // Read-only, audit logs
}

const PERMISSIONS = {
  super_admin: ['*'],
  finance: ['payment.*', 'refund.*', 'withdraw.*', 'reconciliation.*'],
  support: ['user.view', 'user.suspend', 'dispute.*', 'kyc.view'],
  kyc_reviewer: ['kyc.*'],
  auditor: ['*.view', 'audit.*']
};
```

### Tech Stack
- **Frontend:** React Admin / Next.js
- **Backend:** Express.js / Nest.js
- **Database:** PostgreSQL
- **Auth:** JWT + RBAC middleware
- **Logging:** Winston + ELK Stack

### Accept Criteria
- ✅ Admin ทำอะไร = มี log หมด (audit_logs table)
- ✅ ลบ / แก้ / คืนเงิน = trace ได้ (before/after changes)
- ✅ RBAC ทำงาน (แต่ละ role มี permission ถูกต้อง)
- ✅ Manual override ต้องใส่ reason (required)
- ✅ Critical actions ต้อง 2FA (optional but recommended)

### Cursor Prompt
```
"Build admin dashboard with:
1. User management (search, suspend, view transactions)
2. KYC review queue with approve/reject
3. Financial dashboard (revenue, escrow, withdrawals)
4. Audit logs (all admin actions with before/after)
5. Manual override system (refund, adjust balance)
6. RBAC system (super_admin, finance, support, kyc_reviewer, auditor)
7. Real-time alerts for critical events"
```

---

## 🟣 PHASE 5 — Dispute / Claim / Report System

**🎯 เป้าหมาย:** รับมือ "ของไม่ตรงปก" / Admin ตัดสินได้ / เงิน hold/refund

### Dispute Types

```typescript
enum DisputeType {
  JOB_NOT_COMPLETED = 'job_not_completed',
  POOR_QUALITY = 'poor_quality',
  NOT_AS_DESCRIBED = 'not_as_described',
  SAFETY_ISSUE = 'safety_issue',
  PAYMENT_ISSUE = 'payment_issue',
  OTHER = 'other'
}

interface Dispute {
  id: string;
  dispute_no: string;         // DS-YYYYMMDD-XXXX
  job_id: string;
  
  // Parties
  filed_by: string;           // user_id
  filed_by_type: 'employer' | 'provider';
  against_user: string;
  
  // Details
  type: DisputeType;
  description: string;
  evidence_urls: string[];    // Photos, videos
  
  // Status
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // SLA
  created_at: string;
  sla_deadline: string;       // 48 hours
  resolved_at?: string;
  
  // Admin
  assigned_to?: string;       // admin_id
  resolution?: DisputeResolution;
}
```

### Evidence System

```typescript
interface Evidence {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  type: 'photo' | 'video' | 'document' | 'message';
  url: string;
  description?: string;
  uploaded_at: string;
}
```

### SLA Timer

```typescript
interface DisputeSLA {
  dispute_id: string;
  
  // Timers
  response_due_at: string;    // 4 hours (first response)
  resolution_due_at: string;  // 48 hours (resolution)
  
  // Alerts
  response_overdue: boolean;
  resolution_overdue: boolean;
  
  // Escalation
  escalated: boolean;
  escalated_to?: string;      // senior admin
  escalated_at?: string;
}
```

### Admin Arbitration

```typescript
interface DisputeResolution {
  dispute_id: string;
  resolved_by: string;        // admin_id
  resolved_at: string;
  
  // Decision
  decision: 'employer_favor' | 'provider_favor' | 'partial_refund' | 'no_action';
  explanation: string;
  
  // Actions
  refund_amount?: number;
  refund_to?: string;
  penalty_amount?: number;
  penalty_to?: string;
  
  // Status
  executed: boolean;
  executed_at?: string;
}
```

### Dispute Flow

```
1. User files dispute
   ↓
2. Escrow payment hold (if not already)
   ↓
3. Evidence collection period (24 hours)
   ↓
4. Admin review (SLA: 48 hours)
   ↓
5. Decision:
   - Refund employer
   - Pay provider
   - Partial refund
   - No action
   ↓
6. Execute decision (auto or manual)
   ↓
7. Close dispute + log
```

### Accept Criteria
- ✅ User เคลมได้ (submit dispute)
- ✅ Admin ตัดสินได้ (arbitration)
- ✅ เงิน hold / refund ได้ (auto execute)
- ✅ SLA timer ทำงาน (alert overdue)
- ✅ Evidence upload ได้ (photos/videos)

### Cursor Prompt
```
"Create dispute resolution system:
1. Dispute filing with evidence upload
2. Escrow hold on dispute filed
3. SLA timer (4hr response, 48hr resolution)
4. Admin arbitration dashboard
5. Auto-execute decisions (refund/payout)
6. Escalation to senior admin
7. Dispute history & analytics"
```

---

## ⚫ PHASE 6 — Legal & Compliance System

**🎯 เป้าหมาย:** ไม่โดน store เตะ / ไม่โดนฟ้อง / Legal เปลี่ยน → user accept

### Legal Document Management

```typescript
interface LegalDocument {
  id: string;
  doc_type: 'terms_of_service' | 'privacy_policy' | 'kyc_consent' | 'payment_terms';
  version: string;              // v1.0, v1.1, v2.0
  content: string;              // Markdown or HTML
  effective_date: string;
  
  // Status
  status: 'draft' | 'active' | 'superseded';
  created_by: string;           // admin_id
  created_at: string;
  
  // Changes
  changes_from_previous?: string;
}
```

### Consent Tracking

```typescript
interface UserConsent {
  id: string;
  user_id: string;
  document_id: string;
  document_version: string;
  
  // Consent
  accepted: boolean;
  accepted_at: string;
  ip_address: string;
  user_agent: string;
  
  // Revocation
  revoked?: boolean;
  revoked_at?: string;
}

// Force re-acceptance on major changes
interface ConsentRequirement {
  user_id: string;
  required_documents: {
    document_id: string;
    version: string;
    must_accept_by: string;
  }[];
  
  // Blocking
  blocks_app_usage: boolean;    // True for critical changes
}
```

### Admin Legal Update Flow

```typescript
interface LegalUpdateCampaign {
  id: string;
  document_id: string;
  new_version: string;
  
  // Targeting
  target_users: 'all' | 'providers' | 'employers' | 'kyc_verified';
  
  // Notification
  notification_method: 'in_app' | 'email' | 'both';
  notification_sent_at: string;
  
  // Deadline
  acceptance_deadline: string;
  blocks_after_deadline: boolean;
  
  // Stats
  total_users: number;
  accepted_count: number;
  pending_count: number;
}
```

### Force Accept Flow

```
1. Admin publishes new legal version
   ↓
2. System creates ConsentRequirement for all users
   ↓
3. User opens app
   ↓
4. Check: Has user accepted latest version?
   - No → Show full-screen modal
   - Yes → Continue
   ↓
5. User must scroll & read (prevent instant accept)
   ↓
6. User clicks "Accept"
   ↓
7. Save consent record
   ↓
8. Allow app usage
```

### Accept Criteria
- ✅ Legal เปลี่ยน → user ต้องกดยอมรับใหม่
- ✅ Consent มี log (IP, timestamp, user agent)
- ✅ Admin push legal update ได้
- ✅ Force accept block app usage (if critical)
- ✅ Version tracking ครบถ้วน

### Cursor Prompt
```
"Implement legal compliance system:
1. Legal document versioning (terms, privacy policy)
2. User consent tracking (IP, timestamp, user agent)
3. Admin legal update campaign
4. Force re-acceptance on major changes
5. Full-screen modal for new legal docs
6. Block app usage until accepted
7. Consent analytics dashboard"
```

---

## 🧪 PHASE 7 — Store Readiness (iOS / Android)

**🎯 เป้าหมาย:** ส่งขึ้น App Store / Google Play ผ่าน

### Mandatory Features

#### 1. Privacy Policy
```typescript
// In-app accessible
const PRIVACY_POLICY_URL = 'https://meerak.app/privacy';

// Must include:
- Data collection details
- Third-party services (maps, payment)
- Data retention period
- User rights (access, delete)
- Contact information
```

#### 2. Data Deletion Flow
```typescript
interface DataDeletionRequest {
  user_id: string;
  requested_at: string;
  
  // Data to delete
  includes: [
    'profile',
    'jobs',
    'messages',
    'payment_history',
    'kyc_documents'
  ];
  
  // Retention (legal requirement)
  financial_records_retained: true;  // Keep for 7 years
  dispute_records_retained: true;    // Keep for 3 years
  
  // Status
  status: 'pending' | 'processing' | 'completed';
  completed_at?: string;
}
```

#### 3. Account Delete
```typescript
interface AccountDeletion {
  user_id: string;
  
  // Pre-checks
  has_pending_jobs: boolean;
  has_pending_payments: boolean;
  has_active_disputes: boolean;
  
  // If any true → show warning, block deletion
  
  // Process
  anonymize_data: boolean;        // Replace PII with "Deleted User"
  keep_transaction_records: boolean;  // For accounting
  
  // Completed
  deleted_at: string;
}
```

#### 4. Support Contact
```typescript
const SUPPORT_CHANNELS = {
  email: 'support@meerak.app',
  phone: '+66 2 XXX XXXX',
  line: '@meerak',
  in_app_chat: true,
  
  // Response SLA
  email_response: '24 hours',
  phone_hours: '9:00-18:00 (Mon-Fri)',
  line_response: '2 hours'
};
```

#### 5. Abuse Report
```typescript
interface AbuseReport {
  id: string;
  report_type: 'harassment' | 'fraud' | 'spam' | 'inappropriate_content' | 'safety';
  
  // Target
  reported_user_id?: string;
  reported_job_id?: string;
  reported_message_id?: string;
  
  // Details
  description: string;
  evidence_urls: string[];
  
  // Reporter
  reported_by: string;
  reported_at: string;
  
  // Status
  status: 'pending' | 'under_review' | 'actioned' | 'dismissed';
  reviewed_by?: string;
  action_taken?: string;
}
```

### Store Submission Checklist

#### iOS App Store
- [ ] Privacy Policy URL in app metadata
- [ ] Data deletion flow accessible in Settings
- [ ] App uses Sign in with Apple (if other social logins exist)
- [ ] Location permission explanation
- [ ] Camera/Photo permission explanation
- [ ] No hidden features or test code
- [ ] App icon (1024x1024)
- [ ] Screenshots (all device sizes)
- [ ] Age rating declared correctly

#### Google Play
- [ ] Privacy Policy URL in Play Console
- [ ] Data Safety section completed
- [ ] Target API level 33+ (Android 13)
- [ ] Location permission explanation
- [ ] Camera/Storage permission explanation
- [ ] Feature graphic (1024x500)
- [ ] Screenshots (phone + tablet)
- [ ] Content rating questionnaire

### Accept Criteria
- ✅ Privacy policy accessible & up-to-date
- ✅ Data deletion flow works end-to-end
- ✅ Account delete available in Settings
- ✅ Support contact visible & responsive
- ✅ Abuse report submission works
- ✅ All store requirements met

### Cursor Prompt
```
"Prepare app for store submission:
1. Add Privacy Policy page (accessible in-app)
2. Implement data deletion request flow
3. Add account delete in Settings (with pre-checks)
4. Add support contact page (email, phone, Line)
5. Implement abuse report system
6. Add permission explanations
7. Complete store metadata checklist"
```

---

## 📊 Overall Progress

### Completed ✅
- Phase 2: Location Tracking
- Phase 3: Arrival Confirmation
- Phase 4: Before/After Photos
- Phase 5: Escrow Payment
- Phase 6: Rating & Reviews

### Remaining 🚧
- Phase 0: Foundation Lock (Backend stability)
- Phase 1: Authentication & OTP
- Phase 2: KYC (Identity Verification)
- Phase 3: Payment Gateway & Ledger
- Phase 4: Admin Dashboard
- Phase 5: Dispute System
- Phase 6: Legal & Compliance
- Phase 7: Store Readiness

---

## 🎯 Next Recommended Phase

**Phase 0: Foundation Lock** ควรทำก่อนทุกอย่าง เพราะ:
- ✅ ป้องกัน schema พัง
- ✅ Debug ง่าย (trace_id, request_id)
- ✅ Audit trail ครบถ้วน
- ✅ Base ที่แข็งแรงก่อน scale

---

**Cursor Command to Start Phase 0:**
```
"Let's start Phase 0: Foundation Lock. 
1. Review current database schema
2. Add created_at/updated_at to all tables
3. Create request_id/trace_id system
4. Implement bill_no/transaction_no generators
5. Setup audit logging
6. Document schema freeze"
```
