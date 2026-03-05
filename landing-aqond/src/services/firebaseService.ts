import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ============================================================
// Firebase Config — ชุดเดียวทั้งแอป (API Key, Project ID เดียวกัน)
// ตั้งค่าใน .env: VITE_FIREBASE_*
// ============================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Collection names — อ้างอิงชื่อเดียวกันเป๊ะๆ ทั้ง Landing + Admin
export const COLLECTIONS = {
  providerRegistrations: 'providerRegistrations',
  userRegistrations: 'userRegistrations',
  jobs: 'jobs',
  reviewLogs: 'reviewLogs',
} as const;

// Storage paths — ชุดเดียวกับ storage.rules
export const STORAGE_PATHS = {
  providerVideosPending: 'provider-videos/pending',
  providerVideosVerified: 'provider-videos/verified',
} as const;

// Video demo types (skillDemoType)
export type SkillDemoType = 'intro' | 'tutorial' | 'on-site' | 'other';

// Provider verification status (คลิปยังไม่โชว์หน้าเว็บจนกว่าจะผ่าน)
export type ProviderStatus = 'pending_review' | 'verified' | 'rejected' | 'needs_info';

// Database Schemas
export interface ProviderRegistration {
  name: string;
  profession: string;
  experience: string;
  portfolioLink?: string;
  phone: string;
  portfolioVideos?: string[];
  skillDemoType?: SkillDemoType;
  referralCode?: string; // รหัสเพื่อนแนะนำ — เก็บไว้สำหรับ analytics และลำดับ
  isVerifiedByVideo?: boolean;
  status?: ProviderStatus;
  platinumBadge?: boolean;
  verifiedAt?: unknown;
  systemNotification?: string;
  lastMessageSent?: { subject: string; sentAt: string; status: ProviderStatus };
  timestamp: Date;
}

export interface UserRegistration {
  name: string;
  interestService: string;
  contact: string; // Can be email or phone
  location?: string;
  referralCode?: string; // รหัสเพื่อนแนะนำ
  timestamp: Date;
}

// Job with insurance (Escrow)
export interface Job {
  id?: string;
  providerId: string;
  userId: string;
  title: string;
  estimatedHours: number;
  amount: number;
  status: 'active' | 'completed' | 'disputed' | 'cancelled';
  insuranceStatus: 'held' | 'released' | 'disputed';
  createdAt: Date;
  completedAt?: Date;
  proofMedia?: string[];
}

// Review Log (ใครอนุมัติใคร)
export interface ReviewLog {
  providerId: string;
  providerName?: string;
  adminId: string;
  adminName: string;
  action: 'verified' | 'rejected' | 'needs_info';
  note?: string;
  timestamp: Date;
}

// Communication History (sub-collection under provider)
export interface CommunicationHistoryEntry {
  type: 'verified' | 'needs_info' | 'rejected';
  status: ProviderStatus;
  subject: string;
  content: string;
  adminNote?: string;
  timestamp: Date;
  channel: 'auto';
}

// Upload video to Firebase Storage — /pending until verified
export const uploadVideoToStorage = async (file: File): Promise<string | null> => {
  try {
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${STORAGE_PATHS.providerVideosPending}/${Date.now()}_${sanitizedName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (e) {
    console.error('Error uploading video: ', e);
    return null;
  }
};

// Helper functions to add data to Firestore
export const addProviderRegistration = async (data: Omit<ProviderRegistration, 'timestamp'>) => {
  try {
    const docData = {
      ...data,
      isVerifiedByVideo: (data.portfolioVideos?.length ?? 0) > 0,
      status: 'pending_review' as ProviderStatus,
      timestamp: new Date(),
    };
    await addDoc(collection(db, COLLECTIONS.providerRegistrations), docData);
    return { success: true };
  } catch (e) {
    console.error('Error adding provider document: ', e);
    return { success: false, error: e };
  }
};

export const addUserRegistration = async (data: Omit<UserRegistration, 'timestamp'>) => {
  try {
    await addDoc(collection(db, COLLECTIONS.userRegistrations), { ...data, timestamp: new Date() });
    return { success: true };
  } catch (e) {
    console.error('Error adding user document: ', e);
    return { success: false, error: e };
  }
};

// --- Admin Functions ---

const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v;
  if (v && typeof v === 'object' && 'toDate' in v) return (v as { toDate: () => Date }).toDate();
  return new Date();
};

export const getProvidersForReview = async () => {
  const all = await getProvidersAll();
  return all.filter((p) => (p.status as string) === 'pending_review' || !p.status);
};

export const getProvidersAll = async () => {
  const q = query(
    collection(db, COLLECTIONS.providerRegistrations),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    timestamp: toDate(d.data().timestamp),
  }));
};

