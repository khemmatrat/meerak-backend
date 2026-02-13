export enum UserRole {
  USER = "USER",
  PROVIDER = "PROVIDER",
  ADMIN = "ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
}

// Phase 2: KYC (Know Your Customer) Types
export enum KYCLevel {
  NONE = 0, // No KYC - ฿5,000 daily limit
  LITE = 1, // Basic KYC - ฿50,000 daily limit
  FULL = 2, // Full KYC - ฿500,000 daily limit
}

export enum KYCStatus {
  NOT_STARTED = "not_started",
  PENDING = "pending", // Waiting for review
  APPROVED = "approved", // KYC approved
  REJECTED = "rejected", // KYC rejected
  RESUBMIT = "resubmit", // Need to resubmit
}

export enum KYCVerificationMethod {
  MANUAL = "manual", // KYC Lite - manual review by admin
  AI_AUTO = "ai_auto", // KYC Full - AI auto-approval
}

export enum KYCDocumentType {
  THAI_ID_CARD = "thai_id_card",
  PASSPORT = "passport",
  DRIVING_LICENSE = "driving_license",
  SELFIE = "selfie",
  SELFIE_WITH_ID = "selfie_with_id",
}

export interface KYCDocument {
  id: string;
  type: KYCDocumentType;
  url: string; // Cloudinary URL (encrypted)
  secure_url?: string; // HTTPS URL
  public_id?: string; // Cloudinary public ID
  uploaded_at: string;
  file_size?: number; // In bytes
  mime_type?: string;
}

// Phase 2: Driver License & Vehicle Registration Types
export interface DriverLicense {
  id: string;
  license_number_encrypted: string; // เลขใบขับขี่ (encrypted)
  license_number_hash: string; // Hash for lookup
  license_type: string; // ประเภทใบขับขี่ (ชั่วคราว/ถาวร/สากล)
  license_class: string[]; // ชั้น (รถยนต์ส่วนบุคคล, รถจักรยานยนต์, etc.)
  issue_date: string; // วันที่ออกบัตร
  expiry_date: string; // วันหมดอายุ
  license_photo_url: string; // รูปใบขับขี่
  status: "active" | "expired" | "suspended";
  verified_at?: string;
}

export interface VehicleRegistration {
  id: string;
  license_plate_encrypted: string; // ทะเบียนรถ (encrypted)
  license_plate_hash: string; // Hash for lookup
  vehicle_type: "car" | "motorcycle" | "truck" | "other";
  vehicle_brand: string; // ยี่ห้อ (Toyota, Honda, etc.)
  vehicle_model: string; // รุ่น (Camry, Civic, etc.)
  vehicle_year: number; // ปีจดทะเบียน
  vehicle_color: string; // สี
  vehicle_province: string; // จังหวัดจดทะเบียน
  chassis_number_encrypted?: string; // เลขตัวถัง (optional, encrypted)
  registration_book_photo_url: string; // รูปเล่มทะเบียนรถ
  registration_expiry_date: string; // วันหมดอายุ พ.ร.บ.
  owner_name_encrypted: string; // ชื่อเจ้าของรถ (encrypted)
  is_owner: boolean; // เป็นเจ้าของรถเองหรือไม่
  relationship_to_owner?: string; // ความสัมพันธ์กับเจ้าของ (ถ้าไม่ใช่เจ้าของ)
  status: "active" | "expired" | "sold";
  verified_at?: string;
}

export interface KYCRecord {
  id: string;
  user_id: string;

  // KYC Level & Status
  kyc_level: KYCLevel;
  kyc_status: KYCStatus;
  verification_method?: KYCVerificationMethod; // 'manual' or 'ai_auto'

