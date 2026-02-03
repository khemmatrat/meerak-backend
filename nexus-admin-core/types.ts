
export enum AppStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  DEPRECATED = 'DEPRECATED'
}

export type AdminRole = 'SUPER_ADMIN' | 'SUPPORT' | 'ACCOUNTANT' | 'DEVELOPER' | 'ADMIN' | 'AUDITOR';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatar?: string;
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
  maintenanceMode: boolean;
}

export interface ServerConfig {
  iosMinVersion: string;
  androidMinVersion: string;
  welcomeMessage: string;
  pushNotificationEnabled: boolean;
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
  target: 'All' | 'iOS' | 'Android';
  sentAt: string;
  status: 'Sent' | 'Scheduled' | 'Failed';
  openRate: number;
}

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
  totalReserves: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  expansionBudget: number;
  allocation: CapitalAllocation[];
}
