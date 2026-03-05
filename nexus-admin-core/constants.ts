
import { 
  AdminUser,
  AnalyticsData, 
  ApiEndpointMetric, 
  AppBanner, 
  AutoReplyRule, 
  ChatMessage, 
  CircuitBreaker,
  ClusterNode, 
  CostMetric, 
  DocArticle,
  DRStatus, 
  FinancialStrategy,
  FinancialTransaction, 
  IpBlockEntry, 
  JobTransaction,
  JobTransactionStats, 
  LegalDoc,
  LegalRequest,
  MobileUser, 
  PayoutRequest,
  PushNotification, 
  ReportTemplate, 
  ScalingPolicy, 
  SecurityRule,
  ServerConfig, 
  ShardStatus, 
  StaffProfile,
  SupportTicket, 
  SystemConfig, 
  SystemLog, 
  WafEvent, 
  WorkerQueueStats 
} from './types';

export const MOCK_ADMIN_ACCOUNTS: AdminUser[] = [
  {
    id: 'ADM-001',
    name: 'Admin Master',
    email: 'admin@nexus.com',
    role: 'SUPER_ADMIN',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
  },
  {
    id: 'ADM-002',
    name: 'Support Lead',
    email: 'support@nexus.com',
    role: 'SUPPORT',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
  }
];

export const MOCK_STAFF_LIST: StaffProfile[] = [
  { 
    id: 'STF-001', name: 'John Doe', email: 'john.d@nexus.com', role: 'SUPER_ADMIN', 
    status: 'ACTIVE', lastLogin: 'Today, 10:30 AM', addedAt: '2023-01-01', 
    permissions: ['ALL ACCESS'] 
  },
  { 
    id: 'STF-002', name: 'Jane Finance', email: 'jane.f@nexus.com', role: 'ACCOUNTANT', 
    status: 'ACTIVE', lastLogin: 'Yesterday, 04:00 PM', addedAt: '2023-05-15', 
    permissions: ['Financial Audit', 'Reports', 'User Payouts', 'Strategy'] 
  },
  { 
    id: 'STF-003', name: 'Mike Support', email: 'mike.s@nexus.com', role: 'SUPPORT', 
    status: 'ACTIVE', lastLogin: 'Today, 09:00 AM', addedAt: '2023-06-20', 
    permissions: ['User Management', 'Support Tickets', 'Push Notifications'] 
  },
  { 
    id: 'STF-004', name: 'Dev Ops', email: 'dev.ops@nexus.com', role: 'DEVELOPER', 
    status: 'SUSPENDED', lastLogin: '2023-10-01', addedAt: '2023-08-01', 
    permissions: ['System Logs', 'Cluster Health', 'API Gateway', 'App Config'] 
  }
];

export const INITIAL_CONFIG: ServerConfig = {
  iosMinVersion: '1.2.0',
  androidMinVersion: '1.4.5',
  welcomeMessage: 'ยินดีต้อนรับสู่ Nexus App! โปรโมชั่นใหม่รอคุณอยู่',
  pushNotificationEnabled: true,
  featureFlags: {
    enableSignups: true,
    enablePayments: true,
    enableJobPosting: true,
    enableChat: true,
    maintenanceMode: false
  }
};

export const INITIAL_SYSTEM_CONFIG: SystemConfig = {
  environment: 'Production',
  debugMode: false,
  useFirebase: true,  // ✅ เปิดใช้งาน Firebase เพื่อดึงข้อมูล User จริง
  apiRateLimit: 60,
  connectionTimeout: 5000,
  maxConcurrentConnections: 10000,
  databasePoolSize: 50,
  cacheEnabled: true,
  ipWhitelist: '192.168.1.1, 10.0.0.1'
};