  // Personal Information (ENCRYPTED)
  national_id_encrypted?: string; // เลขบัตรประชาชน (encrypted)
  national_id_hash?: string; // Hash for lookup (not reversible)
  first_name_encrypted?: string; // ชื่อจริง (encrypted)
  last_name_encrypted?: string; // นามสกุล (encrypted)
  date_of_birth_encrypted?: string; // วันเกิด (encrypted)
  address_encrypted?: string; // ที่อยู่ (encrypted)

  // Documents
  documents: KYCDocument[];

  // Driver License & Vehicle (Optional - for providers who drive)
  driver_license?: DriverLicense;
  vehicles?: VehicleRegistration[]; // สามารถมีรถได้หลายคัน

  // AI Verification Results (for KYC Full)
  ai_verification?: {
    ocr_results?: {
      id_front_confidence: number;
      id_back_confidence: number;
      overall_confidence: number;
      data_extracted: boolean;
      validated: boolean;
    };
    face_match_results?: {
      confidence: number;
      match: boolean;
      quality_score: number;
    };
    liveness_results?: {
      confidence: number;
      is_live: boolean;
      spoof_detected: boolean;
    };
    auto_approved: boolean;
    ai_confidence_score: number; // Overall AI confidence (0-100)
    processed_at: string;
  };

  // Review Info
  submitted_at?: string;
  reviewed_at?: string;
  reviewed_by?: string; // Admin user ID
  rejection_reason?: string;
  notes?: string; // Admin notes

  // Daily Limits (based on KYC level)
  daily_transaction_limit: number; // In THB
  daily_withdrawal_limit: number; // In THB

  // Metadata
  ip_address?: string;
  user_agent?: string;