const PROVIDER_DASHBOARD_URL =
  import.meta.env.VITE_APP_URL?.replace(/\/$/, '') || 'https://app.aqond.com';

const getMessageTemplate = (
  status: ProviderStatus,
  providerName: string,
  adminNote?: string
): { subject: string; body: string } => {
  const name = providerName || 'คุณ';
  switch (status) {
    case 'verified':
      return {
        subject: 'ยินดีด้วย! คุณได้รับการอนุมัติเป็น AQOND Platinum Provider เรียบร้อยแล้ว ✨',
        body: `สวัสดีคุณ ${name},

เรามีความยินดีที่จะแจ้งให้ทราบว่า ทีมงาน AQOND ได้รับชมวิดีโอสาธิตทักษะของคุณแล้ว และเรา "ว้าว" มาก! ทักษะและความเป็นมืออาชีพของคุณผ่านเกณฑ์มาตรฐานระดับ Platinum ของเราอย่างเป็นเอกลักษณ์

ขณะนี้โปรไฟล์และวิดีโอ Story ของคุณได้รับการเปิดใช้งานบนระบบเรียบร้อยแล้ว:

สถานะ: Platinum Verified (ยืนยันตัวตนระดับสูงสุด)

สิทธิพิเศษ: โปรไฟล์ของคุณจะถูกดันขึ้นลำดับต้นๆ และได้รับความคุ้มครองจากระบบประกันงานของเรา

เตรียมตัวให้พร้อมสำหรับการรับงานแรก และรักษามาตรฐานที่ยอดเยี่ยมนี้ไว้ เพื่อสร้างความประทับใจให้แก่ลูกค้าของเราครับ

ยินดีที่ได้ร่วมงานกันครับ!
ทีมงาน AQOND (Platinum Quality Control)`,
      };
    case 'needs_info':
      return {
        subject: 'ข้อมูลเพิ่มเติมเกี่ยวกับใบสมัคร AQOND Platinum Provider ของคุณ 🔍',
        body: `สวัสดีคุณ ${name},

ขอขอบคุณที่สนใจร่วมเป็นส่วนหนึ่งของ AQOND ครับ ทีมงานได้รับชมวิดีโอของคุณแล้ว เราเห็นถึงศักยภาพที่ยอดเยี่ยมในตัวคุณ แต่เพื่อให้การอนุมัติสถานะ Platinum เป็นไปอย่างสมบูรณ์แบบ เราต้องการให้คุณช่วยปรับปรุงข้อมูลดังนี้ครับ:

รายละเอียดที่ต้องการเพิ่มเติม:

"${adminNote || 'กรุณาอัปเดตวิดีโอหรือข้อมูลให้ครบถ้วน'}"

คำแนะนำจากทีมงาน:
การมีวิดีโอที่เห็นทักษะชัดเจนและสภาพแวดล้อมที่เหมาะสม จะช่วยให้ลูกค้าตัดสินใจจ้างคุณได้ง่ายขึ้นถึง 3 เท่า! เมื่อคุณทำการแก้ไข/อัปโหลดวิดีโอใหม่เรียบร้อยแล้ว ทีมงานจะรีบทำการตรวจสอบให้ทันทีครับ

เราเอาใจช่วยและรอที่จะร่วมงานกับคุณนะครับ
ทีมงาน AQOND`,
      };
    case 'rejected':
      return {
        subject: 'อัปเดตสถานะการสมัครพาร์ทเนอร์ AQOND 🕊️',
        body: `สวัสดีคุณ ${name},

ขอขอบคุณเป็นอย่างยิ่งที่สละเวลาส่งข้อมูลและคลิปวิดีโอเพื่อสมัครร่วมงานกับ AQOND ครับ

ทีมงานได้พิจารณาข้อมูลของคุณอย่างละเอียดแล้ว และต้องขออภัยที่ต้องแจ้งให้ทราบว่า ในขณะนี้ทักษะหรือรูปแบบการนำเสนอของคุณยังไม่ตรงกับเกณฑ์การคัดสรรระดับ Platinum ที่เรากำหนดไว้สำหรับช่วงเปิดตัวนี้

อย่างไรก็ตาม การปฏิเสธในครั้งนี้ไม่ได้หมายความว่าคุณขาดทักษะ แต่เราให้ความสำคัญกับมาตรฐานเฉพาะเจาะจงในแต่ละช่วงเวลา คุณสามารถฝึกฝน พัฒนาพอร์ตโฟลิโอ และกลับมาสมัครใหม่ได้อีกครั้งในอนาคต เมื่อระบบมีการขยายประเภทบริการเพิ่มเติมครับ

ขอให้คุณประสบความสำเร็จในงานที่ทำ และขอบคุณอีกครั้งที่ให้ความสนใจเราครับ
ทีมงาน AQOND`,
      };
    default:
      return { subject: 'อัปเดตสถานะ', body: '' };
  }
};