export const MOCK_USERS: MobileUser[] = [
  { id: 'U001', username: 'somchai_dev', email: 'somchai@example.com', lastActive: '2023-10-27T10:30:00', platform: 'Android', status: 'online', totalSpent: 1500, lastIp: '182.23.11.5' },
  { id: 'U002', username: 'jane_doe', email: 'jane@example.com', lastActive: '2023-10-27T09:15:00', platform: 'iOS', status: 'offline', totalSpent: 3400, lastIp: '49.229.14.2' },
  { id: 'U003', username: 'peter_parker', email: 'peter@spidey.net', lastActive: '2023-10-26T22:00:00', platform: 'iOS', status: 'online', totalSpent: 500, lastIp: '27.55.12.9' },
  { id: 'U004', username: 'tony_stark', email: 'tony@stark.com', lastActive: '2023-10-27T11:00:00', platform: 'Android', status: 'banned', totalSpent: 99999, lastIp: '1.2.3.4' },
  { id: 'U005', username: 'natasha_r', email: 'nat@shield.gov', lastActive: '2023-10-27T08:45:00', platform: 'iOS', status: 'online', totalSpent: 2100, lastIp: '180.12.44.1' },
  { id: 'U006', username: 'steve_rogers', email: 'cap@avengers.com', lastActive: '2023-10-25T14:20:00', platform: 'Android', status: 'offline', totalSpent: 1200, lastIp: '110.168.1.5' },
  { id: 'U007', username: 'bruce_banner', email: 'hulk@smash.com', lastActive: '2023-10-27T10:05:00', platform: 'Android', status: 'frozen', totalSpent: 800, lastIp: '58.9.11.2' }
];

export const MOCK_ANALYTICS: AnalyticsData[] = [
  { name: '00:00', users: 120, revenue: 2400, sessions: 400 },
  { name: '04:00', users: 80, revenue: 1398, sessions: 210 },
  { name: '08:00', users: 450, revenue: 9800, sessions: 1200 },
  { name: '12:00', users: 980, revenue: 15400, sessions: 2800 },
  { name: '16:00', users: 850, revenue: 12200, sessions: 2400 },
  { name: '20:00', users: 1100, revenue: 18900, sessions: 3200 },
  { name: '23:59', users: 600, revenue: 8400, sessions: 1500 }
];

export const MOCK_LOGS: SystemLog[] = [
  { id: 'L001', timestamp: '10:30:05', level: 'INFO', message: 'User U001 logged in successfully', source: 'AUTH', ip: '182.23.11.5' },
  { id: 'L002', timestamp: '10:28:12', level: 'WARNING', message: 'High latency detected on API Gateway', source: 'API' },
  { id: 'L003', timestamp: '10:15:00', level: 'ERROR', message: 'Payment gateway timeout for transaction #9921', source: 'API' },
  { id: 'L004', timestamp: '10:05:30', level: 'INFO', message: 'Database backup completed', source: 'DB' },
  { id: 'L005', timestamp: '09:55:10', level: 'CRITICAL', message: 'Multiple failed login attempts detected (Brute Force)', source: 'SECURITY', ip: '185.11.22.33' },
  { id: 'L006', timestamp: '09:45:00', level: 'WARNING', message: 'Memory usage exceeded 80%', source: 'SYSTEM' }
];

export const MOCK_NOTIFICATIONS: PushNotification[] = [
  { id: 'N001', title: 'Flash Sale! ⚡️', message: 'ลดราคา 50% ทุกรายการ เฉพาะวันนี้เท่านั้น', target: 'All', sentAt: '2023-10-27 09:00', status: 'Sent', openRate: 24.5 },
  { id: 'N002', title: 'Update Available', message: 'กรุณาอัปเดตแอปเป็นเวอร์ชันล่าสุด', target: 'Android', sentAt: '2023-10-26 14:00', status: 'Sent', openRate: 15.2 },
  { id: 'N003', title: 'Welcome New Users', message: 'รับคูปองส่วนลด 100 บาท', target: 'iOS', sentAt: '2023-10-28 10:00', status: 'Scheduled', openRate: 0 }
];