  // Tracing
  request_id?: string;
  trace_id?: string;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// Daily limits by KYC level
export const KYC_LIMITS = {
  [KYCLevel.NONE]: {
    daily_transaction_limit: 5000, // ฿5,000
    daily_withdrawal_limit: 2000, // ฿2,000
    description: "No KYC - Basic usage",
  },
  [KYCLevel.LITE]: {
    daily_transaction_limit: 50000, // ฿50,000
    daily_withdrawal_limit: 20000, // ฿20,000
    description: "KYC Lite - ID card verified",
  },
  [KYCLevel.FULL]: {
    daily_transaction_limit: 500000, // ฿500,000
    daily_withdrawal_limit: 200000, // ฿200,000
    description: "KYC Full - Face + ID verified",
  },
};
export interface User {
  id: number;
  email: string;
  username: string;
  name?: string;
  phone?: string;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
}

export type AdminRole = "super_admin" | "support" | "accountant";

export enum JobStatus {
  OPEN = "open",
  ACCEPTED = "accepted",
  IN_PROGRESS = "in_progress",
  WAITING_FOR_APPROVAL = "waiting_for_approval",
  WAITING_FOR_PAYMENT = "waiting_for_payment",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  DISPUTE = "dispute",
}
// ในไฟล์ ../types/index.ts เพิ่ม:

export interface Provider {
  id: string;
  name: string;
  rating: number;
  completedJobs: number;
  status: "available" | "on_job" | "offline";
  location: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  skills?: string[];
  hourlyRate?: number;
  joinedDate?: Date;
  verificationStatus?: "basic" | "verified" | "premium";
  currentJobId?: string;
  currentJobTitle?: string;
  appliedJobId?: string;
  appliedJobTitle?: string;
  appliedAt?: Date;
  applicants?: Applicant[];
}
// 🔥 NEW: เพิ่ม Applicant interface
export interface Applicant {
  id: string;
  providerId: string;
  providerName: string;
  appliedAt: Date | string;
  message?: string;
  quote?: number;
  status?: "pending" | "accepted" | "rejected";
}

export enum MessageType {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  SYSTEM = "system",
}

export enum PaymentMethod {
  PROMPTPAY = "promptpay",
  CREDIT_CARD = "credit_card",
  WALLET = "wallet",
}

// Phase 3: Immutable Payment Ledger (append-only)
export type LedgerEventType =
  | "payment_created"
  | "payment_completed"
  | "payment_failed"
  | "payment_expired"
  | "payment_refunded"
  | "escrow_held"
  | "escrow_released"
  | "escrow_refunded";

export interface LedgerEntry {
  id: string;
  event_type: LedgerEventType;
  payment_id: string;
  gateway: "promptpay" | "stripe" | "truemoney" | "wallet" | "bank_transfer";
  job_id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "expired" | "refunded";
  bill_no: string;
  transaction_no: string;
  payment_no?: string;
  user_id?: string;
  provider_id?: string;
  metadata?: Record<string, unknown>;
  request_id?: string;
  trace_id?: string;
  created_at: string;
  created_by?: string;
}
// ตำแหน่งจาก Map (ยังไม่รู้ที่อยู่)
export type LatLng = {
  lat: number;
  lng: number;
};

// ที่อยู่ที่ผ่าน reverse geocode แล้ว
export type JobLocation = LatLng & {
  fullAddress: string;
  district?: string;
  area?: string;
  province?: string;
};

// กำหนดหมวดหมู่ของงานและสกิลต่างๆ
export enum JobCategory {
  CLEANING = "Cleaning",
  DATING = "Dating",
  DRIVER = "Driver",
  ELECTRICIAN = "Electrician",
}

// กำหนดสถานะของการอบรมหลักสูตร
export enum TrainingStatus {
  NOT_ENROLLED = "NOT_ENROLLED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

// โครงสร้างข้อมูลสำหรับหลักสูตรอบรม
export interface TrainingModule {
  id: string;
  name: string;
  category: JobCategory;
  status: TrainingStatus; // สถานะการอบรมของผู้ใช้สำหรับหลักสูตรนี้
  videoUrl?: string;
  description?: string;
  quiz?: QuizQuestion[];
  passingScore?: number;
}

export interface Location {
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  address?: string;
}

export interface Review {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_avatar?: string;
  target_user_id: string;
  rating: number;
  comment: string;
  tags?: string[];
  isHidden?: boolean;
  created_at: string;
}

export interface Dispute {
  id: string;
  job_id: string;
  reporter_id: string;
  reason: string;
  status: "pending" | "resolved" | "rejected";
  admin_comment?: string;
  created_at: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  verified: boolean;
}

export interface BankAccount {
  id: string;
  type: "bank" | "truemoney" | "stripe" | "omise";
  provider_name: string;
  account_number: string;
  account_name: string;
  is_default?: boolean;
}

export interface AvailabilitySlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  user: string;
  isProvider: boolean;
  // เพิ่มข้อมูลพื้นฐานสำหรับ KYC
  birth_date?: string | null; // วันที่เกิด
  id_card_number?: string | null; // เลขบัตรประชาชน
  password?: string;
  bio?: string;
  avatar_url?: string;
  role: UserRole;
  kyc_level?:
    | "level_1"
    | "level_2"
    | "pending_review"
    | "verified"
    | "rejected";
  kyc_status?:
    | "not_submitted"
    | "pending_ai_verification"
    | "verified"
    | "rejected"
    | "manual_review";
  kyc_submitted_at?: string | null;
  kyc_docs?: {
    id_card_front?: string | null;
    id_card_back?: string | null;
    selfie_photo?: string | null;
    driving_license_front?: string | null;
    driving_license_back?: string | null;
    selfie_video?: string | null;
  };
  // เพิ่มฟิลด์สำหรับข้อมูลพื้นฐาน KYC (backup สำหรับ Cloud Function)
  kyc_full_name?: string | null;
  kyc_birth_date?: string | null;
  kyc_id_card_number?: string | null;
  kyc_note?: string;

