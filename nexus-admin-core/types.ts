
export enum AppStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  DEPRECATED = 'DEPRECATED'
}

export type AdminRole = 'SUPER_ADMIN' | 'SUPPORT' | 'ACCOUNTANT' | 'DEVELOPER' | 'ADMIN' | 'AUDITOR' | 'STAFF_KYC';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatar?: string;
  /** ความสามารถเสริม (JWT / session) เช่น FINANCIAL_AUDIT_READ */
  permissions?: string[];
}

export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: 'ACTIVE' | 'SUSPENDED';
  lastLogin: string;
  addedAt: string;
  permissions: string[]; // List of modules they can access
}

export interface MobileUser {
  id: string;
  username: string;
  email: string;
  lastActive: string;
  platform: 'iOS' | 'Android';
  status: 'online' | 'offline' | 'banned' | 'frozen';
  totalSpent: number;
  lastIp: string;
}

export interface FeatureFlags {
  enableSignups: boolean;
  enablePayments: boolean;
  enableJobPosting: boolean;
  enableChat: boolean;
  enablePromoVouchers: boolean;
  maintenanceMode: boolean;
}

/** ข้อความ/สวิตช์ที่ mobile โหลดจาก GET /api/app/bootstrap — แก้ได้ทันทีโดยไม่ต้อง build ใหม่ */
export interface MobileAppRemote {
  paymentNoticeTh: string;
  paymentNoticeEn: string;
  transportNoticeTh: string;
  transportNoticeEn: string;
  promoNoticeTh: string;
  promoNoticeEn: string;
  showPromoFundBalance: boolean;
  complianceSupportEmail: string;
}

export interface ServerConfig {
  iosMinVersion: string;
  androidMinVersion: string;
  welcomeMessage: string;
  forceUpdateMessage: string;
  iosStoreUrl: string;
  playStoreUrl: string;
  pushNotificationEnabled: boolean;
  remote: MobileAppRemote;
  featureFlags: FeatureFlags;
}

export interface SystemConfig {
  environment: 'Development' | 'Staging' | 'Production';
  debugMode: boolean;
  useFirebase: boolean;
  apiRateLimit: number;
  connectionTimeout: number;
  maxConcurrentConnections: number;
  databasePoolSize: number;
  cacheEnabled: boolean;
  ipWhitelist: string;
}

export interface AnalyticsData {
  name: string;
  users: number;
  revenue: number;
  sessions: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  source: 'API' | 'DB' | 'AUTH' | 'SYSTEM' | 'SECURITY';
  ip?: string;
  adminUser?: string;
}

export interface PushNotification {
  id: string;
  title: string;
  message: string;
  target: 'All' | 'Landing' | 'Mobile';
  sentAt: string;
  status: 'Sent' | 'Scheduled' | 'Failed';
  openRate: number;
}

/** Slug สำหรับฟิลด์ placements แบนเนอร์ — ต้องตรงกับ mobile + GET /api/banners?placement= */
export type BannerPlacementSlug = 'home' | 'welcome' | 'job_detail';

export interface AppBanner {
  id: string;
  title: string;
  imageUrl: string;
  actionUrl: string;
  isActive: boolean;
  order: number;
  startDate: string;
  endDate: string;
  clicks: number;
  /** เปิด bottom sheet — แยกจาก claims */
  sheetOpens?: number;
  claims?: number;
  /** สัดว่นสไลด์: hero | strip | portrait — null = ค่า default จากแอป */
  slideHeight?: 'hero' | 'strip' | 'portrait' | null;
  promoCode?: string | null;
  discountMaxBaht?: number | null;
  discountDescription?: string | null;
  /** fixed_baht = ลดเป็นบาท; percent = ลด % ของราคางาน จำกัดด้วย discountMaxBaht */
  discountMode?: 'fixed_baht' | 'percent';
  discountPercent?: number | null;
  /** ยอดเติมเงินสะสมขั้นต่ำ (บาท) ก่อนรับโค้ด */
  minCumulativeTopupThb?: number;
  /** ใช้ส่วนลดได้เฉพาะการชำระงานจ้างครั้งแรก */
  firstPaidJobOnly?: boolean;
  /** ช่วงใช้โค้ดได้จริง (ISO) — คำนวณจาก promo_valid_* หรือ fallback วันแบนเนอร์ */
  promoValidFrom?: string | null;
  promoValidUntil?: string | null;
  /** ว่าง = ทุกหมวด — ตรงกับ jobs.category */
  allowedJobCategories?: string[] | null;
  /** false = ระงับรับ/ใช้โค้ด — แบนเนอร์ยังแสดงเป็นโฆษณาได้ */
  promoClaimsEnabled?: boolean;
  /** แสดงเฉพาะหน้าที่ระบุ — null/ว่าง = ทุกหน้า (home, welcome, job_detail) */
  placements?: BannerPlacementSlug[] | null;
}

export interface ClusterNode {
  id: string;
  region: string;
  status: 'Healthy' | 'High Load' | 'Critical' | 'Down';
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
}

export interface JobTransactionStats {
  time: string;
  postsPerSec: number;
  acceptsPerSec: number;
  queueBacklog: number;
  failedTransactions: number;
}

export interface JobTransaction {
  id: string;
  type: 'POST' | 'ACCEPT' | 'COMPLETE';
  userId: string;
  jobId: string;
  status: 'SUCCESS' | 'FAILED' | 'PROCESSING';
  processingTimeMs: number;
  timestamp: string;
}

export interface ShardStatus {
  id: string;
  name: string;
  range: string;
  status: 'Online' | 'Rebalancing' | 'Offline';
  load: number;
  sizeGB: number;
  iops: number;
}