export class NeedsInfoRequiresNoteError extends Error {
  constructor() {
    super('กรุณาระบุรายละเอียดที่ต้องการเพิ่มเติมก่อนส่ง (Admin Notes)');
    this.name = 'NeedsInfoRequiresNoteError';
  }
}

export const updateProviderStatus = async (
  providerId: string,
  newStatus: ProviderStatus,
  adminName: string,
  adminNote?: string,
  providerName?: string
) => {
  if (newStatus === 'needs_info' && !adminNote?.trim()) {
    throw new NeedsInfoRequiresNoteError();
  }

  const providerRef = doc(db, COLLECTIONS.providerRegistrations, providerId);
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'verified') {
    updateData.platinumBadge = true;
    updateData.verifiedAt = serverTimestamp();
    updateData.systemNotification = 'Welcome to Platinum';
    updateData.videoStoragePath = STORAGE_PATHS.providerVideosVerified;
  }

  const { subject, body } = getMessageTemplate(
    newStatus,
    providerName ?? 'Provider',
    adminNote
  );

  const emailPayload = {
    to: providerId,
    subject,
    body,
    providerName: providerName ?? 'Provider',
    status: newStatus,
    adminNote: adminNote || null,
  };

  console.log('[AQOND Auto-pilot] Email payload (ready for SendGrid/SMTP):', emailPayload);

  updateData.lastMessageSent = {
    subject,
    sentAt: new Date().toISOString(),
    status: newStatus,
  };
  await updateDoc(providerRef, updateData);

  const action: 'verified' | 'rejected' | 'needs_info' =
    newStatus === 'verified' ? 'verified' : newStatus === 'rejected' ? 'rejected' : 'needs_info';
  await addDoc(collection(db, COLLECTIONS.reviewLogs), {
    providerId,
    providerName: providerName ?? '',
    adminId: 'admin',
    adminName,
    action,
    note: adminNote,
    timestamp: new Date(),
  });

  const commHistoryRef = collection(providerRef, 'communication_history');
  await addDoc(commHistoryRef, {
    type: action,
    status: newStatus,
    subject,
    content: body,
    adminNote: adminNote || null,
    timestamp: new Date(),
    channel: 'auto',
  });

  return { success: true };
};

export const getReviewLogs = async (limit = 50) => {
  const q = query(
    collection(db, COLLECTIONS.reviewLogs),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.slice(0, limit).map((d) => ({
    id: d.id,
    ...d.data(),
    timestamp: toDate(d.data().timestamp),
  }));
};

export const getActiveJobs = async () => {
  const all = await getJobsAll();
  return all.filter((j) => (j.status as string) === 'active');
};

const MOCK_JOBS: Array<Record<string, unknown>> = [
  {
    id: 'mock-1',
    title: 'ล้างแอร์ 2 เครื่อง',
    providerName: 'สมชาย ใจดี',
    status: 'active',
    insuranceStatus: 'held',
    estimatedHours: 4,
    amount: 2500,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
  {
    id: 'mock-2',
    title: 'แม่บ้านรายสัปดาห์',
    providerName: 'สมหญิง ใจสวย',
    status: 'active',
    insuranceStatus: 'held',
    estimatedHours: 2,
    amount: 800,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    id: 'mock-3',
    title: 'ซ่อมแอร์',
    providerName: 'สมศักดิ์ ช่างแอร์',
    status: 'active',
    insuranceStatus: 'released',
    estimatedHours: 3,
    amount: 1500,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
  },
];

export const getJobsAll = async () => {
  try {
    const q = query(collection(db, COLLECTIONS.jobs), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      completedAt: d.data().completedAt ? toDate(d.data().completedAt) : undefined,
    }));
    return docs.length > 0 ? docs : MOCK_JOBS;
  } catch {
    return MOCK_JOBS;
  }
};

export const getStats = async () => {
  const [providers, users, jobs, logs] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.providerRegistrations)),
    getDocs(collection(db, COLLECTIONS.userRegistrations)),
    getDocs(collection(db, COLLECTIONS.jobs)),
    getDocs(collection(db, COLLECTIONS.reviewLogs)),
  ]);
  const totalVideos = providers.docs.reduce(
    (acc, d) => acc + ((d.data().portfolioVideos as string[])?.length ?? 0),
    0
  );
  const pendingCount = providers.docs.filter((d) => d.data().status === 'pending_review').length;
  const platinumCount = providers.docs.filter(
    (d) => d.data().status === 'verified' || d.data().platinumBadge === true
  ).length;
  return {
    totalProviders: providers.size,
    totalUsers: users.size,
    totalJobs: jobs.size,
    totalVideos,
    pendingProviders: pendingCount,
    approvedProviders: platinumCount,
    platinumCount,
    reviewLogsCount: logs.size,
  };
};