  // Thai ID & Documents (from Settings)
  national_id?: string; // เลขบัตรประชาชน
  id_card_front_url?: string; // รูปบัตรหน้า
  id_card_back_url?: string; // รูปบัตรหลัง
  driver_license_number?: string; // เลขใบขับขี่
  driver_license_photo_url?: string; // รูปใบขับขี่
  driver_license_expiry?: string; // วันหมดอายุใบขับขี่
  vehicle_license_plate?: string; // ทะเบียนรถ
  vehicle_registration_photo_url?: string; // รูปเล่มทะเบียนรถ

  skills?: string[];
  certifications?: Certification[];
  rating?: number;
  reviews_count?: number;
  wallet_balance?: number;
  wallet_pending?: number; // ✅ เพิ่ม property นี้
  wallet_pending_release_at?: string; // ✅ เวลาที่เงินจะปล่อย
  pending_release_at?: string | null; // ✅ เวลาที่เงินจะปล่อย
  wallet_available?: number; // ✅ เงินที่พร้อมถอนจริงๆ
  completed_jobs_count?: number;
  created_at?: string;

  location?: Location;
  gender?: "male" | "female" | "lgbtq" | "other";
  age?: number;
  university?: string;
  height?: number;
  looks?: string[];
  gallery?: string[];

  is_online?: boolean;
  is_boosted?: boolean;
  boost_expires_at?: string;
  is_banned?: boolean;
  notifications_enabled?: boolean;
  bank_accounts?: BankAccount[];

  availability?: AvailabilitySlot[]; // Calendar Busy Slots

  // Hybrid System Additions
  trainings?: TrainingModule[];
}
export interface PendingFunds {
  id: string;
  job_id: string;
  amount: number;
  created_at: string;
  scheduled_release: string;
  status: "pending" | "released" | "frozen";
}

export interface Transaction {
  id: string;
  user_id?: string;
  type: "deposit" | "withdrawal" | "payment" | "payment_out" | "income" | "tip";
  amount: number;
  date: string;
  description: string;
  status:
    | "completed"
    | "pending"
    | "failed"
    | "waiting_admin"
    | "pending_release";
  bank_info?: string;
  related_job_id?: string;
  // ✅ เพิ่ม release_info สำหรับสถานะ pending_release
  release_info?: {
    scheduled_release: string;
    current_status: "pending" | "released" | "cancelled";
    released_at?: string;
  };

  // ✅ หรือเพิ่มฟิลด์แยก
  release_deadline?: string;
  release_status?: "pending" | "released" | "frozen";
  released_at?: string;
  // ✅ เพิ่ม field ใหม่เพื่อแยกประเภทธุรกรรม
  transaction_type?:
    | "client_payment"
    | "provider_income"
    | "tip"
    | "deposit"
    | "withdrawal";
  // ✅ เพิ่ม field สำหรับฝั่งที่เกี่ยวข้อง
  visible_to_roles?: UserRole[]; // ['CLIENT', 'PROVIDER'] ใครเห็นบ้าง
  // ✅ เพิ่ม field ใหม่:
  user_role_in_job?: "client" | "provider"; // บันทึก role ของ user ใน job นี้
  job_created_by?: string; // client id
  job_accepted_by?: string; // provider id
}

export interface Job {
  id: string;
  category: string;
  title: string;
  description: string;
  price: number;
  location: JobLocation;
  datetime: string;
  status: JobStatus;

  started_at?: string;
  created_by: string;
  created_by_name?: string;
  created_by_avatar?: string;

  accepted_by?: string;
  accepted_by_name?: string;
  accepted_by_phone?: string;

  assigned_to?: string;
  assigned_to_name?: string;

  duration_minutes?: number;
  duration_hours?: number; // For Dating/Lifestyle
  tips_amount?: number; // Extra earnings

  paid_at?: string;
  payment_status?: "pending" | "paid";
  submitted_at?: string;
  created_at?: string;
  updated_at?: string;
  created_by_phone?: string;