export interface DRStatus {
  primaryRegion: string;
  drRegion: string;
  syncStatus: 'Synced' | 'Lagging' | 'Broken';
  rpoSeconds: number;
  lastBackup: string;
  activeRegion: 'Primary' | 'DR';
}

export interface CircuitBreaker {
  service: string;
  state: 'CLOSED' | 'OPEN' | 'HALF-OPEN';
  failureRate: number;
  lastTripTime: string | null;
  /** Backend service key (e.g. payment_gateway) for trip/reset API */
  serviceKey?: string;
}

export interface FinancialTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'JOB_PAYMENT';
  status: 'COMPLETED' | 'PENDING' | 'FLAGGED' | 'FAILED';
  fraudScore: number;
  timestamp: string;
  note?: string;
}

export interface ApiEndpointMetric {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  rpm: number;
  p95Latency: number;
  errorRate: number;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
}

export interface WafEvent {
  id: string;
  ip: string;
  country: string;
  attackType: 'SQL Injection' | 'XSS' | 'DDoS' | 'Bot' | 'Ping Flood';
  action: 'BLOCKED' | 'CHALLENGED';
  timestamp: string;
}

export interface WorkerQueueStats {
  name: string;
  pendingJobs: number;
  activeJobs: number;
  completedPerMin: number;
  failedRate: number;
  status: 'OPERATIONAL' | 'CONGESTED' | 'STALLED';
}

export interface IpBlockEntry {
  id: string;
  ip: string;
  reason: string;
  blockedAt: string;
  expiresAt: string;
  blockedBy: string;
  status: 'Active' | 'Expired';
}

export interface SecurityRule {
  id: string;
  name: string;
  type: 'Geo-Block' | 'Rate-Limit' | 'Signature' | 'Bot-Protection';
  target: string;
  action: 'BLOCK' | 'CHALLENGE' | 'ALLOW';
  isEnabled: boolean;
  hits: number;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  lastUpdated: string;
  category: 'Billing' | 'Technical' | 'Account' | 'General';
  assignedTo?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'ADMIN' | 'BOT';
  message: string;
  timestamp: string;
}

export interface AutoReplyRule {
  id: string;
  keyword: string;
  response: string;
  isEnabled: boolean;
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: 'FINANCIAL' | 'USER_GROWTH' | 'SYSTEM_HEALTH' | 'AUDIT_LOG';
  format: 'PDF' | 'CSV' | 'XLSX';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL';
  lastGenerated: string;
}

export interface ScalingPolicy {
  mode: 'MANUAL' | 'AUTO_SAVER' | 'AUTO_BALANCED' | 'AUTO_PERFORMANCE';
  minInstances: number;
  maxInstances: number;
  cpuThresholdUp: number;
  cpuThresholdDown: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
}

export interface CostMetric {
  currentMonthlyEst: number;
  budgetCap: number;
  efficiencyScore: number;
  dailyUsage: { day: string; cost: number; traffic: number }[];
}

export interface DocArticle {
  id: string;
  title: string;
  category: 'General' | 'Security' | 'Operations' | 'Infrastructure' | 'Support';
  content: string;
  lastUpdated: string;
}

export interface LegalRequest {
  id: string;
  userId: string;
  type: 'PDPA_EXPORT' | 'PDPA_DELETE' | 'LAW_ENFORCEMENT' | 'DISPUTE';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  requestDate: string;
  deadline: string;
  documents?: string[];
}

export interface LegalDoc {
  id: string;
  title: string;
  version: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  lastUpdated: string;
  effectiveDate: string;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  riskScore: number; // 0-100
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  kycStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
}

export interface CapitalAllocation {
  category: string;
  percentage: number;
  amount: number;
  description: string;
}

export interface FinancialStrategy {
  region: string;
  currency: string;
  totalReserves: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  expansionBudget: number;
  allocation: CapitalAllocation[];
  updatedAt?: string | null;
}

/** ช่วงเปลี่ยนผ่านก่อน payment gateway อนุมัติ — บัญชีรับชั่วคราว + บันทึกรับ/จ่าย (Admin manual) */
export interface PersonalSettlementAccount {
  id: string;
  label: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  /** เลขพร้อมเพย์ / เบอร์ผูกพร้อมเพย์ (ไม่มีช่องว่าง) */
  promptPayId?: string;
  /** แอปที่ใช้บ่อยสำหรับโอน (เช่น SCB EASY, K PLUS) */
  preferredMobileBankApps?: string;
  notes?: string;
  updatedAt: string;
}

export type ManualSettlementDirection = 'INBOUND' | 'OUTBOUND';

/** QR = สแกนจ่ายเข้า / แสดง QR รับ · Mobile banking = โอนผ่านแอปธนาคาร */
export type ManualSettlementChannel =
  | 'QR_PROMPTPAY'
  | 'QR_BANK_STATIC'
  | 'MOBILE_BANKING_TRANSFER'
  | 'OTHER';

export interface ManualSettlementRecord {
  id: string;
  direction: ManualSettlementDirection;
  channel: ManualSettlementChannel;
  amount: number;
  currency: 'THB';
  /** อ้างอิงงาน / ผู้ใช้ / คำอธิบายสั้นๆ */
  referenceLabel: string;
  /** เลขอ้างอิงจากสลิป / SMS */
  bankReference?: string;
  /** วันที่-เวลาโอน (ที่เห็นบนสลิป) */
  transferAt?: string;
  status: 'PENDING_RECONCILE' | 'MATCHED' | 'FLAGGED';
  notes?: string;
  /** URL สลิป (S3) หรือลิงก์ภายนอก */
  slipUrl?: string;
  createdAt: string;
  createdBy?: string;
}