export const MOCK_BANNERS: AppBanner[] = [
  { id: 'B001', title: 'Summer Sale', imageUrl: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=800&q=80', actionUrl: 'app://promotion/summer', isActive: true, order: 1, startDate: '2023-11-01', endDate: '2023-11-30', clicks: 12500 },
  { id: 'B002', title: 'New Features', imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80', actionUrl: 'app://features', isActive: true, order: 2, startDate: '2023-10-15', endDate: '2023-12-31', clicks: 8200 },
  { id: 'B003', title: 'Maintenance Notice', imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80', actionUrl: '', isActive: false, order: 3, startDate: '2023-10-25', endDate: '2023-10-26', clicks: 500 }
];

export const MOCK_CLUSTER_NODES: ClusterNode[] = Array.from({ length: 12 }).map((_, i) => ({
  id: `node-asia-se1-${i + 1}`,
  region: 'Asia-SE1',
  status: Math.random() > 0.8 ? (Math.random() > 0.5 ? 'High Load' : 'Critical') : 'Healthy',
  cpuUsage: Math.floor(Math.random() * 60) + 20,
  memoryUsage: Math.floor(Math.random() * 50) + 30,
  activeConnections: Math.floor(Math.random() * 5000) + 1000
}));

export const MOCK_JOB_STATS: JobTransactionStats[] = [
  { time: '10:00', postsPerSec: 120, acceptsPerSec: 100, queueBacklog: 400, failedTransactions: 2 },
  { time: '10:01', postsPerSec: 350, acceptsPerSec: 320, queueBacklog: 850, failedTransactions: 5 },
  { time: '10:02', postsPerSec: 580, acceptsPerSec: 550, queueBacklog: 2100, failedTransactions: 12 },
  { time: '10:03', postsPerSec: 420, acceptsPerSec: 400, queueBacklog: 1200, failedTransactions: 4 },
  { time: '10:04', postsPerSec: 250, acceptsPerSec: 230, queueBacklog: 600, failedTransactions: 1 }
];

export const MOCK_TRANSACTIONS: JobTransaction[] = [
  { id: 'TX-9982', type: 'POST', userId: 'U001', jobId: 'JOB-551', status: 'SUCCESS', processingTimeMs: 45, timestamp: '10:04:22' },
  { id: 'TX-9983', type: 'ACCEPT', userId: 'U003', jobId: 'JOB-551', status: 'PROCESSING', processingTimeMs: 120, timestamp: '10:04:23' },
  { id: 'TX-9984', type: 'POST', userId: 'U005', jobId: 'JOB-552', status: 'FAILED', processingTimeMs: 5002, timestamp: '10:04:24' },
  { id: 'TX-9985', type: 'ACCEPT', userId: 'U007', jobId: 'JOB-540', status: 'SUCCESS', processingTimeMs: 55, timestamp: '10:04:25' }
];

export const MOCK_SHARDS: ShardStatus[] = [
  { id: 'SHARD-001', name: 'User-Shard-A-F', range: 'A-F', status: 'Online', load: 45, sizeGB: 120, iops: 2500 },
  { id: 'SHARD-002', name: 'User-Shard-G-M', range: 'G-M', status: 'Online', load: 82, sizeGB: 450, iops: 5600 },
  { id: 'SHARD-003', name: 'User-Shard-N-S', range: 'N-S', status: 'Rebalancing', load: 91, sizeGB: 520, iops: 7800 },
  { id: 'SHARD-004', name: 'User-Shard-T-Z', range: 'T-Z', status: 'Online', load: 30, sizeGB: 90, iops: 1200 }
];

export const MOCK_DR_STATUS: DRStatus = {
  primaryRegion: 'Asia-SE1 (Bangkok)',
  drRegion: 'Asia-SE2 (Singapore)',
  syncStatus: 'Synced',
  rpoSeconds: 15,
  lastBackup: 'Today, 10:00 AM',
  activeRegion: 'Primary'
};

export const MOCK_CIRCUIT_BREAKERS: CircuitBreaker[] = [
  { service: 'Payment Gateway', state: 'CLOSED', failureRate: 0.1, lastTripTime: null },
  { service: 'Map/Location API', state: 'HALF-OPEN', failureRate: 15.5, lastTripTime: '10:02:00' },
  { service: 'SMS Provider', state: 'CLOSED', failureRate: 0.5, lastTripTime: '08:30:00' },
  { service: 'Image Processing', state: 'OPEN', failureRate: 100, lastTripTime: '10:05:00' }
];

export const MOCK_FINANCIAL_TXS: FinancialTransaction[] = [
  { id: 'FTX-1001', userId: 'U004', amount: 50000, type: 'DEPOSIT', status: 'FLAGGED', fraudScore: 92, timestamp: '10:05:12', note: 'Unusual location' },
  { id: 'FTX-1002', userId: 'U001', amount: 500, type: 'JOB_PAYMENT', status: 'COMPLETED', fraudScore: 5, timestamp: '10:04:55' },
  { id: 'FTX-1003', userId: 'U007', amount: 1200, type: 'WITHDRAWAL', status: 'PENDING', fraudScore: 45, timestamp: '10:04:10' },
  { id: 'FTX-1004', userId: 'U002', amount: 200000, type: 'WITHDRAWAL', status: 'FLAGGED', fraudScore: 88, timestamp: '10:01:22', note: 'Exceeds daily limit' },
  { id: 'FTX-1005', userId: 'U003', amount: 1500, type: 'JOB_PAYMENT', status: 'COMPLETED', fraudScore: 2, timestamp: '10:00:05' }
];

export const MOCK_API_METRICS: ApiEndpointMetric[] = [
  { path: '/api/v1/jobs/post', method: 'POST', rpm: 4500, p95Latency: 250, errorRate: 0.5, status: 'HEALTHY' },
  { path: '/api/v1/jobs/accept', method: 'POST', rpm: 5200, p95Latency: 180, errorRate: 0.2, status: 'HEALTHY' },
  { path: '/api/v1/feed', method: 'GET', rpm: 45000, p95Latency: 800, errorRate: 2.1, status: 'DEGRADED' },
  { path: '/api/v1/payment/checkout', method: 'POST', rpm: 800, p95Latency: 450, errorRate: 0.1, status: 'HEALTHY' },
  { path: '/api/v1/search', method: 'GET', rpm: 12000, p95Latency: 1200, errorRate: 5.5, status: 'DEGRADED' }
];

export const MOCK_WAF_EVENTS: WafEvent[] = [
  { id: 'WAF-991', ip: '185.10.1.1', country: 'RU', attackType: 'SQL Injection', action: 'BLOCKED', timestamp: '10:05:00' },
  { id: 'WAF-992', ip: '202.14.55.2', country: 'CN', attackType: 'DDoS', action: 'BLOCKED', timestamp: '10:04:45' },
  { id: 'WAF-993', ip: '192.168.1.50', country: 'TH', attackType: 'Bot', action: 'CHALLENGED', timestamp: '10:04:30' },
  { id: 'WAF-994', ip: '45.22.11.9', country: 'US', attackType: 'Ping Flood', action: 'BLOCKED', timestamp: '10:04:15' }
];

export const MOCK_WORKER_QUEUES: WorkerQueueStats[] = [
  { name: 'image-resize', pendingJobs: 4500, activeJobs: 50, completedPerMin: 1200, failedRate: 0.5, status: 'CONGESTED' },
  { name: 'email-notifications', pendingJobs: 120, activeJobs: 20, completedPerMin: 500, failedRate: 0.01, status: 'OPERATIONAL' },
  { name: 'push-notifications', pendingJobs: 25000, activeJobs: 200, completedPerMin: 15000, failedRate: 1.2, status: 'OPERATIONAL' },
  { name: 'financial-settlement', pendingJobs: 50, activeJobs: 5, completedPerMin: 60, failedRate: 0.0, status: 'OPERATIONAL' },
  { name: 'report-generation', pendingJobs: 8, activeJobs: 2, completedPerMin: 2, failedRate: 12.5, status: 'STALLED' }
];

export const MOCK_BLOCKED_IPS: IpBlockEntry[] = [
  { id: 'BLK-001', ip: '185.220.101.5', reason: 'Repeated SQL Injection Attempts', blockedAt: '2023-10-27 08:30', expiresAt: 'Permanent', blockedBy: 'AdminMaster', status: 'Active' },
  { id: 'BLK-002', ip: '45.155.205.10', reason: 'High rate limit violation (DDoS)', blockedAt: '2023-10-27 09:45', expiresAt: '2023-10-28 09:45', blockedBy: 'System WAF', status: 'Active' },
  { id: 'BLK-003', ip: '103.22.14.5', reason: 'Bot spamming registration', blockedAt: '2023-10-26 15:00', expiresAt: '2023-11-26 15:00', blockedBy: 'AdminMaster', status: 'Active' }
];

export const MOCK_SECURITY_RULES: SecurityRule[] = [
  { id: 'RULE-001', name: 'Block High Risk Countries', type: 'Geo-Block', target: 'RU, CN, KP', action: 'BLOCK', isEnabled: true, hits: 15420 },
  { id: 'RULE-002', name: 'Rate Limit: Login', type: 'Rate-Limit', target: 'Path: /api/auth/login', action: 'CHALLENGE', isEnabled: true, hits: 450 },
  { id: 'RULE-003', name: 'Bot Protection (Aggressive)', type: 'Bot-Protection', target: 'Global', action: 'CHALLENGE', isEnabled: false, hits: 0 },
  { id: 'RULE-004', name: 'Block Ping Floods (ICMP)', type: 'Signature', target: 'Protocol: ICMP', action: 'BLOCK', isEnabled: true, hits: 2200 }
];

export const MOCK_TICKETS: SupportTicket[] = [
  { id: 'TCK-5512', userId: 'U001', subject: 'โอนเงินแล้วยอดไม่เข้า', status: 'OPEN', priority: 'URGENT', lastUpdated: '10:30 AM', category: 'Billing' },
  { id: 'TCK-5513', userId: 'U002', subject: 'ขอเปลี่ยนเบอร์โทรศัพท์', status: 'IN_PROGRESS', priority: 'MEDIUM', lastUpdated: '10:15 AM', category: 'Account', assignedTo: 'AdminSafe' },
  { id: 'TCK-5514', userId: 'U005', subject: 'แอปค้างหน้าโหลด', status: 'OPEN', priority: 'HIGH', lastUpdated: '09:45 AM', category: 'Technical' },
  { id: 'TCK-5510', userId: 'U003', subject: 'สอบถามโปรโมชั่น', status: 'RESOLVED', priority: 'LOW', lastUpdated: 'Yesterday', category: 'General' }
];

export const MOCK_CHAT_HISTORY: ChatMessage[] = [
  { id: 'MSG-1', sender: 'USER', message: 'สวัสดีครับ ผมโอนเงินไป 500 บาทเมื่อกี้ แต่ยอดในแอปไม่ขึ้นครับ', timestamp: '10:28 AM' },
  { id: 'MSG-2', sender: 'BOT', message: 'สวัสดีครับ ระบบได้รับข้อความของคุณแล้ว เจ้าหน้าที่กำลังตรวจสอบให้นะครับ (Ticket #TCK-5512)', timestamp: '10:28 AM' }
];

export const MOCK_AUTO_REPLY_RULES: AutoReplyRule[] = [
  { id: 'AR-01', keyword: 'โอนเงิน', response: 'หากพบปัญหาโอนเงิน กรุณาส่งสลิปโอนเงินมาในแชทนี้ เพื่อให้ระบบตรวจสอบยอดเงินอัตโนมัติครับ', isEnabled: true },
  { id: 'AR-02', keyword: 'รหัสผ่าน', response: 'คุณสามารถรีเซ็ตรหัสผ่านได้ที่เมนู "ลืมรหัสผ่าน" ในหน้า Login ครับ', isEnabled: true },
  { id: 'AR-03', keyword: 'ลบข้อมูล', response: 'การลบข้อมูลบัญชีต้องดำเนินการผ่าน Email support@nexus.com เพื่อยืนยันตัวตนครับ', isEnabled: false }
];

export const MOCK_REPORTS: ReportTemplate[] = [
  { id: 'RPT-001', name: 'รายงานสรุปรายได้ประจำวัน', type: 'FINANCIAL', format: 'PDF', frequency: 'DAILY', lastGenerated: 'Today, 06:00 AM' },
  { id: 'RPT-002', name: 'ยอดผู้ใช้งานใหม่ (User Growth)', type: 'USER_GROWTH', format: 'CSV', frequency: 'WEEKLY', lastGenerated: '26 Oct 2023' },
  { id: 'RPT-003', name: 'System Audit Log', type: 'AUDIT_LOG', format: 'XLSX', frequency: 'MONTHLY', lastGenerated: '01 Oct 2023' }
];

export const INITIAL_SCALING_POLICY: ScalingPolicy = {
  mode: 'AUTO_BALANCED',
  minInstances: 2,
  maxInstances: 10,
  cpuThresholdUp: 70,
  cpuThresholdDown: 30,
  scaleUpCooldown: 60,
  scaleDownCooldown: 300
};

export const MOCK_COST_METRICS: CostMetric = {
  currentMonthlyEst: 4500,
  budgetCap: 6000,
  efficiencyScore: 88,
  dailyUsage: [
    { day: 'Mon', cost: 145, traffic: 52000 },
    { day: 'Tue', cost: 142, traffic: 49000 },
    { day: 'Wed', cost: 155, traffic: 61000 },
    { day: 'Thu', cost: 148, traffic: 54000 },
    { day: 'Fri', cost: 165, traffic: 72000 },
    { day: 'Sat', cost: 180, traffic: 85000 },
    { day: 'Sun', cost: 175, traffic: 81000 }
  ]
};

export const MOCK_DOCS: DocArticle[] = [
  { id: 'DOC-001', title: 'วิธีใช้งาน Security Center และการบล็อก IP', category: 'Security', lastUpdated: '2023-10-27', content: 'Security Center Guide...' },
  { id: 'DOC-002', title: 'การกู้คืนระบบเมื่อเกิดภัยพิบัติ (Disaster Recovery)', category: 'Infrastructure', lastUpdated: '2023-10-25', content: 'DR Guide...' }
];

export const MOCK_LEGAL_REQUESTS: LegalRequest[] = [
  { id: 'LGL-101', userId: 'U002', type: 'PDPA_EXPORT', status: 'PENDING', requestDate: '2023-10-27', deadline: '2023-11-26' },
  { id: 'LGL-102', userId: 'U004', type: 'LAW_ENFORCEMENT', status: 'PROCESSING', requestDate: '2023-10-26', deadline: '2023-10-30', documents: ['Warrant_992.pdf'] },
  { id: 'LGL-103', userId: 'U007', type: 'PDPA_DELETE', status: 'COMPLETED', requestDate: '2023-10-20', deadline: '2023-11-19' }
];

export const MOCK_LEGAL_DOCS: LegalDoc[] = [
  { id: 'DOC-TOS', title: 'Terms of Service', version: '2.4', status: 'PUBLISHED', lastUpdated: '2023-09-15', effectiveDate: '2023-10-01' },
  { id: 'DOC-PP', title: 'Privacy Policy', version: '1.8', status: 'PUBLISHED', lastUpdated: '2023-08-01', effectiveDate: '2023-08-15' },
  { id: 'DOC-EULA', title: 'EULA (Android)', version: '3.0', status: 'DRAFT', lastUpdated: '2023-10-25', effectiveDate: 'Pending' }
];

export const MOCK_PAYOUTS: PayoutRequest[] = [
  { id: 'PO-5521', userId: 'U001', userName: 'somchai_dev', amount: 5200, bankName: 'KBANK', accountNumber: '084-2-xxxxx-5', riskScore: 5, status: 'PENDING', requestedAt: '2023-10-27 10:00', kycStatus: 'VERIFIED' },
  { id: 'PO-5522', userId: 'U004', userName: 'tony_stark', amount: 150000, bankName: 'SCB', accountNumber: '112-2-xxxxx-9', riskScore: 88, status: 'PENDING', requestedAt: '2023-10-27 09:30', kycStatus: 'VERIFIED' },
  { id: 'PO-5523', userId: 'U003', userName: 'peter_parker', amount: 450, bankName: 'BBL', accountNumber: '552-0-xxxxx-1', riskScore: 2, status: 'APPROVED', requestedAt: '2023-10-26 15:45', kycStatus: 'VERIFIED' }
];

export const MOCK_FINANCIAL_STRATEGY: FinancialStrategy = {
  totalReserves: 15000000,
  monthlyBurnRate: 1200000,
  runwayMonths: 12.5,
  expansionBudget: 5000000,
  allocation: [
    { category: 'R&D / Product', percentage: 30, amount: 4500000, description: 'New features and AI development' },
    { category: 'Marketing', percentage: 25, amount: 3750000, description: 'User acquisition ads' },
    { category: 'Operations', percentage: 20, amount: 3000000, description: 'Server costs and staff' },
    { category: 'Legal & Compliance', percentage: 10, amount: 1500000, description: 'Licenses and audit fees' },
    { category: 'Emergency Reserve', percentage: 15, amount: 2250000, description: 'Rainy day fund' }
  ]
};