  // Hybrid System Additions
  hourly_rate?: number;
  required_training?: string;
  clientName?: string;
  clientId?: string;
  providerId?: string | null;
  providerName?: string; // ชื่อ provider
  providerPhone?: string; // เบอร์โทร provider
  completed_at?: string;
  has_reviewed?: boolean;
  auto_approve_start_time?: string; // ✅ เพิ่มตรงนี้
  client_viewed_notification?: boolean; // ✅ เพิ่มตรงนี้
  client_notified_at?: string | null;
  // ✅ เพิ่ม field ใหม่สำหรับการชำระเงิน
  payment_held?: boolean;
  payment_held_amount?: number;
  payment_held_at?: string;
  payment_held_by?: string;

  // 📸 Phase 4: Before/After Photos (Work Proof)
  before_photo_url?: string;
  after_photo_url?: string;
  photos_uploaded_at?: string;
  arrived_at?: string; // เวลาที่ Provider มาถึง
  auto_payment_deadline?: string;

  // 💰 Phase 5: Escrow Payment System
  escrow_amount?: number; // จำนวนเงินที่กัน
  escrow_held_at?: string; // เวลาที่กันเงิน
  escrow_status?: "held" | "released" | "disputed" | "refunded";

  // Dispute Window (5 minutes)
  work_submitted_at?: string; // เวลาที่ Provider ส่งงาน
  dispute_window_ends_at?: string; // เวลาที่ dispute window หมดอายุ
  dispute_status?: "none" | "pending" | "resolved";
  dispute_reason?: string;
  disputed_at?: string;
  disputed_by?: string;

  // Auto-approve
  auto_approved?: boolean;
  auto_approved_at?: string;

  // Payment Release
  payment_released?: boolean;
  payment_released_at?: string;
  payment_released_to?: string; // Provider ID

  // Provider Withdrawal
  withdrawal_requested?: boolean;
  withdrawal_requested_at?: string;
  withdrawal_completed?: boolean;
  withdrawal_completed_at?: string;

  // ✅ เพิ่ม payment_details สำหรับจัดการเงินรอปล่อย
  payment_details?: {
    amount: number;
    provider_receive: number;
    fee_amount: number;
    fee_percent: number;
    released_status: "pending" | "released";
    release_deadline: string;
    released_at?: string;
  };
  // เพิ่มสำหรับระบบ auto-approve
  // 🔥 ผู้สมัครงาน (ถ้ามีระบบสมัครงาน)
  applicants?: Array<{
    id: string;
    providerId: string;
    providerName: string;
    appliedAt: Date | string;
    status?: "pending" | "accepted" | "rejected";
  }>;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  type: MessageType;
  text?: string;
  media_url?: string;
  timestamp: string;
  is_me?: boolean;
  created_at?: any;
}

export interface UserNotification {
  id: string;
  user_id?: string; // optional สำหรับ admin_broadcast
  title: string;
  message: string;
  type: "job_match" | "system" | "payment" | "review" | "review_reminder" | "admin_broadcast";
  related_id?: string;
  is_read: boolean;
  created_at: string;
  review_target?: string;
  data?: Record<string, any>;
  job_id?: string;
}

export interface Voucher {
  code: string;
  discount_amount: number;
  min_spend: number;
  description: string;
  active?: boolean;
}

export interface SystemConfig {
  commission_rates: Record<string, number>;
  boost_price: number;
  categories: string[];
}

export interface SystemBanner {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "promo";
  active: boolean;
  created_at: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

export interface AdminLog {
  id: string;
  admin_email: string;
  role: AdminRole;
  action: string;
  target_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface CompanyLedgerItem {
  id: string;
  type: "expense" | "owner_withdrawal";
  category:
    | "personnel"
    | "server"
    | "marketing"
    | "office"
    | "depreciation"
    | "insurance"
    | "profit_taking"
    | "other";
  amount: number;
  description: string;
  date: string;
  recorded_by: string;
}

// ...existing code...
/**
 * Training-related domain types
 */
export type Course = {
  id: string;
  title: string;
  description?: string;
  lessons: Lesson[];
  category: CourseCategory; // ✅ เพิ่มหมวดหมู่
};

export type Lesson = {
  id: string;
  title: string;
  youtubeId: string;
  videoUrl?: string;
  duration?: number;
  quiz: Quiz;
};

export type Quiz = {
  id: string;
  title?: string;
  questions: Question[];
  passThreshold?: number; // percentage (default 85)
};

export type Question = {
  id: string;
  text: string;
  type: "mcq" | "multi" | "short";
  weight?: number; // default 1
  options?: Option[] | string[]; // for mcq / multi
  acceptedAnswers?: string[]; // for short answers
};

export type Option = {
  id: string;
  text: string;
  isCorrect?: boolean;
};

export type Progress = {
  courseId: string;
  lessonId: string;
  bestScore?: number;
  completed?: boolean;
  attempts?: number;
  watched?: boolean;
  lastAttemptAt?: string | null;
};
// เพิ่ม type สำหรับ DashboardStats
export type DashboardStats = {
  totalUsers: number;
  totalCourses: number;
  totalLessons: number;
  activeUsers: number;
  completionRate: number;
  recentCertificates: number;
};

// ...existing code...
export type Certificate = {
  id: string;
  userId: string;
  userName?: string;
  courseId: string;
  courseName: string;
  issuedAt: string | Date;
  certificateUrl?: string; // public URL / dataURI
  pdfUrl?: string; // legacy field used in some UI components
  expiresAt?: string | Date;
  badge?: "star" | "trophy" | string;
  revoked?: boolean;
  revokedAt?: string | Date;
};
// ...existing code...
// ...existing code...

export enum CourseCategory {
  CLEANING = "cleaning", // 1. ทักษะทำความสะอาด
  AC_REPAIR = "ac_repair", // 2. ทักษะล้างแอร์
  PLUMBING = "plumbing", // 3. ทักษะประปา
  ELECTRICAL = "electrical", // 4. ทักษะไฟฟ้า
  MOVING = "moving", // 5. ทักษะขนย้าย
  GARDENING = "gardening", // 6. ทักษะงานสวน
  PAINTING_RENOVATION = "painting_renovation", // 7. ทักษะทาสี/รีโนเวท
  APPLIANCE_REPAIR = "appliance_repair", // 8. ทักษะซ่อมเครื่องใช้ไฟฟ้า
  INTERIOR_DESIGN = "interior_design", // 9. ทักษะออกแบบภายใน
  DATING_DINING = "dating_dining", // 10. ทักษะนัดเดท/กินข้าว
  SHOPPING_BUDDY = "shopping_buddy", // 11. ทักษะเพื่อนเดินห้าง
  PARTY_COMPANION = "party_companion", // 12. ทักษะเพื่อนเที่ยว/ปาร์ตี้
  FORTUNE_TELLING = "fortune_telling", // 13. ทักษะดูดวง
  FREELANCE_QUEUE = "freelance_queue", // 14. ทักษะรับจ้างต่อคิว
  PERSONAL_CHEF = "personal_chef", // 15. เชฟส่วนตัว/ทำอาหาร
  BEAUTY_MAKEUP = "beauty_makeup", // 16. ทักษะเสริมสวย/แต่งหน้า
  MASSAGE_SPA = "massage_spa", // 17. ทักษะนวด/สปา

  // ✅ เพิ่ม 9 ทักษะใหม่
  FORKLIFT_OPERATOR = "forklift_operator", // 18. ทักษะรถยกรถไสลด์
  GAMING_BUDDY = "gaming_buddy", // 19. ทักษะหาคนเล่นเกมส์
  BODYGUARD = "bodyguard", // 20. ทักษะหาบอดี้การ์ด
  SPORTS_COMPANION = "sports_companion", // 21. ทักษะหาเพื่อนเล่นกีฬา
  PET_CARE = "pet_care", // 22. ทักษะรับดูแลสัตว์เลี้ยง
  ELDERLY_CARE = "elderly_care", // 23. ทักษะรับดูแลรับ-ส่งผู้สูงอายุ
  DEBT_COLLECTOR = "debt_collector", // 24. ทักษะหานักสิบ
  ERRANDS_SHOPPING = "errands_shopping", // 25. ทักษะฝากซื้อของ
  LAUNDRY_SERVICE = "laundry_service", // 26. ทักษะฝากซักผ้า
}

export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  [CourseCategory.CLEANING]: "ทักษะทำความสะอาด",
  [CourseCategory.AC_REPAIR]: "ทักษะล้างแอร์",
  [CourseCategory.PLUMBING]: "ทักษะประปา",
  [CourseCategory.ELECTRICAL]: "ทักษะไฟฟ้า",
  [CourseCategory.MOVING]: "ทักษะขนย้าย",
  [CourseCategory.GARDENING]: "ทักษะงานสวน",
  [CourseCategory.PAINTING_RENOVATION]: "ทักษะทาสี/รีโนเวท",
  [CourseCategory.APPLIANCE_REPAIR]: "ทักษะซ่อมเครื่องใช้ไฟฟ้า",
  [CourseCategory.INTERIOR_DESIGN]: "ทักษะออกแบบภายใน",
  [CourseCategory.DATING_DINING]: "ทักษะนัดเดท/กินข้าว",
  [CourseCategory.SHOPPING_BUDDY]: "ทักษะเพื่อนเดินห้าง",
  [CourseCategory.PARTY_COMPANION]: "ทักษะเพื่อนเที่ยว/ปาร์ตี้",
  [CourseCategory.FORTUNE_TELLING]: "ทักษะดูดวง",
  [CourseCategory.FREELANCE_QUEUE]: "ทักษะรับจ้างต่อคิว",
  [CourseCategory.PERSONAL_CHEF]: "เชฟส่วนตัว/ทำอาหาร",
  [CourseCategory.BEAUTY_MAKEUP]: "ทักษะเสริมสวย/แต่งหน้า",
  [CourseCategory.MASSAGE_SPA]: "ทักษะนวด/สปา",
  [CourseCategory.FORKLIFT_OPERATOR]: "ทักษะรถยกรถไสลด์",
  [CourseCategory.GAMING_BUDDY]: "ทักษะหาคนเล่นเกมส์",
  [CourseCategory.BODYGUARD]: "ทักษะหาบอดี้การ์ด",
  [CourseCategory.SPORTS_COMPANION]: "ทักษะหาเพื่อนเล่นกีฬา",
  [CourseCategory.PET_CARE]: "ทักษะรับดูแลสัตว์เลี้ยง",
  [CourseCategory.ELDERLY_CARE]: "ทักษะรับดูแลรับ-ส่งผู้สูงอายุ",
  [CourseCategory.DEBT_COLLECTOR]: "ทักษะหานักสิบ",
  [CourseCategory.ERRANDS_SHOPPING]: "ทักษะฝากซื้อของ",
  [CourseCategory.LAUNDRY_SERVICE]: "ทักษะฝากซักผ้า",
};

// ...existing code...
// ในไฟล์ src/types.ts เพิ่ม types ต่อไปนี้:

// สำหรับแผนที่นายจ้าง
export type EmployerLocation = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address: string;
  lat: number;
  lng: number;
  jobCount: number;
  activeJobs: number;
  completedJobs: number;
  rating?: number;
  category?: JobCategory;
  isVerified?: boolean;
  lastActive?: string;
  avatarUrl?: string;
};

// สำหรับ tracking คนขับ
export type DriverLocation = {
  driverId: string;
  driverName: string;
  phone?: string;
  currentJobId?: string;
  lat: number;
  lng: number;
  speed?: number; // km/h
  heading?: number; // degrees
  status: "available" | "on_job" | "offline" | "break";
  lastUpdate: string;
  vehicleType?: string;
  vehiclePlate?: string;
  initialZoom?: number;
};

// สำหรับสถิติงาน
export type JobStatistics = {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  cancelledJobs: number;
  totalRevenue: number;
  avgCompletionTime: number; // hours
  popularCategories: Array<{ category: string; count: number }>;
  weeklyTrend: Array<{ date: string; count: number }>;
  topEmployers: Array<{ name: string; jobCount: number }>;
  topProviders: Array<{ name: string; completedJobs: number }>;
};

// สำหรับแผนที่ filtering
export type MapFilter = {
  categories: string[];
  jobStatus: JobStatus[];
  priceRange: [number, number];
  dateRange: [string, string];
  showOnlyVerified: boolean;
  showActiveOnly: boolean;
};

export interface PaymentStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "refunded";
  transactionId?: string;
  amount: number;
  method: PaymentMethod;
  timestamp: string;
  receiptUrl?: string;
}

export interface PaymentReceipt {
  receiptId: string;
  jobId: string;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  transactionId: string;
  downloadUrl: string;
}

export interface FinancialDashboard {
  summary: {
    totalRevenue: number;
    totalJobs: number;
    activeProviders: number;
    pendingPayments: number;
  };
  earnings: any;
  pendingDisputes: any[];
}

export interface FirebaseSubscription {
  unsubscribe: () => void;
}

export interface RealtimeUpdate<T> {
  data: T;
  type: "added" | "modified" | "removed";
}

// ⭐ Phase 6: Rating & Reviews System
export interface Review {
  id: string;
  job_id: string;
  reviewer_id: string; // ผู้รีวิว (Employer หรือ Provider)
  reviewee_id: string; // ผู้ถูกรีวิว (Provider หรือ Employer)
  reviewer_type: "employer" | "provider";
  reviewee_type: "employer" | "provider";
  rating: number; // 1-5 stars
  comment?: string;
  tags: string[]; // ['polite', 'professional', 'punctual']
  tip_amount?: number; // ทิปที่ให้ (optional)
  created_at: string;
  is_verified_job: boolean; // งานจริงหรือไม่
}

export interface UserRating {
  user_id: string;
  user_type: "employer" | "provider";
  average_rating: number; // คะแนนเฉลี่ย (1-5)
  total_reviews: number; // จำนวนรีวิวทั้งหมด
  total_jobs_completed: number; // จำนวนงานที่ทำเสร็จ
  rating_breakdown: {
    // แยกตามดาว
    five_star: number;
    four_star: number;
    three_star: number;
    two_star: number;
    one_star: number;
  };
  recent_reviews: Review[]; // รีวิวล่าสุด
  updated_at: string;
}

export const REVIEW_TAGS = {
  EMPLOYER: [
    { id: "clear_instructions", label: "คำอธิบายชัดเจน", emoji: "📝" },
    { id: "good_communication", label: "สื่อสารดี", emoji: "💬" },
    { id: "fair_payment", label: "จ่ายตรงเวลา", emoji: "💰" },
    { id: "respectful", label: "ให้เกียรติ", emoji: "🤝" },
    { id: "flexible", label: "ยืดหยุ่น", emoji: "⭐" },
  ],
  PROVIDER: [
    { id: "professional", label: "มืออาชีพ", emoji: "👔" },
    { id: "punctual", label: "ตรงเวลา", emoji: "⏰" },
    { id: "polite", label: "สุภาพ", emoji: "😊" },
    { id: "quality_work", label: "งานคุณภาพ", emoji: "✨" },
    { id: "fast_service", label: "ทำงานเร็ว", emoji: "⚡" },
    { id: "clean", label: "ทำความสะอาดหลังงาน", emoji: "🧹" },
  ],
} as const;
