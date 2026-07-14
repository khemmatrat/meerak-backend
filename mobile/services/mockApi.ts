import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  limit,
  runTransaction,
  orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import axios from "axios";
import { db, functions } from "./firebase";
import FirebaseApi from "./firebase";
import { BackendPaymentService } from "./backendPaymentService";
import { BackendReportService } from "./backendReportService";
import { getWithdrawalFeeForNet } from "./paymentFeeConfig";
import type { PaymentChannel } from "./paymentFeeConfig";
import { recordPaymentCompleted, recordPaymentCreated } from "./ledgerService";
import {
  Job,
  JobStatus,
  UserProfile,
  UserRole,
  ChatMessage,
  MessageType,
  Transaction,
  PaymentMethod,
  Review,
  Location,
  UserNotification,
  Voucher,
  Dispute,
  SystemBanner,
  BankAccount,
  JobCategory,
  TrainingModule,
  TrainingStatus,
  JobStatistics,
  PaymentStatus,
  type JobCompletionExtras,
} from "../types";

function normalizeCompletionExtras(
  ex?: JobCompletionExtras,
): JobCompletionExtras | undefined {
  if (!ex) return undefined;
  const meter = Math.max(
    0,
    Math.round((Number(ex.meter_thb) || 0) * 100) / 100,
  );
  const toll = Math.max(0, Math.round((Number(ex.toll_thb) || 0) * 100) / 100);
  const parking = Math.max(
    0,
    Math.round((Number(ex.parking_thb) || 0) * 100) / 100,
  );
  const other = Math.max(
    0,
    Math.round((Number(ex.other_thb) || 0) * 100) / 100,
  );
  const note = String(ex.note || "")
    .trim()
    .slice(0, 500);
  const total = meter + toll + parking + other;
  if (total <= 0 && !note) return undefined;
  return {
    meter_thb: meter,
    toll_thb: toll,
    parking_thb: parking,
    other_thb: other,
    ...(note ? { note } : {}),
  };
}

function toStoredProviderExtras(
  norm: JobCompletionExtras,
): Record<string, unknown> {
  const totalExtras =
    Math.round(
      ((norm.meter_thb || 0) +
        (norm.toll_thb || 0) +
        (norm.parking_thb || 0) +
        (norm.other_thb || 0)) *
        100,
    ) / 100;
  return {
    ...norm,
    extras_total_thb: totalExtras,
    recorded_at: new Date().toISOString(),
  };
}

// --- BACKEND CONFIGURATION (ใช้ชุดเดียวทั้ง Bob / Anna / platform) ---
// ตั้ง VITE_BACKEND_URL หรือ REACT_APP_BACKEND_URL ใน .env ถ้าไม่ใช้ localhost (เช่น production)
// ใช้ getBackendBase จาก api.ts เพื่อรองรับ Mixed Content (HTTPS หน้า → HTTPS API)
import {
  getBackendBase,
  api,
  isNativeCapacitorApp,
  HTTP_TIMEOUT_KYC_SUBMIT_MS,
  HTTP_TIMEOUT_KYC_JSON_MS,
  HTTP_TIMEOUT_MULTIPART_DEFAULT_MS,
  HTTP_TIMEOUT_AUTH_MS,
} from "./api";
import { normalizePhoneForApi } from "./phoneNormalize";
import { adsService } from "./adsService";
import {
  type HomeBannerItem,
  bannerVisibleForHomePlacement,
  bannerVisibleForWelcomePlacement,
  bannerVisibleForJobDetailPlacement,
} from "../utils/bannerDisplay";

/** PR-2 Smart Anti-Bypass: POST job chat via backend when enabled (parity fallback to Firestore). */
function isAntiBypassJobChatProxyOn(): boolean {
  try {
    return (
      typeof import.meta !== "undefined" &&
      String((import.meta as any).env?.VITE_ANTI_BYPASS_JOB_CHAT_PROXY || "")
        .toLowerCase()
        .trim() === "on"
    );
  } catch {
    return false;
  }
}

/** Login/register timeout จาก api.ts (HTTP_TIMEOUT_AUTH_MS) */

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** พร็อกซี/เบราว์เซอร์ในแอพตัดสัญญาณได้ — ควรลองส่งสมัครซ้ำได้ (ไม่ retry 4xx ที่ชัดเจน เช่น 409) */
function isTransientRegistrationTransportError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const ax = error;
  const st = ax.response?.status;
  if (typeof st === "number") {
    if ([400, 401, 403, 404, 409, 429].includes(st)) return false;
    if (st >= 500 && st < 600) return true;
    return false;
  }
  if (ax.code === "ERR_NETWORK" || ax.code === "ECONNABORTED") return true;
  if (/Network Error|timeout/i.test(String(ax.message || ""))) return true;
  return false;
}

const REGISTER_TRANSPORT_RETRIES = 3;
const REGISTER_RETRY_BACKOFF_MS = [0, 750, 1750];
const LOGIN_TRANSPORT_RETRIES = 3;
const LOGIN_RETRY_BACKOFF_MS = [0, 600, 1500];

/** login / register — ไม่ retry เมื่อ credentials ผิด (401) */
function isTransientAuthTransportError(error: unknown): boolean {
  return isTransientRegistrationTransportError(error);
}

/** ตัวเลือกการสมัคร — callback retry + Idempotency-Key เดียวกันตลอดครั้งถัดจากเซิร์ฟเวอร์ */
export type RegisterCallOptions = {
  onTransportRetry?: (info: { attempt: number; maxAttempts: number }) => void;
  /** เหลือความตั้งใจครั้งหนึ่งต่อฟอร์ม — เซิร์ฟเวอร์จะเล่นซ้ำได้โดยไม่เกิด phantom duplicate */
  idempotencyKey?: string;
};
const phoneToEmail = (phone: string) => `${phone}@meerak.app`;

// Helper to sanitize object for Firestore (remove undefined)
const sanitize = (obj: any) => {
  return JSON.parse(JSON.stringify(obj));
};

// --- SECURITY: Sanitize Public Profiles ---
const sanitizePublicUser = (user: UserProfile): UserProfile => {
  const { wallet_balance, kyc_docs, password, bank_accounts, ...safeProfile } =
    user;
  return safeProfile;
};

// ✅ Simple Cache: เก็บ API response ไว้ใน Memory 30 วินาที (ป้องกันยิง API มั่วซั่ว)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const apiCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 30000; // 30 วินาที

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    apiCache.delete(key);
    return null;
  }

  console.log(`💾 [Cache HIT] ${key}`);
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  apiCache.set(key, { data, timestamp: Date.now() });
}

function clearCache(keyPattern?: string): void {
  if (!keyPattern) {
    apiCache.clear();
  } else {
    for (const key of apiCache.keys()) {
      if (key.includes(keyPattern)) {
        apiCache.delete(key);
      }
    }
  }
}

/** ล้างแคชโปรไฟล์ (หลัง push เตือน BA / อัปเดตสิทธิ์) — ไม่ส่ง userId = ล้างทุก profile: */
export function invalidateProfileCache(userId?: string): void {
  if (userId) clearCache(`profile:${userId}`);
  else clearCache("profile:");
}

// ✅ Persistent storage for bank_accounts — survives modal close and browser refresh
const BANK_ACCOUNTS_STORAGE_KEY = (userId: string) =>
  `meerak_bank_accounts_${userId}`;

function getBankAccountsFromStorage(userId: string): BankAccount[] {
  try {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setBankAccountsToStorage(
  userId: string,
  accounts: BankAccount[],
): void {
  try {
    localStorage.setItem(
      BANK_ACCOUNTS_STORAGE_KEY(userId),
      JSON.stringify(accounts),
    );
  } catch (e) {
    console.warn(
      "[mockApi] Failed to persist bank_accounts to localStorage:",
      e,
    );
  }
}

export function clearBankAccountsStorage(userId?: string): void {
  try {
    const id = userId || localStorage.getItem("meerak_user_id");
    if (id) localStorage.removeItem(BANK_ACCOUNTS_STORAGE_KEY(id));
    // Also clear any stray keys by pattern (for multi-tab or stale sessions)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("meerak_bank_accounts_")) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

// Merge localStorage bank_accounts into profile — localStorage persists across modal close and refresh
function mergeBankAccountsIntoProfile<
  T extends { bank_accounts?: BankAccount[] },
>(profile: T, userId: string): T {
  const stored = getBankAccountsFromStorage(userId);
  if (stored.length === 0) return profile;
  const apiAccounts = profile.bank_accounts || [];
  const byKey = (a: BankAccount) => `${a.account_number}|${a.account_name}`;
  const storedKeys = new Set(stored.map(byKey));
  // Union: stored as base, add any from API not in stored (so we never lose server data)
  const merged: BankAccount[] = [...stored];
  for (const a of apiAccounts) {
    if (!storedKeys.has(byKey(a))) {
      merged.push(a);
      storedKeys.add(byKey(a));
    }
  }
  return { ...profile, bank_accounts: merged };
}

export const deg2rad = (deg: number) => deg * (Math.PI / 180);

// Helper to calculate distance
export const calculateDistance = (loc1: Location, loc2: Location): number => {
  if (!loc1 || !loc2) return 999;
  const R = 6371;
  const dLat = deg2rad(loc2.lat - loc1.lat);
  const dLon = deg2rad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(loc1.lat)) *
      Math.cos(deg2rad(loc2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper to map Firestore doc to our Type
const mapDoc = <T>(docSnap: any): T => {
  const data = docSnap.data();
  const processed: any = { ...data, id: docSnap.id };
  Object.keys(processed).forEach((key) => {
    // Safe check for Timestamp to avoid Illegal Constructor issues
    if (processed[key] && typeof processed[key].toDate === "function") {
      processed[key] = processed[key].toDate().toISOString();
    }
  });
  return processed as T;
};

// --- COMMISSION LOGIC ---
const calculateCommission = (completedJobs: number): { feePercent: number } => {
  if (completedJobs > 350) return { feePercent: 0.08 };
  if (completedJobs > 240) return { feePercent: 0.1 };
  if (completedJobs > 150) return { feePercent: 0.12 };
  if (completedJobs > 80) return { feePercent: 0.15 };
  if (completedJobs > 30) return { feePercent: 0.18 };
  return { feePercent: 0.22 };
};

// Error Handler Wrapper
const handleFirestoreError = (error: any, context: string) => {
  console.error(`Firestore Error in ${context}:`, error);
  if (error.code === "unavailable") {
    throw new Error(
      "Connection failed. You are currently offline or cannot reach the server.",
    );
  }
  throw error;
};

// When true: all wallet ops MUST use backend; no Firebase fallback; backend downtime fails transaction.
const REAL_MONEY_MODE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_REAL_MONEY_MODE === "true") ||
  (typeof process !== "undefined" &&
    process.env?.VITE_REAL_MONEY_MODE === "true");

// ใช้ axios instance จาก ./api เท่านั้น (baseURL = getBackendBase() ทุก request — ห้ามล็อก localhost ตอนโหลดโมดูล)

// เพิ่มฟังก์ชันนี้ใน MockApi หรือเป็น helper function
const getUserRoleInJob = async (
  userId: string,
  jobId: string,
): Promise<"client" | "provider" | null> => {
  try {
    const job = await MockApi.getJobDetails(jobId);
    if (!job) return null;

    if (job.created_by === userId) return "client";
    if (job.accepted_by === userId) return "provider";
    return null;
  } catch (error) {
    console.error(`Error getting role for job ${jobId}:`, error);
    return null;
  }
};

const batchGetJobRoles = async (
  userId: string,
  jobIds: string[],
): Promise<Map<string, "client" | "provider">> => {
  const roleMap = new Map();

  if (jobIds.length === 0) return roleMap;

  // แบ่งเป็น batches ละ 10
  const batchSize = 10;

  for (let i = 0; i < jobIds.length; i += batchSize) {
    const batch = jobIds.slice(i, i + batchSize);
    const promises = batch.map((jobId) => MockApi.getJobDetails(jobId));
    const jobs = await Promise.all(promises);

    jobs.forEach((job, index) => {
      if (job) {
        if (job.created_by === userId) {
          roleMap.set(batch[index], "client");
        } else if (job.accepted_by === userId) {
          roleMap.set(batch[index], "provider");
        }
      }
    });
  }

  return roleMap;
};

// --- MOCK DATA FOR HYBRID TRAINING ---
export const MOCK_JOBS: Job[] = [
  {
    id: "job1",
    title: "Delivery Service",
    description: "Need to deliver documents from Sukhumvit to Silom",
    category: "Delivery",
    price: 500,
    status: JobStatus.OPEN,
    datetime: new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_by: "client1",
    created_by_name: "John Smith",
    created_by_avatar: "https://i.pravatar.cc/150?u=john",
    location: {
      lat: 13.736717,
      lng: 100.523186,
      address: "Sukhumvit Road, Bangkok",
    },
    clientName: "John Smith",
    providerId: null,
    clientId: "client1",
    accepted_by: null,
    accepted_by_name: null,
    updated_at: new Date().toISOString(),
  },
  {
    id: "job2",
    title: "Home Cleaning",
    description: "Deep cleaning for 2-bedroom apartment",
    category: "Cleaning",
    price: 1200,
    status: JobStatus.OPEN,
    datetime: new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_by: "client2",
    created_by_name: "Jane Doe",
    created_by_avatar: "https://i.pravatar.cc/150?u=jane",
    location: {
      lat: 13.75633,
      lng: 100.501762,
      address: "Siam, Bangkok",
    },
    clientName: "Jane Doe",
    providerId: null,
    clientId: "client2",
    accepted_by: null,
    accepted_by_name: null,
    updated_at: new Date().toISOString(),
  },
  {
    id: "job3",
    title: "Air Conditioner Repair",
    description: "AC not cooling properly in living room",
    category: "Repair",
    price: 1500,
    status: JobStatus.ACCEPTED,
    datetime: new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_by: "client3",
    created_by_name: "Robert Johnson",
    created_by_avatar: "https://i.pravatar.cc/150?u=robert",
    location: {
      lat: 13.736717,
      lng: 100.523186,
      address: "Thonglor, Bangkok",
    },
    clientName: "Robert Johnson",
    providerId: "provider1",
    clientId: "client3",
    accepted_by: "provider1",
    accepted_by_name: "Provider User",
    updated_at: new Date().toISOString(),
  },
  {
    id: "job4",
    title: "Grocery Shopping",
    description: "Weekly grocery shopping at Tops supermarket",
    category: "Delivery",
    price: 350,
    status: JobStatus.IN_PROGRESS,
    datetime: new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_by: "client4",
    created_by_name: "Mary Wilson",
    created_by_avatar: "https://i.pravatar.cc/150?u=mary",
    location: {
      lat: 13.7465,
      lng: 100.535,
      address: "EmQuartier, Bangkok",
    },
    clientName: "Mary Wilson",
    providerId: "provider2",
    clientId: "client4",
    accepted_by: "provider2",
    accepted_by_name: "Another Provider",
    updated_at: new Date().toISOString(),
  },
  {
    id: "job5",
    title: "Car Wash Service",
    description: "Premium car wash at client's residence",
    category: "Cleaning",
    price: 800,
    status: JobStatus.COMPLETED,
    datetime: new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_by: "client5",
    created_by_name: "David Brown",
    created_by_avatar: "https://i.pravatar.cc/150?u=david",
    location: {
      lat: 13.7234,
      lng: 100.5132,
      address: "Ekkamai, Bangkok",
    },
    clientName: "David Brown",
    providerId: "provider1",
    clientId: "client5",
    accepted_by: "provider1",
    accepted_by_name: "Provider User",
    updated_at: new Date().toISOString(),
  },
];

// ...existing code...
export const MOCK_COURSES: TrainingModule[] = [
  {
    id: "course-1",
    title: "พื้นฐานการบริการลูกค้า",
    description: "เรียนรู้ทักษะพื้นฐานในการให้บริการลูกค้า",
    category: "Customer Service",
    duration: "2 ชั่วโมง",
    level: "beginner",
    image_url: "https://images.unsplash.com/photo-1552664730-d307ca884978",
    video_url: "https://example.com/video1.mp4",
    lessons: [
      { id: "l1", title: "บทนำ", duration: "10 นาที" },
      { id: "l2", title: "การสื่อสาร", duration: "20 นาที" },
      { id: "l3", title: "การแก้ปัญหา", duration: "30 นาที" },
    ],
    quiz: {
      id: "quiz-1",
      questions: [
        {
          id: "q1",
          question: "อะไรคือสิ่งสำคัญที่สุดในการบริการลูกค้า?",
          options: ["ราคา", "ความเร็ว", "ความเอาใจใส่", "เทคโนโลยี"],
          correctAnswer: 2,
        },
      ],
    },
  },
  {
    id: "course-2",
    title: "การทำความสะอาดมืออาชีพ",
    description: "เทคนิคการทำความสะอาดแบบมืออาชีพ",
    category: "Cleaning",
    duration: "3 ชั่วโมง",
    level: "intermediate",
    image_url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
    video_url: "https://example.com/video2.mp4",
    lessons: [
      { id: "l1", title: "อุปกรณ์และสารเคมี", duration: "20 นาที" },
      { id: "l2", title: "เทคนิคการทำความสะอาด", duration: "40 นาที" },
      { id: "l3", title: "ความปลอดภัย", duration: "30 นาที" },
    ],
    quiz: {
      id: "quiz-2",
      questions: [
        {
          id: "q1",
          question: "ควรผสมสารเคมีชนิดไหนเข้าด้วยกัน?",
          options: [
            "น้ำยาถูพื้นกับน้ำยาเช็ดกระจก",
            "น้ำยาล้างห้องน้ำกับน้ำยาฆ่าเชื้อ",
            "ไม่ควรผสมสารเคมีใดๆ เข้าด้วยกัน",
            "ทุกชนิดผสมกันได้",
          ],
          correctAnswer: 2,
        },
      ],
    },
  },
  // คอร์สบังคับสำหรับ Provider หลัง KYC ผ่าน: มาตรฐานการบริการและความปลอดภัยของ AQOND (55 ข้อ, ผ่าน ≥85%, ไม่ผ่านรอ 24 ชม.)
  {
    id: "nexus-professional-standards",
    title: "มาตรฐานการบริการและความปลอดภัยของ AQOND",
    name: "มาตรฐานการบริการและความปลอดภัยของ AQOND",
    description:
      "เรียนรู้มาตรฐานการให้บริการและความปลอดภัยที่ AQOND กำหนดให้ Provider ทุกคนต้องผ่านก่อนรับงาน",
    category: "Professional Standards",
    duration: "ประมาณ 30 นาที",
    level: "required",
    image_url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
    video_url: "https://www.youtube.com/watch?v=9ZvxbM5oTWE",
    videoUrl: "https://www.youtube.com/watch?v=9ZvxbM5oTWE",
    lessons: [
      {
        id: "l1",
        title: "มาตรฐานการบริการและความปลอดภัย",
        duration: "15 นาที",
      },
    ],
    quiz: (() => {
      const opts = [
        {
          id: "a",
          text: "การปฏิบัติตามมาตรฐานความปลอดภัยและสิทธิส่วนบุคคล",
          isCorrect: false,
        },
        {
          id: "b",
          text: "การให้บริการด้วยความสุภาพ ตรงเวลา และรายงานเหตุการณ์ไม่ปกติ",
          isCorrect: false,
        },
        {
          id: "c",
          text: "การไม่เปิดเผยข้อมูลลูกค้าและปฏิบัติตามกฎหมาย",
          isCorrect: false,
        },
        { id: "d", text: "ถูกทุกข้อ", isCorrect: false },
      ];
      const questions = [];
      for (let i = 1; i <= 55; i++) {
        const correctIndex = i % 4;
        const options = opts.map((o, idx) => ({
          ...o,
          isCorrect: idx === correctIndex,
        }));
        questions.push({
          id: `nexus-q${i}`,
          text: `ข้อ ${i}. มาตรฐานการบริการและความปลอดภัยของ AQOND ข้อใดถูกต้อง?`,
          type: "mcq" as const,
          options,
        });
      }
      return { id: "quiz-nexus-pro", passThreshold: 85, questions };
    })(),
  },
];

// simple getters for services/pages
export function getAllCourses(): TrainingModule[] {
  return MOCK_COURSES;
}

export function getCourseById(id: string): TrainingModule | undefined {
  return MOCK_COURSES.find((c) => c.id === id);
}

// Helper function for random skills
const getRandomSkills = () => {
  const allSkills = [
    "Cleaning",
    "Delivery",
    "Repair",
    "Consulting",
    "Maintenance",
    "Installation",
    "Assembly",
    "Gardening",
    "Moving",
    "Pet Care",
    "Cooking",
    "Driving",
    "Tutoring",
    "Beauty",
    "Fitness",
  ];

  const numSkills = Math.floor(Math.random() * 3) + 2;
  const shuffled = [...allSkills].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, numSkills);
};

export const MockApi = {
  // Firebase สำหรับ real-time features
  subscribeToMessages: FirebaseApi.subscribeToMessages,
  subscribeToJob: FirebaseApi.subscribeToJob,

  // ============================================
  // ✅ PAYMENT SERVICES - ย้ายไป Backend แล้ว
  // ============================================
  processPayment: BackendPaymentService.processPayment,
  holdPayment: BackendPaymentService.holdPayment,
  releasePayment: BackendPaymentService.releasePayment,
  pollReleasePayment: BackendPaymentService.pollReleasePayment,
  getPaymentStatus: BackendPaymentService.getPaymentStatus,
  generateReceipt: BackendPaymentService.generateReceipt,
  refundPayment: BackendPaymentService.refundPayment,

  // ============================================
  // ✅ REPORT SERVICES - ย้ายไป Backend แล้ว
  // ============================================
  getJobStatistics: BackendReportService.getJobStatistics,
  getEarningsReport: BackendReportService.getEarningsReport,
  getUserActivity: BackendReportService.getUserActivity,
  getFinancialSummary: BackendReportService.getFinancialSummary,
  getDisputeReports: BackendReportService.getDisputeReports,
  exportReport: BackendReportService.exportReport,

  // ============================================
  // ✅ BACKEND INTEGRATED KYC SERVICES
  // ============================================
  /**
   * ส่ง KYC: โหลดรูปทีละไฟล์ไปที่ /upload/document (คำขอเล็ก) แล้วบันทึกด้วย POST /api/kyc/submit-from-uploads (JSON เล็ก)
   * — ไม่ใช้ /api/kyc/submit แพ็ครูปครั้งเดียว (ใหญ่) เพื่อลดถูก proxy ตัด → ERR_NETWORK
   * Fallback multipart เฉพาะถ้ามี selfieVideo หรือ drivingLicenseBack แบบไฟล์
   */
  submitEnhancedKYC: async (payload: {
    /** ถ้าไม่ส่ง จะใช้ localStorage `meerak_user_id` */
    userId?: string;
    fullName: string;
    birthDate: string;
    idCardNumber: string;
    idCardFront?: File;
    selfiePhoto?: File;
    idCardBack?: File | null;
    drivingLicenseFront?: File | null;
    drivingLicenseBack?: File | null;
    selfieVideo?: File | null;
    address?: string;
    vehiclesJson?: string;
    wantsPublicTransport?: boolean;
    yellowPlatePhotoUrl?: string;
    publicTransportLicenseFrontUrl?: string;
    publicTransportLicenseBackUrl?: string;
    driverLicenseNumber?: string;
    driverLicenseType?: string;
    driverLicenseClass?: string[] | string;
    idCardExpiryDate?: string;
    driverLicenseExpiry?: string;
    /** ลิงก์ https ที่ได้จาก /upload/document แล้ว — จะไม่อัปโหลดซ้ำถ้ายังใช้ได้ */
    reuseHttpsUrls?: {
      idCardFront: string;
      idCardBack?: string;
      selfiePhoto: string;
      drivingLicenseFront?: string | null;
    } | null;
  }): Promise<any> => {
    const userId = payload.userId ?? localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    const pickHttps = (u: unknown): string | null => {
      const s = typeof u === "string" ? u.trim() : "";
      return /^https:\/\//i.test(s) ? s : null;
    };

    const uploadOne = async (
      file: File,
      documentType: string,
    ): Promise<string> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      const res = await api.post<{
        url?: string;
        signed_url?: string;
        secure_url?: string;
      }>("/upload/document", formData, {
        timeout: HTTP_TIMEOUT_MULTIPART_DEFAULT_MS,
      });
      const raw = res.data?.url ?? res.data?.signed_url ?? res.data?.secure_url;
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!/^https:\/\//i.test(t)) {
        throw new Error(
          "อัปโหลดรูปไม่ครบผ่านเซิร์ฟเวอร์ — ลองเชื่อมต่อWi‑Fi แล้วกดส่งอีกครั้ง",
        );
      }
      return t;
    };

    const exotic =
      !!(payload.selfieVideo && payload.selfieVideo.size > 0) ||
      !!(payload.drivingLicenseBack && payload.drivingLicenseBack.size > 0);
    if (exotic) {
      const idFront = payload.idCardFront;
      const selfie = payload.selfiePhoto;
      const idBack = payload.idCardBack;
      if (!idFront || !selfie) {
        throw new Error("ไม่พบไฟล์ภาพสำหรับส่ง KYC — กรุณาเลือกรูปอีกครั้ง");
      }
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("fullName", payload.fullName);
      formData.append("birthDate", payload.birthDate);
      formData.append("idCardNumber", payload.idCardNumber);
      formData.append("idCardFront", idFront);
      if (idBack) formData.append("idCardBack", idBack);
      formData.append("selfiePhoto", selfie);
      if (payload.drivingLicenseFront)
        formData.append("drivingLicenseFront", payload.drivingLicenseFront);
      if (payload.drivingLicenseBack)
        formData.append("drivingLicenseBack", payload.drivingLicenseBack);
      if (payload.selfieVideo)
        formData.append("selfieVideo", payload.selfieVideo);
      if (payload.address != null && String(payload.address).trim()) {
        formData.append("address", String(payload.address).trim());
      }
      if (payload.vehiclesJson != null && String(payload.vehiclesJson).trim()) {
        formData.append("vehiclesJson", String(payload.vehiclesJson).trim());
      }
      if (payload.idCardExpiryDate)
        formData.append("idCardExpiryDate", payload.idCardExpiryDate);
      if (payload.driverLicenseExpiry)
        formData.append("driverLicenseExpiry", payload.driverLicenseExpiry);
      const idemKey = `kyc-mp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const res = await api.post("/kyc/submit", formData, {
        timeout: HTTP_TIMEOUT_KYC_SUBMIT_MS,
        headers: {
          "Content-Type": "multipart/form-data",
          "Idempotency-Key": idemKey,
        },
      });
      try {
        apiCache.delete(`profile:${String(userId)}`);
      } catch (_) {}
      return res.data;
    }

    const r = payload.reuseHttpsUrls ?? null;
    let frontUrl = r ? pickHttps(r.idCardFront) : null;
    let backUrl = r?.idCardBack != null ? pickHttps(r.idCardBack) : null;
    let selfieUrl = r ? pickHttps(r.selfiePhoto) : null;
    let dlUrl =
      r?.drivingLicenseFront != null && String(r.drivingLicenseFront).trim()
        ? pickHttps(r.drivingLicenseFront)
        : null;

    const idFront = payload.idCardFront;
    const idBack = payload.idCardBack;
    const selfie = payload.selfiePhoto;

    if (!frontUrl) {
      if (!idFront)
        throw new Error(
          "ไม่พบไฟล์รูปบัตรหน้าสำหรับส่ง KYC — โปรดเลือกรูปจากเครื่องอีกครั้ง",
        );
      frontUrl = await uploadOne(idFront, "submit_id_front");
    }
    if (!selfieUrl) {
      if (!selfie)
        throw new Error(
          "ไม่พบไฟล์รูปเซลฟี่สำหรับส่ง KYC — โปรดเลือกรูปจากเครื่องอีกครั้ง",
        );
      selfieUrl = await uploadOne(selfie, "submit_selfie");
    }
    if (!backUrl && idBack != null && idBack.size > 0) {
      backUrl = await uploadOne(idBack, "submit_id_back");
    }
    if (
      payload.drivingLicenseFront != null &&
      payload.drivingLicenseFront.size > 0 &&
      !dlUrl
    ) {
      dlUrl = await uploadOne(payload.drivingLicenseFront, "submit_dl_front");
    }

    if (!frontUrl || !selfieUrl) {
      throw new Error(
        "ไม่พบลิงก์รูปที่ใช้ส่งได้ — โปรดตรวจการล็อกอินและอินเทอร์เน็ตแล้วลองอีกครั้ง",
      );
    }

    const body: Record<string, string> = {
      userId,
      fullName: payload.fullName,
      birthDate: payload.birthDate,
      idCardNumber: payload.idCardNumber,
      idCardFrontUrl: frontUrl,
      selfiePhotoUrl: selfieUrl,
    };
    if (backUrl) body.idCardBackUrl = backUrl;
    if (payload.address != null && String(payload.address).trim()) {
      body.address = String(payload.address).trim();
    }
    if (payload.vehiclesJson != null && String(payload.vehiclesJson).trim()) {
      body.vehiclesJson = String(payload.vehiclesJson).trim();
    }
    if (payload.wantsPublicTransport != null) {
      body.wantsPublicTransport = payload.wantsPublicTransport
        ? "true"
        : "false";
    }
    if (payload.yellowPlatePhotoUrl)
      body.yellowPlatePhotoUrl = payload.yellowPlatePhotoUrl;
    if (payload.publicTransportLicenseFrontUrl) {
      body.publicTransportLicenseFrontUrl =
        payload.publicTransportLicenseFrontUrl;
    }
    if (payload.publicTransportLicenseBackUrl) {
      body.publicTransportLicenseBackUrl =
        payload.publicTransportLicenseBackUrl;
    }
    if (payload.driverLicenseNumber)
      body.driverLicenseNumber = payload.driverLicenseNumber;
    if (payload.driverLicenseType)
      body.driverLicenseType = payload.driverLicenseType;
    if (payload.driverLicenseClass != null) {
      body.driverLicenseClass = Array.isArray(payload.driverLicenseClass)
        ? JSON.stringify(payload.driverLicenseClass)
        : String(payload.driverLicenseClass);
    }
    if (payload.idCardExpiryDate)
      body.idCardExpiryDate = payload.idCardExpiryDate;
    if (payload.driverLicenseExpiry)
      body.driverLicenseExpiry = payload.driverLicenseExpiry;
    if (dlUrl) body.drivingLicenseFrontUrl = dlUrl;

    const idemKey = `kyc-json-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const res = await api.post("/kyc/submit-from-uploads", body, {
      timeout: HTTP_TIMEOUT_KYC_JSON_MS,
      headers: { "Idempotency-Key": idemKey },
    });
    try {
      apiCache.delete(`profile:${String(userId)}`);
    } catch (_) {}
    return res.data;
  },

  submitKycSupplement: async (payload: {
    userId?: string;
    yellowPlatePhotoUrl?: string;
    publicTransportLicenseFrontUrl?: string;
    publicTransportLicenseBackUrl?: string;
    requestedDocs?: string[];
  }): Promise<{ success: boolean; message?: string; error?: string }> => {
    const userId = payload.userId ?? localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    const pickHttps = (u: unknown): string | null => {
      const s = typeof u === "string" ? u.trim() : "";
      return /^https:\/\//i.test(s) ? s : null;
    };

    const uploadOne = async (
      file: File,
      documentType: string,
    ): Promise<string> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      const res = await api.post<{
        url?: string;
        signed_url?: string;
        secure_url?: string;
      }>("/upload/document", formData, {
        timeout: HTTP_TIMEOUT_MULTIPART_DEFAULT_MS,
      });
      const raw = res.data?.url ?? res.data?.signed_url ?? res.data?.secure_url;
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!/^https:\/\//i.test(t)) {
        throw new Error(
          "อัปโหลดรูปไม่ครบผ่านเซิร์ฟเวอร์ — ลองเชื่อมต่อWi‑Fi แล้วกดส่งอีกครั้ง",
        );
      }
      return t;
    };

    const docs = Array.isArray(payload.requestedDocs)
      ? payload.requestedDocs.map((d) => String(d))
      : [];
    const needYellow = docs.length === 0 || docs.includes("yellow_plate");
    const needFront =
      docs.length === 0 || docs.includes("public_transport_license_front");
    const needBack = docs.includes("public_transport_license_back");

    let yellowUrl = pickHttps(payload.yellowPlatePhotoUrl);
    let frontUrl = pickHttps(payload.publicTransportLicenseFrontUrl);
    let backUrl = pickHttps(payload.publicTransportLicenseBackUrl);

    const body: Record<string, string> = { userId };

    if (needYellow) {
      if (!yellowUrl && payload.yellowPlatePhotoUrl?.startsWith("blob:")) {
        throw new Error("กรุณาเลือกรูปป้ายเหลืองจากเครื่องอีกครั้ง");
      }
      if (yellowUrl) body.yellowPlatePhotoUrl = yellowUrl;
    }
    if (needFront) {
      if (
        !frontUrl &&
        payload.publicTransportLicenseFrontUrl?.startsWith("blob:")
      ) {
        throw new Error(
          "กรุณาเลือกรูปใบขับขี่สาธารณะ (หน้า) จากเครื่องอีกครั้ง",
        );
      }
      if (frontUrl) body.publicTransportLicenseFrontUrl = frontUrl;
    }
    if (needBack && backUrl) {
      body.publicTransportLicenseBackUrl = backUrl;
    }

    const res = await api.post("/kyc/submit-supplement", body, {
      timeout: HTTP_TIMEOUT_KYC_JSON_MS,
    });
    try {
      apiCache.delete(`profile:${String(userId)}`);
    } catch (_) {}
    return res.data;
  },

  submitKYC: async (docs: {
    front: File;
    selfie: File;
    idCardBack?: File;
    drivingLicenseFront?: File;
    drivingLicenseBack?: File;
    selfieVideo?: File;
  }): Promise<any> => {
    try {
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) throw new Error("Not logged in");

      // 1. อัพโหลดเอกสารไปยัง Backend
      const formData = new FormData();
      Object.entries(docs).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });

      // ใช้ Backend endpoint สำหรับอัพโหลด
      const uploadResponse = await api.post("/kyc/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // 2. ส่งข้อมูล KYC ไปตรวจสอบ
      const kycData = {
        userId,
        documents: uploadResponse.data.urls,
        submittedAt: new Date().toISOString(),
      };

      const kycResponse = await api.post("/kyc/submit", kycData);

      // 3. อัพเดทสถานะใน Firestore (สำหรับ compatibility)
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        kyc_level: "pending_review",
        kyc_status: "pending_ai_verification",
        kyc_submitted_at: new Date().toISOString(),
        kyc_docs: uploadResponse.data.urls,
      });

      return kycResponse.data;
    } catch (error) {
      console.error("KYC submission error:", error);
      throw error;
    }
  },

  /** KYC ล่าสุดจาก PostgreSQL — ลอง /api/kyc/my-latest ก่อน; ถ้า 404 (backend ยังไม่ deploy) ใช้ /api/kyc/status/:userId + submissionForOwner */
  getMyLatestKycSubmission: async (): Promise<{
    found: boolean;
    submission: {
      id?: string;
      id_card_front_url?: string | null;
      id_card_back_url?: string | null;
      driving_license_front_url?: string | null;
      id_card_number?: string | null;
      vehicles_json?: unknown;
      status?: string;
      submitted_at?: string;
      address?: string | null;
      full_name?: string | null;
    } | null;
  }> => {
    const fromStatus = async (): Promise<{
      found: boolean;
      submission: {
        id?: string;
        id_card_front_url?: string | null;
        id_card_back_url?: string | null;
        driving_license_front_url?: string | null;
        id_card_number?: string | null;
        vehicles_json?: unknown;
        status?: string;
        submitted_at?: string;
        address?: string | null;
        full_name?: string | null;
      } | null;
    }> => {
      const uid = localStorage.getItem("meerak_user_id");
      if (!uid) return { found: false, submission: null };
      const st = await api.get(`/kyc/status/${uid}`);
      const resData = st.data as {
        submissionForOwner?: {
          id?: string;
          id_card_front_url?: string | null;
          id_card_back_url?: string | null;
          driving_license_front_url?: string | null;
          id_card_number?: string | null;
          vehicles_json?: unknown;
          status?: string;
          submitted_at?: string;
          address?: string | null;
          full_name?: string | null;
        } | null;
      };
      const sub = resData?.submissionForOwner;
      if (
        sub &&
        (sub.id_card_front_url ||
          sub.id_card_back_url ||
          sub.id_card_number ||
          sub.driving_license_front_url)
      ) {
        return { found: true, submission: sub };
      }
      return { found: false, submission: null };
    };

    try {
      const res = await api.get("/kyc/my-latest");
      return res.data;
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        try {
          return await fromStatus();
        } catch {
          return { found: false, submission: null };
        }
      }
      try {
        return await fromStatus();
      } catch {
        return { found: false, submission: null };
      }
    }
  },

  checkKYCStatus: async (): Promise<any> => {
    try {
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) {
        console.warn("[checkKYCStatus] No userId, returning default");
        return {
          kycStatus: "not_submitted",
          kycLevel: "level_1",
          submittedAt: null,
          kycVerifiedAt: null,
          needsReverify: false,
          verificationStatus: null,
          lastSubmission: null,
          kycRejectionReason: null,
          kycAdminInstruction: null,
          kycResubmissionDeadline: null,
          kycRequiredSteps: [],
          kycSupplementMode: false,
          kycSupplementRequest: null,
        };
      }

      // ใช้ Backend endpoint สำหรับตรวจสอบสถานะ
      const response = await api.get(`/kyc/status/${userId}`);
      return response.data;
    } catch (error: any) {
      console.warn(
        "[checkKYCStatus] Error, returning default:",
        error?.message,
      );

      // ✅ คืนค่า default ทันที ไม่ fallback ไป Firestore (ป้องกันวงจรนรก)
      return {
        kycStatus: "not_submitted",
        kycLevel: "level_1",
        submittedAt: null,
        kycVerifiedAt: null,
        needsReverify: false,
        verificationStatus: null,
        lastSubmission: null,
        kycRejectionReason: null,
        kycAdminInstruction: null,
        kycResubmissionDeadline: null,
        kycRequiredSteps: [],
        kycSupplementMode: false,
        kycSupplementRequest: null,
      };
    }
  },

  reVerifyKYC: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) throw new Error("Not logged in");
      const response = await api.post("/kyc/re-verify", { userId });
      return { success: true, message: response.data?.message };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error || e.message };
    }
  },

  // ============================================
  // ✅ AUTHENTICATION SERVICES
  // ============================================

  // Phase 1: Helper functions for OTP login
  getUserIdByPhone: async (phone: string): Promise<string | null> => {
    if (!db) return null;
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("phone", "==", phone),
        limit(1),
      );
      const snapshot = await getDocs(usersQuery);

      if (snapshot.empty) {
        return null;
      }

      return snapshot.docs[0].id;
    } catch (error) {
      console.error("Error getting user ID by phone:", error);
      return null;
    }
  },

  getUserByPhone: async (phone: string): Promise<UserProfile | null> => {
    if (!db) return null;
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("phone", "==", phone),
        limit(1),
      );
      const snapshot = await getDocs(usersQuery);

      if (snapshot.empty) {
        return null;
      }

      const docSnap = snapshot.docs[0];
      return mapDoc<UserProfile>(docSnap);
    } catch (error) {
      console.error("Error getting user by phone:", error);
      return null;
    }
  },

  getUserById: async (userId: string): Promise<UserProfile> => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));

      if (!userDoc.exists()) {
        throw new Error("User not found");
      }

      return mapDoc<UserProfile>(userDoc);
    } catch (error) {
      console.error("Error getting user by ID:", error);
      throw error;
    }
  },

  autoRegisterUser: async (phone: string): Promise<UserProfile> => {
    if (!db) throw new Error("Firebase not configured.");
    try {
      const userId = `user_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`;
      const newUser: Partial<UserProfile> = {
        id: userId,
        phone,
        name: `User ${phone.slice(-4)}`,
        email: `user${phone.slice(-4)}@meerak.app`,
        user: phone,
        isProvider: false,
        role: UserRole.USER,
        wallet_balance: 0,
        created_at: new Date().toISOString(),
      };

      await setDoc(doc(db, "users", userId), sanitize(newUser));

      console.log("✅ Auto-registered new user:", userId);

      return newUser as UserProfile;
    } catch (error) {
      console.error("Error auto-registering user:", error);
      throw error;
    }
  },

  /** ตรวจสอบเบอร์มีในระบบ (ก่อนส่ง OTP) */
  requestPasswordReset: async (phone: string): Promise<void> => {
    try {
      await api.post(
        "/auth/forgot-password",
        { phone },
        { timeout: HTTP_TIMEOUT_AUTH_MS },
      );
    } catch (e: any) {
      if (e.response?.status === 404) {
        throw new Error("ไม่พบบัญชีที่ผูกกับเบอร์นี้");
      }
      const raw = String(
        e.response?.data?.error || e.message || "ส่งคำขอไม่สำเร็จ",
      );
      if (/Phone number required/i.test(raw)) {
        throw new Error("กรุณากรอกเบอร์โทรศัพท์");
      }
      throw new Error(raw);
    }
  },

  /** ตั้งรหัสผ่านใหม่ หลังยืนยัน OTP แล้ว (ส่ง firebase_id_token จาก verifyOTP) */
  resetPassword: async (
    phone: string,
    newPassword: string,
    firebaseIdToken: string,
  ): Promise<void> => {
    try {
      const res = await api.post(
        "/auth/reset-password",
        {
          phone: String(phone || "").trim(),
          newPassword: String(newPassword || "").trim(),
          firebase_id_token: firebaseIdToken,
        },
        { timeout: HTTP_TIMEOUT_AUTH_MS },
      );
      if (!res.data?.success) {
        throw new Error(res.data?.error || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
      }
    } catch (e: any) {
      const status = e.response?.status;
      let msg = String(
        e.response?.data?.error || e.message || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ",
      );
      if (
        /firebase_id_token|Firebase Admin|FIREBASE_|GOOGLE_APPLICATION|privateKey|credential\.cert/i.test(
          msg,
        )
      ) {
        msg =
          status === 503
            ? "ระบบยืนยันตัวตนชั่วคราวไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ"
            : "ไม่สามารถตั้งรหัสผ่านได้ กรุณาขอรหัส OTP ใหม่แล้วลองอีกครั้ง";
      }
      throw new Error(msg);
    }
  },

  login: async (
    phone: string,
    password: string,
  ): Promise<{ token: string; user: UserProfile }> => {
    const trimmedPhone = normalizePhoneForApi(String(phone || "").trim());
    const trimmedPassword = String(password || "").trim();

    if (!trimmedPhone || trimmedPhone.length < 9) {
      throw new Error("กรุณากรอกเบอร์โทรศัพท์ให้ครบ");
    }
    if (!trimmedPassword) {
      throw new Error("กรุณากรอกรหัสผ่าน");
    }

    // #region agent log
    fetch('http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'990e30'},body:JSON.stringify({sessionId:'990e30',hypothesisId:'H5',location:'mockApi.ts:login',message:'login_start',data:{phoneLast4:trimmedPhone.slice(-4),native:isNativeCapacitorApp(),base:getBackendBase().slice(0,40)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    let lastError: unknown;
    for (let attempt = 0; attempt < LOGIN_TRANSPORT_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = LOGIN_RETRY_BACKOFF_MS[attempt] ?? 1500;
        await delayMs(backoff);
      }
      try {
        const response = await api.post(
          "/auth/login",
          { phone: trimmedPhone, password: trimmedPassword },
          { timeout: HTTP_TIMEOUT_AUTH_MS },
        );
        const { token, user } = response.data;
        if (!token || !user?.id) {
          throw new Error(
            response.data?.error || "Login failed: no token or user returned",
          );
        }
        if (token.startsWith("mock_") || token.startsWith("mock-jwt")) {
          throw new Error("Invalid token from backend. Use real JWT only.");
        }
        if (user.full_name && !user.name) {
          user.name = user.full_name;
        }
        localStorage.setItem("meerak_token", token);
        localStorage.setItem("meerak_user_id", user.id);
        // #region agent log
        fetch('http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'990e30'},body:JSON.stringify({sessionId:'990e30',hypothesisId:'H4',location:'mockApi.ts:login',message:'login_ok',data:{userId:String(user.id).slice(0,8),tokenStored:!!localStorage.getItem('meerak_token')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return { token, user };
      } catch (error: unknown) {
        lastError = error;
        const ax = error as {
          response?: { status?: number; data?: { error?: string; message?: string; retry_after?: number } };
          code?: string;
          message?: string;
        };

        if (ax?.response?.status === 429) {
          const data = ax.response?.data || {};
          const msg = data.message || data.error || "Too many login attempts.";
          const retry =
            typeof data.retry_after === "number" ? data.retry_after : undefined;
          const err = new Error(
            retry ? `${msg} Try again in ${retry} seconds.` : msg,
          ) as Error & { retry_after?: number };
          err.retry_after = retry;
          throw err;
        }

        if (
          ax?.response?.status === 401 ||
          ax?.response?.status === 403 ||
          ax?.response?.status === 400
        ) {
          const code = ax.response?.data?.code;
          const err = new Error(
            ax.response?.data?.error || "Invalid phone or password",
          ) as Error & { loginCode?: string };
          if (code) err.loginCode = String(code);
          throw err;
        }

        const retry =
          attempt < LOGIN_TRANSPORT_RETRIES - 1 &&
          isTransientAuthTransportError(error);
        if (!retry) break;
      }
    }

    const error = lastError as {
      code?: string;
      message?: string;
      response?: { data?: { error?: string } };
    };

    if (error?.code === "unavailable") {
      throw new Error("Cannot connect to server. Please check internet.");
    }

    const isNetworkError =
      error?.code === "ERR_NETWORK" || error?.message === "Network Error";
    if (isNetworkError) {
      const native = isNativeCapacitorApp();
      throw new Error(
        native
          ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว — ตรวจสัญญาณแล้วลองเข้าสู่ระบบอีกครั้ง"
          : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว ตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่ค่ะ",
      );
    }

    const isTimeout =
      error?.code === "ECONNABORTED" ||
      (typeof error?.message === "string" &&
        error.message.toLowerCase().includes("timeout"));
    if (isTimeout) {
      throw new Error(
        "ใช้เวลานานกว่าปกติ — ลองเข้าสู่ระบบอีกครั้ง (ตรวจสอบว่าสมัครสมาชิกขั้นสุดท้ายเสร็จแล้ว)",
      );
    }

    const msg =
      error?.response?.data?.error ||
      error?.message ||
      "Login failed. Ensure backend is running and use registered phone/password.";
    const code = (error as { response?: { data?: { code?: string } } })
      ?.response?.data?.code;
    const thrown = new Error(msg) as Error & { loginCode?: string };
    if (code) thrown.loginCode = String(code);
    throw thrown;
  },

  /** Register — Backend only. รับ JWT จาก POST /api/auth/register เท่านั้น ห้ามสร้าง token ฝั่ง Frontend */
  register: async (
    data: any,
    opts?: RegisterCallOptions,
  ): Promise<{ token: string; user: UserProfile }> => {
    const payload = {
      ...data,
      phone:
        data.phone != null
          ? normalizePhoneForApi(String(data.phone).trim())
          : "",
      password: data.password != null ? String(data.password).trim() : "",
      name: data.name != null ? String(data.name).trim() : "",
    };

    // #region agent log
    fetch('http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'990e30'},body:JSON.stringify({sessionId:'990e30',hypothesisId:'H2',location:'mockApi.ts:register',message:'register_start',data:{phoneLast4:payload.phone.slice(-4),hasFirebaseUid:!!data.firebase_uid,native:isNativeCapacitorApp()},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    let lastError: unknown;
    for (let attempt = 0; attempt < REGISTER_TRANSPORT_RETRIES; attempt++) {
      if (attempt > 0) {
        opts?.onTransportRetry?.({
          attempt,
          maxAttempts: REGISTER_TRANSPORT_RETRIES,
        });
        const backoff = REGISTER_RETRY_BACKOFF_MS[attempt] ?? 1750;
        await delayMs(backoff);
      }

      try {
        const hdr: Record<string, string> = {
          "x-registration-client-attempt": String(attempt + 1),
        };
        if (opts?.idempotencyKey) {
          hdr["Idempotency-Key"] = String(opts.idempotencyKey)
            .trim()
            .slice(0, 160);
        }
        const response = await api.post("/auth/register", payload, {
          timeout: HTTP_TIMEOUT_AUTH_MS,
          headers: hdr,
        });
        const { token, user } = response.data;
        if (!token || !user?.id) {
          throw new Error(
            response.data?.error ||
              "Register failed: no token or user returned",
          );
        }
        if (token.startsWith("mock_") || token.startsWith("mock-jwt")) {
          throw new Error("Invalid token from backend. Use real JWT only.");
        }

        if (user.full_name && !user.name) {
          user.name = user.full_name;
        }

        localStorage.setItem("meerak_token", token);
        localStorage.setItem("meerak_user_id", user.id);
        // #region agent log
        fetch('http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'990e30'},body:JSON.stringify({sessionId:'990e30',hypothesisId:'H2',location:'mockApi.ts:register',message:'register_ok',data:{userId:String(user.id).slice(0,8),tokenStored:!!localStorage.getItem('meerak_token')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return { token, user };
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error) && error.response?.status === 409) {
          throw new Error(
            "เบอร์โทรนี้มีบัญชีแล้ว — โปรดเข้าระบบด้วยรหัสผ่าน หากคุณกดสมัครไปครั้งหนึ่งแล้ว บางทีระบบอาจบันทึกสำเร็จแต่หน้าจอไม่แสดงผลครับ",
          );
        }

        const retry =
          attempt < REGISTER_TRANSPORT_RETRIES - 1 &&
          isTransientRegistrationTransportError(error);
        if (!retry) break;
      }
    }

    if (axios.isAxiosError(lastError)) {
      const d = lastError.response?.data as { error?: string } | undefined;
      const emsg = typeof d?.error === "string" ? d.error.trim() : "";
      if (emsg) throw new Error(emsg);
    }
    if (lastError instanceof Error && String(lastError.message || "").trim()) {
      throw lastError;
    }
    throw new Error(
      "ยังสร้างบัญชีไม่สำเร็จ — กรุณากดสมัครสมาชิกอีกครั้ง (อย่าไปหน้าเข้าสู่ระบบจนกว่าจะเห็นข้อความสมัครสำเร็จ)",
    );
  },

  getProfile: async (
    userId?: string,
    options?: { phone?: string; refresh?: boolean },
  ): Promise<UserProfile> => {
    const targetId = userId || localStorage.getItem("meerak_user_id");
    if (!targetId) {
      console.error("[getProfile] No user ID provided");
      throw new Error("No user ID provided");
    }

    const cacheKey = `profile:${targetId}`;
    // refresh=true = ข้าม cache (หลังโอนเงิน/อนุมัติงาน)
    if (options?.refresh) apiCache.delete(cacheKey);
    // bust cache ถ้าผู้ใช้เพิ่งผ่านการสอบ Module 2 (flag จาก NexusExamModule2Quiz)
    const bustFlag = localStorage.getItem("meerak_cert_cache_bust");
    if (bustFlag) {
      apiCache.delete(cacheKey);
      localStorage.removeItem("meerak_cert_cache_bust");
    }
    const cached = getCached<UserProfile>(cacheKey);
    if (cached) {
      const merged = mergeBankAccountsIntoProfile(cached, targetId);
      if (merged !== cached) setCache(cacheKey, merged);
      return merged;
    }

    try {
      // โหลดจาก Backend ก่อน เพื่อให้ได้ vip_tier / vip_expiry / vip_quota_balance ล่าสุด (หลังสมัคร VIP)
      try {
        const params = options?.phone ? { phone: options.phone } : {};
        const response = await api.get(`/users/profile/${targetId}`, {
          params,
        });
        if (response?.data && typeof response.data === "object") {
          console.log("[getProfile] Backend returned profile for:", targetId);
          const merged = mergeBankAccountsIntoProfile(
            response.data as UserProfile,
            targetId,
          );
          setCache(cacheKey, merged);
          return merged;
        }
      } catch (backendErr: any) {
        // ✅ ถ้า 404 (User not found) ให้ throw ทันที ไม่ fallback ไป Firestore
        if (backendErr?.response?.status === 404) {
          console.error(
            "[getProfile] User not found in backend (404):",
            targetId,
          );
          throw new Error("User not found");
        }
        console.warn(
          "[getProfile] Backend failed, trying Firestore fallback:",
          backendErr?.message,
        );
      }

      // Firestore Fallback
      const docRef = doc(db, "users", targetId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        console.log("[getProfile] Firestore returned profile for:", targetId);
        const profile = mapDoc<UserProfile>(docSnap);
        const merged = mergeBankAccountsIntoProfile(profile, targetId);
        setCache(cacheKey, merged);
        return merged;
      }
      console.error("[getProfile] User not found in Firestore:", targetId);
      throw new Error("User not found");
    } catch (e) {
      return handleFirestoreError(e, "getProfile");
    }
  },

  updateProfile: async (
    updates: Partial<UserProfile>,
  ): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    // 1. Try Backend first (users in PostgreSQL)
    try {
      const res = await api.patch<{ success?: boolean; user?: UserProfile }>(
        `/users/profile/${userId}`,
        sanitize(updates),
      );
      const backendUser = res.data?.user;
      if (backendUser && typeof backendUser === "object") {
        const merged: UserProfile = {
          ...backendUser,
          id: backendUser.id || userId,
          name:
            (backendUser as any).name ??
            (backendUser as any).full_name ??
            backendUser.name,
        };
        apiCache.delete(`profile:${userId}`);
        setCache(`profile:${userId}`, merged);
        return merged;
      }
    } catch (backendErr: any) {
      const status = backendErr?.response?.status;
      const data = backendErr?.response?.data;
      console.error(
        "[updateProfile] Backend failed:",
        status,
        data?.error || data?.message || backendErr?.message,
      );
      if (status === 404 || status === 403) {
        // User not in backend — fallback to Firestore
      } else {
        throw new Error(
          data?.error ||
            data?.message ||
            backendErr?.message ||
            "Update failed",
        );
      }
    }

    // 2. Fallback: Firestore (สำหรับ user ที่ยังไม่มีใน Backend)
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, sanitize(updates));
      const updatedSnap = await getDoc(userRef);
      const mapped = mapDoc<UserProfile>(updatedSnap);
      apiCache.delete(`profile:${userId}`);
      setCache(`profile:${userId}`, mapped);
      return mapped;
    } catch (e) {
      console.error("[updateProfile] Firestore failed:", e);
      return handleFirestoreError(e, "updateProfile");
    }
  },

  /**
   * AKONDA VIP: สมัครแผน VIP (เชื่อมเมื่อ backend พร้อม)
   * Backend คาดว่า: POST /api/vip/subscribe { tier, phone? } + Header Authorization: Bearer <token>
   * คืนค่า: { success, message: 'VIP Updated', tier, vip_expiry, vip_quota_balance } หรือ error
   * ส่ง phone ด้วยถ้ามี (เพื่อให้ backend หา user จากเบอร์ได้เมื่อล็อกอินด้วย OTP)
   */
  subscribeVipPlan: async (
    tier: "silver" | "gold" | "platinum",
    phone?: string | null,
  ): Promise<{
    success: boolean;
    payment_id?: string;
    payment_url?: string;
    qr_url?: string;
    amount?: number;
    user?: UserProfile;
    message?: string;
    tier?: string;
    vip_expiry?: string;
    vip_quota_balance?: number;
  }> => {
    try {
      const token = localStorage.getItem("meerak_token");
      if (!token) {
        throw new Error("กรุณาเข้าสู่ระบบก่อนสมัคร VIP");
      }
      const body: { tier: string; phone?: string } = { tier };
      if (phone && String(phone).trim()) body.phone = String(phone).trim();
      console.log(
        "[VIP subscribe] Sending to backend:",
        body,
        "| URL:",
        `${getBackendBase()}/api/vip/subscribe`,
      );
      const response = await api.post("/vip/subscribe", body, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (!err.response) {
        throw new Error(
          "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ — ตรวจสอบว่า Backend รันอยู่และ VITE_BACKEND_URL ถูกต้อง",
        );
      }
      if (status === 400) {
        if (data?.code === "INSUFFICIENT_WALLET_VIP") {
          throw new Error(
            `${data?.error || "ยอดเงินในกระเป๋าไม่พอ"} (ต้องการ ${Number(data?.required ?? 0).toLocaleString()} ฿ — คงเหลือ ${Number(data?.balance ?? 0).toLocaleString()} ฿)`,
          );
        }
        throw new Error(
          data?.error || "กรุณาเลือกแผน silver, gold หรือ platinum",
        );
      }
      if (status === 401) {
        throw new Error(
          data?.error || "Token ไม่ถูกต้องหรือหมดอายุ — กรุณาเข้าสู่ระบบใหม่",
        );
      }
      if (status === 404 || status === 501) {
        const hint = data?.hint ? ` — ${data.hint}` : "";
        throw new Error(
          (data?.error ||
            data?.message ||
            "ระบบสมัคร VIP กำลังเตรียมเปิดให้บริการเร็วๆ นี้") + hint,
        );
      }
      if (status === 500) {
        throw new Error(
          data?.error ||
            data?.message ||
            "ข้อผิดพลาดจากเซิร์ฟเวอร์ (ตรวจสอบ JWT_SECRET ใน .env)",
        );
      }
      throw new Error(
        data?.error || data?.message || "ไม่สามารถสมัครแผน VIP ได้",
      );
    }
  },

  // ============================================
  // ✅ WALLET SERVICES - Backend ledger first (double-entry, idempotent), fallback Firebase
  // ============================================
  walletTopUp: async (
    amount: number,
    ledgerContext?: {
      gateway: "promptpay" | "truemoney" | "bank_transfer";
      payment_id: string;
      job_id: string;
      bill_no: string;
      transaction_no: string;
      /** URL จากการอัปโหลดสลิป (บังคับเมื่อ gateway = bank_transfer) */
      slip_url?: string;
    },
  ): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    const idempotencyKey =
      ledgerContext?.transaction_no ||
      `topup_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const res = await api.post("/wallet/topup", {
        idempotency_key: idempotencyKey,
        amount,
        gateway: ledgerContext?.gateway || "wallet",
        payment_id: ledgerContext?.payment_id || `topup_${Date.now()}`,
        bill_no: ledgerContext?.bill_no || `B${Date.now()}`,
        transaction_no: ledgerContext?.transaction_no || `T${Date.now()}`,
        ...(ledgerContext?.slip_url
          ? { slip_url: ledgerContext.slip_url }
          : {}),
      });
      const data = res.data as {
        balance: number;
        transaction_group_id: string;
      };
      if (REAL_MONEY_MODE) {
        const profile = await MockApi.getProfile(userId);
        return { ...profile, wallet_balance: data.balance };
      }
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { wallet_balance: data.balance });
      const tx: Transaction = {
        id: `tx-${Date.now()}`,
        user_id: userId,
        type: "deposit",
        amount,
        date: new Date().toISOString(),
        description: ledgerContext
          ? `Wallet Top-up (${ledgerContext.gateway})`
          : "Wallet Top-up",
        status: "completed",
      };
      await addDoc(collection(db, "transactions"), sanitize(tx));
      const updated = await getDoc(userRef);
      return mapDoc<UserProfile>(updated);
    } catch (e: any) {
      if (REAL_MONEY_MODE) {
        return handleFirestoreError(e, "walletTopUp");
      }
      if (e?.response?.status === 409 || e?.response?.status === 200) {
        const data = e.response?.data as { balance?: number };
        if (data?.balance != null) {
          const userRef = doc(db, "users", userId);
          await updateDoc(userRef, { wallet_balance: data.balance });
          const updated = await getDoc(userRef);
          return mapDoc<UserProfile>(updated);
        }
      }
      if (
        e?.response?.status === 503 ||
        e?.code === "ECONNREFUSED" ||
        e?.message?.includes("Network")
      ) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        const currentBal = userSnap.data()?.wallet_balance || 0;
        await updateDoc(userRef, { wallet_balance: currentBal + amount });
        const tx: Transaction = {
          id: `tx-${Date.now()}`,
          user_id: userId,
          type: "deposit",
          amount,
          date: new Date().toISOString(),
          description: ledgerContext
            ? `Wallet Top-up (${ledgerContext.gateway})`
            : "Wallet Top-up",
          status: "completed",
        };
        await addDoc(collection(db, "transactions"), sanitize(tx));
        if (ledgerContext) {
          try {
            await recordPaymentCompleted({
              payment_id: ledgerContext.payment_id,
              gateway: ledgerContext.gateway,
              job_id: ledgerContext.job_id,
              amount,
              currency: "THB",
              bill_no: ledgerContext.bill_no,
              transaction_no: ledgerContext.transaction_no,
              user_id: userId,
              metadata: { source: "wallet_topup" },
            });
          } catch (_) {}
        }
        const updated = await getDoc(userRef);
        return mapDoc<UserProfile>(updated);
      }
      return handleFirestoreError(e, "walletTopUp");
    }
  },

  walletWithdraw: async (
    amount_net: number,
    bankInfo: string,
    channel: PaymentChannel = "bank_transfer",
  ): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    const idempotencyKey = `withdraw_${userId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    try {
      try {
        const res = await api.post("/wallet/withdraw", {
          idempotency_key: idempotencyKey,
          amount_net,
          channel,
          bank_info: bankInfo,
        });
        const data = res.data as {
          balance: number;
          fee_thb: number;
          net_amount: number;
        };
        if (REAL_MONEY_MODE) {
          const profile = await MockApi.getProfile(userId);
          return { ...profile, wallet_balance: data.balance };
        }
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { wallet_balance: data.balance });
        const tx: Transaction = {
          id: `tx-w-${Date.now()}`,
          user_id: userId,
          type: "withdrawal",
          amount: data.net_amount,
          date: new Date().toISOString(),
          description: `Withdrawal (${channel})`,
          status: "pending",
          bank_info: bankInfo,
        };
        await addDoc(collection(db, "transactions"), sanitize(tx));
        const feeTx: Transaction = {
          id: `tx-f-${Date.now()}`,
          user_id: userId,
          type: "payment",
          amount: data.fee_thb,
          date: new Date().toISOString(),
          description: `Withdrawal Fee (${channel})`,
          status: "completed",
        };
        await addDoc(collection(db, "transactions"), sanitize(feeTx));
        const updated = await getDoc(userRef);
        return mapDoc<UserProfile>(updated);
      } catch (backendErr: any) {
        if (
          backendErr?.response?.status === 409 ||
          backendErr?.response?.status === 200
        ) {
          const data = backendErr.response?.data as { balance?: number };
          if (data?.balance != null) {
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, { wallet_balance: data.balance });
            const updated = await getDoc(userRef);
            return mapDoc<UserProfile>(updated);
          }
        }
        throw backendErr;
      }
    } catch (e: any) {
      if (REAL_MONEY_MODE) {
        return handleFirestoreError(e, "walletWithdraw");
      }
      if (
        e?.response?.status === 503 ||
        e?.code === "ECONNREFUSED" ||
        e?.message?.includes("Network")
      ) {
        const fee_thb = getWithdrawalFeeForNet(channel, amount_net);
        const totalDeduction = amount_net + fee_thb;
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        const currentBal = userSnap.data()?.wallet_balance || 0;
        if (currentBal < totalDeduction)
          throw new Error("Insufficient balance for withdrawal + fee");
        await updateDoc(userRef, {
          wallet_balance: currentBal - totalDeduction,
        });
        const tx: Transaction = {
          id: `tx-w-${Date.now()}`,
          user_id: userId,
          type: "withdrawal",
          amount: amount_net,
          date: new Date().toISOString(),
          description: `Withdrawal (${channel})`,
          status: "pending",
          bank_info: bankInfo,
        };
        await addDoc(collection(db, "transactions"), sanitize(tx));
        const feeTx: Transaction = {
          id: `tx-f-${Date.now()}`,
          user_id: userId,
          type: "payment",
          amount: fee_thb,
          date: new Date().toISOString(),
          description: `Withdrawal Fee (${channel})`,
          status: "completed",
        };
        await addDoc(collection(db, "transactions"), sanitize(feeTx));
        const updated = await getDoc(userRef);
        return mapDoc<UserProfile>(updated);
      }
      return handleFirestoreError(e, "walletWithdraw");
    }
  },

  // ============================================
  // ✅ JOB SERVICES
  // ============================================
  getJobs: async (category?: string, searchQuery?: string): Promise<Job[]> => {
    try {
      try {
        const params: any = {};
        if (category && category !== "All") params.category = category;
        if (searchQuery) params.search = searchQuery;
        const response = await api.get("/jobs", { params });
        const data = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
        const baseURL = api.defaults?.baseURL || "";
        console.log(
          "[getJobs] Backend returned",
          data.length,
          "job(s). BaseURL:",
          baseURL,
          "Sample ids:",
          data.slice(0, 3).map((j: any) => j?.id),
        );
        return data.map((j: any) => ({
          ...j,
          id: j.id != null ? String(j.id) : j.id,
          location:
            typeof j.location === "object" && j.location
              ? j.location
              : { lat: 13.736717, lng: 100.523186 },
          datetime: j.datetime || j.created_at,
          status: j.status || "open",
        }));
      } catch (backendError) {
        console.warn(
          "[getJobs] Backend failed, falling back to Firebase. Error:",
          backendError,
        );
      }

      // Fallback to Firebase
      const jobsRef = collection(db, "jobs");
      const q = query(jobsRef, where("status", "==", JobStatus.OPEN));
      const querySnapshot = await getDocs(q);
      let jobs = querySnapshot.docs.map((d) => mapDoc<Job>(d));

      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      jobs = jobs.filter((j) => {
        const created = new Date(j.created_at || j.datetime).getTime();
        return now - created < ONE_DAY;
      });

      if (category && category !== "All")
        jobs = jobs.filter((j) => j.category === category);
      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        jobs = jobs.filter(
          (j) =>
            j.title.toLowerCase().includes(lowerQ) ||
            j.description.toLowerCase().includes(lowerQ),
        );
      }
      // Ensure location is not null
      jobs = jobs.map((job) => ({
        ...job,
        location: job.location || { lat: 13.736717, lng: 100.523186 },
      }));
      const sorted = jobs.sort(
        (a, b) =>
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
      );
      console.log(
        "[getJobs] Using Firebase fallback:",
        sorted.length,
        "job(s) (งานที่ Bob โพสต์ผ่าน backend จะไม่โผล่ที่นี่)",
      );
      return sorted;
    } catch (e) {
      console.warn("Failed to fetch jobs:", e);
      return [];
    }
  },

  /** Mock booking storage key — jobs from MockBooking flow appear in My Jobs */
  MOCK_BOOKINGS_KEY: "meerak_mock_bookings",

  addMockBooking: (job: Job): void => {
    try {
      const raw = localStorage.getItem("meerak_mock_bookings");
      const list: Job[] = raw ? JSON.parse(raw) : [];
      list.push(job);
      localStorage.setItem("meerak_mock_bookings", JSON.stringify(list));
      console.log("📦 Mock booking added:", job.id, job.category);
    } catch (e) {
      console.error("addMockBooking error:", e);
    }
  },

  getMockBookings: (userId?: string): Job[] => {
    try {
      const uid = userId || localStorage.getItem("meerak_user_id");
      if (!uid) return [];
      const raw = localStorage.getItem("meerak_mock_bookings");
      const list: Job[] = raw ? JSON.parse(raw) : [];
      return list.filter((j) => String(j.created_by) === String(uid));
    } catch {
      return [];
    }
  },

  getYourJobs: async (
    userId?: string,
    options?: { includeExpired?: boolean },
  ): Promise<Job[]> => {
    const uid = userId || localStorage.getItem("meerak_user_id");
    if (!uid) return [];
    const includeExpired = options?.includeExpired ?? false;
    const normalizeJob = (j: any): Job => {
      let location = j.location;
      if (typeof location === "string") {
        try {
          location = JSON.parse(location);
        } catch {
          location = { lat: 0, lng: 0 };
        }
      }
      if (!location || typeof location !== "object")
        location = { lat: 0, lng: 0 };
      return {
        ...j,
        id: j.id != null ? String(j.id) : j.id,
        created_by: j.created_by != null ? String(j.created_by) : j.created_by,
        accepted_by:
          j.accepted_by != null ? String(j.accepted_by) : j.accepted_by,
        status: (j.status && String(j.status)) || "open",
        location,
        datetime: j.datetime || j.created_at,
      };
    };
    const mergeMockBookings = (base: Job[]): Job[] => {
      const mockBookings = MockApi.getMockBookings(uid);
      const byId = new Map<string, Job>();
      [...mockBookings, ...base].forEach((j) => byId.set(String(j.id), j));
      return Array.from(byId.values()).sort(
        (a, b) =>
          new Date(b.datetime || b.created_at || 0).getTime() -
          new Date(a.datetime || a.created_at || 0).getTime(),
      );
    };
    try {
      try {
        const qs = includeExpired ? "?includeExpired=true" : "";
        const response = await api.get(`/users/jobs/${uid}${qs}`);
        const data = response.data || [];
        const list = (Array.isArray(data) ? data : []).filter(
          (j: any) => j && j.id !== "mock-001" && j.id != null,
        );
        if (list.length > 0) {
          console.log(
            `📦 Backend returned ${list.length} jobs for user ${uid}`,
          );
        } else {
          console.warn(
            `📦 Backend returned 0 jobs for user ${uid} (ตรวจ backend: GET /api/users/jobs/${uid} ควรคืนงานที่ created_by/accepted_by = ${uid})`,
          );
        }
        return mergeMockBookings(list.map(normalizeJob));
      } catch (backendError: any) {
        console.warn(
          "Backend user jobs fetch failed, falling back to Firebase:",
          backendError?.response?.status,
          backendError?.message,
        );
      }

      const q = query(collection(db, "jobs"));
      const snap = await getDocs(q);
      const allJobs = snap.docs.map((d) => mapDoc<Job>(d));
      const relevantJobs = allJobs.filter(
        (j) => j.created_by === uid || j.accepted_by === uid,
      );
      return mergeMockBookings(relevantJobs.map(normalizeJob));
    } catch (e) {
      const mock = MockApi.getMockBookings(uid);
      return mock.sort(
        (a, b) =>
          new Date(b.datetime || b.created_at || 0).getTime() -
          new Date(a.datetime || a.created_at || 0).getTime(),
      );
    }
  },

  createJob: async (jobData: any): Promise<Job> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    try {
      // 1. ตรวจสอบข้อมูลเบื้องต้น
      const requiredFields = [
        "title",
        "description",
        "category",
        "price",
        "location",
      ];
      for (const field of requiredFields) {
        if (!jobData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // 2. ใช้ created_by จาก payload ก่อน (ให้ตรงกับ CreateJob ที่ส่ง user.id) ไม่ overwrite ด้วย localStorage
      const createdBy = jobData.created_by ?? jobData.createdBy ?? userId;
      const cleanJobData = {
        ...jobData,
        created_by: createdBy,
        createdBy: createdBy,
        // ใช้ timestamp แบบ ISO string
        datetime: jobData.datetime
          ? new Date(jobData.datetime).toISOString()
          : new Date().toISOString(),
        // location ต้องมีโครงสร้างที่ถูกต้อง
        location: jobData.location || { lat: 0, lng: 0 },
        // status default
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 3. ลอง backend ก่อน
      try {
        console.log("Trying backend API...");
        const response = await api.post("/jobs", cleanJobData);
        console.log("Backend job creation successful:", response.data);
        // Backend ส่งกลับ { success, message, job } — ต้องใช้ .job เพื่อให้มี .id สำหรับ navigate และดูรายละเอียด
        const job = response.data?.job ?? response.data;
        return { ...job, id: job.id || job.job_id };
      } catch (backendError: any) {
        const status = backendError.response?.status;
        const data = backendError.response?.data;
        const backendMsg = data?.error || data?.message || backendError.message;
        console.warn(
          "Backend job creation failed:",
          status,
          backendMsg,
          "| details:",
          data?.details,
          "| url:",
          backendError.config?.url,
        );

        // 401 = token หมดอายุ/ไม่ถูกต้อง → ให้ login ใหม่
        if (status === 401) {
          throw new Error("กรุณาเข้าสู่ระบบใหม่อีกครั้ง (Session หมดอายุ)");
        }
        // 403 "ไม่พบผู้ใช้" = user lookup ล้มเหลว (ไม่ใช่ auth) — ส่ง error จริงไปให้ user เห็น
        if (status === 403) {
          throw new Error(
            backendMsg ||
              "ไม่สามารถโพสต์งานได้ กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง",
          );
        }
        // 400 = validation error — ส่ง error จริง
        if (status === 400) {
          throw new Error(backendMsg || "ข้อมูลไม่ครบหรือไม่ถูกต้อง");
        }
        // 500 หรือ network error — fallback ไป Firebase
      }

      // 4. Fallback to Firebase
      console.log("Using Firebase fallback...");

      // ตรวจสอบ availability (ถ้ามี assigned_to)
      if (jobData.assigned_to && jobData.datetime) {
        const isAvailable = await MockApi.checkAvailability(
          jobData.assigned_to,
          jobData.datetime,
          jobData.duration_hours || 2,
        );
        if (!isAvailable) {
          throw new Error("Provider is not available at the selected time.");
        }
      }

      // ดึงข้อมูลผู้ใช้
      const user = await MockApi.getProfile(userId);

      // สร้าง job object สำหรับ Firebase
      const firebaseJob = {
        ...cleanJobData,
        created_by_name: user.name || "Unknown",
        created_by_phone: user.phone || "",
        created_by_avatar: user.avatar_url || "",
        // ใช้ location จาก user ถ้า job ไม่มี
        location: cleanJobData.location || user.location || { lat: 0, lng: 0 },
        tips_amount: 0,
        // เพิ่ม field สำหรับแยกแยะว่าเป็น fallback job
        _source: "firebase_fallback",
        _backend_failed: true,
      };

      // ทำความสะอาดข้อมูล
      const cleanJob = sanitize(firebaseJob);

      // บันทึกลง Firebase
      const docRef = await addDoc(collection(db, "jobs"), cleanJob);

      // สร้าง job response
      const jobResponse = {
        ...cleanJob,
        id: docRef.id,
      } as Job;

      console.log("Firebase job creation successful:", jobResponse);
      return jobResponse;
    } catch (error: any) {
      console.error("createJob error:", error);

      // เก็บลง localStorage เป็น temporary fallback ถ้า Firebase ก็ล้มเหลว
      if (
        error.message.includes("Firestore") ||
        error.message.includes("firebase")
      ) {
        console.warn(
          "Firebase also failed, storing in localStorage as last resort",
        );

        const tempJob = {
          ...jobData,
          id: `temp_${Date.now()}`,
          created_by: userId,
          created_at: new Date().toISOString(),
          status: "pending",
          _source: "localstorage",
        };

        // เก็บใน localStorage
        const tempJobs = JSON.parse(localStorage.getItem("temp_jobs") || "[]");
        tempJobs.push(tempJob);
        localStorage.setItem("temp_jobs", JSON.stringify(tempJobs));

        return tempJob;
      }

      throw error;
    }
  },

  getJobDetails: async (jobId: string): Promise<Job | undefined> => {
    try {
      // Job ID รูปแบบ Firestore (20 ตัวอักษร alphanumeric, ไม่มี -) = งานสร้างจาก Firebase fallback
      // ลอง Firebase ก่อนเพื่อหลีกเลี่ยง 404 ที่ไม่จำเป็น (Backend ไม่มีงานรูปแบบนี้)
      const isFirestoreId =
        /^[a-zA-Z0-9]{19,22}$/.test(jobId) && !jobId.includes("-");
      if (isFirestoreId) {
        const docRef = doc(db, "jobs", jobId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return mapDoc<Job>(docSnap);
        return undefined; // Firestore ID แต่ไม่มีใน Firebase = งานถูกลบหรือไม่มี
      }

      // งานจาก Backend (UUID หรือ job_xxx) — เรียก API ก่อน
      try {
        const response = await api.get(`/jobs/${jobId}`);
        const { applyPostJobContactPolicy } =
          await import("../utils/postJobContactPolicy");
        return applyPostJobContactPolicy(
          response.data as Record<string, unknown>,
        ) as Job;
      } catch (backendError) {
        console.warn(
          "Backend job details fetch failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase (กรณี job_xxx ที่อาจมีใน Firestore)
      const docRef = doc(db, "jobs", jobId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const { applyPostJobContactPolicy } =
          await import("../utils/postJobContactPolicy");
        return applyPostJobContactPolicy(
          mapDoc<Job>(docSnap) as unknown as Record<string, unknown>,
        ) as Job;
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  },

  acceptJob: async (
    jobId: string,
    options?: { forceIgnoreConflict?: boolean },
  ): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");
    try {
      // ใช้ Backend ก่อน (งานที่ Bob โพสต์อยู่ที่ backend)
      try {
        await api.post(`/jobs/${jobId}/accept`, {
          userId,
          force_ignore_conflict: options?.forceIgnoreConflict,
        });
        return;
      } catch (backendError: any) {
        const status = backendError?.response?.status;
        const data = backendError?.response?.data;
        const msg = data?.error || data?.message || backendError?.message;
        if (status === 404) {
          throw new Error(msg || "ไม่พบงานนี้ กรุณารีเฟรชรายการและลองใหม่");
        }
        if (status === 400) {
          const userMsg =
            (typeof data?.message === "string" && data.message) ||
            (typeof data?.error === "string" && data.error) ||
            msg ||
            "Job is not available.";
          throw new Error(userMsg);
        }
        if (status === 403) {
          throw new Error(msg || "ไม่มีสิทธิ์รับงานนี้");
        }
        if (status === 409 && data?.conflict) {
          const err = new Error(
            msg || "คุณมีงานที่ทับซ้อน หากดำเนินการต่อจะถูก Lock 24 ชั่วโมง",
          ) as Error & { conflict: true; conflicting?: unknown };
          err.conflict = true;
          err.conflicting = data.conflicting;
          throw err;
        }
        // งานจาก Backend (UUID มี -) — ไม่ fallback ไป Firestore เพราะงานไม่มีใน Firestore
        const isBackendJobId =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            jobId,
          );
        if (isBackendJobId || status >= 500) {
          throw new Error(
            msg || "ไม่สามารถรับงานได้ กรุณาตรวจสอบการเชื่อมต่อหรือลองใหม่",
          );
        }
        console.warn(
          "Backend accept failed, trying Firestore fallback:",
          backendError?.message,
        );
      }

      // Fallback to Firebase เฉพาะงานที่อาจมีใน Firestore (ID ไม่ใช่ UUID)
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) {
        throw new Error("ไม่พบงานนี้ กรุณารีเฟรชรายการและลองใหม่");
      }
      const job = mapDoc<Job>(jobSnap);
      const user = await MockApi.getProfile(userId);

      // ตรวจสอบว่าผู้จ้างมีเงินพอ
      const clientRef = doc(db, "users", job.created_by);
      const clientSnap = await getDoc(clientRef);
      const client = mapDoc<UserProfile>(clientSnap);

      if ((client.wallet_balance || 0) < job.price) {
        throw new Error("ผู้จ้างมียอดเงินในกระเป๋าไม่เพียงพอ");
      }

      const updateData = {
        status: JobStatus.ACCEPTED,
        accepted_by: userId,
        accepted_by_name: user.name,
        accepted_by_phone: user.phone,
        updated_at: new Date().toISOString(),
      };

      console.log("✅ Accepting job with data:", {
        jobId,
        userId,
        status: JobStatus.ACCEPTED,
        accepted_by: userId,
      });

      await updateDoc(jobRef, updateData);

      console.log("✅ Job accepted successfully! Firebase updated.");

      // ส่ง notifications
      await MockApi.sendNotification({
        user_id: job.created_by,
        title: "🎉 มีคนรับงานแล้ว!",
        message: `ผู้รับงาน "${user.name}" รับงาน "${job.title}" ของคุณแล้ว กรุณาติดต่อผู้รับงานที่เบอร์ ${user.phone}`,
        type: "job_match",
        related_id: jobId,
      });

      await MockApi.sendNotification({
        user_id: userId,
        title: "✅ รับงานสำเร็จ",
        message: `คุณรับงาน "${job.title}" แล้ว ติดต่อลูกค้าได้ที่เบอร์ ${job.created_by_phone}`,
        type: "job_match",
        related_id: jobId,
      });
    } catch (e) {
      return handleFirestoreError(e, "acceptJob");
    }
  },

  updateJobStatus: async (jobId: string, status: JobStatus): Promise<Job> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.patch(`/jobs/${jobId}/status`, { status });
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend job status update failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      console.log("Updating job status:", { jobId, status });

      const jobRef = doc(db, "jobs", jobId);
      await updateDoc(jobRef, {
        status: status,
        updated_at: new Date().toISOString(),
      });

      if (status === JobStatus.IN_PROGRESS) {
        await updateDoc(jobRef, {
          started_at: new Date().toISOString(),
        });
      }

      if (status === JobStatus.COMPLETED) {
        await updateDoc(jobRef, {
          completed_at: new Date().toISOString(),
        });
      }

      const updatedSnap = await getDoc(jobRef);
      return mapDoc<Job>(updatedSnap);
    } catch (error) {
      console.error("Failed to update job status:", error);
      throw new Error(`Failed to update job status: ${error.message}`);
    }
  },

  /** ดูค่าธรรมเนียมยกเลิก (เหมาข้ามจังหวัด — ผู้จ้าง) */
  getJobCancelQuote: async (jobId: string, userId?: string) => {
    const uid = userId || localStorage.getItem("meerak_user_id");
    if (!uid) throw new Error("Not logged in");
    const { data } = await api.get(`/jobs/${jobId}/cancel-quote`, {
      params: { userId: uid },
    });
    return data as {
      applies: boolean;
      cancel_fee?: {
        totalFeeThb?: number;
        driverAmountThb?: number;
        platformAmountThb?: number;
        tier?: string;
        reason?: string;
        free?: boolean;
      };
      message?: string;
    };
  },

  cancelJob: async (
    jobId: string,
    reason?: string,
    userId?: string,
    options?: { confirmIntercityCancelFee?: boolean },
  ): Promise<void> => {
    const uid = userId || localStorage.getItem("meerak_user_id");
    const token = localStorage.getItem("meerak_token");
    if (!uid && !token) throw new Error("Not logged in");

    try {
      await api.post(`/jobs/${jobId}/cancel`, {
        ...(uid ? { userId: uid } : {}),
        reason: reason || "Cancelled by employer",
        ...(options?.confirmIntercityCancelFee
          ? { confirm_intercity_cancel_fee: true }
          : {}),
      });
      return;
    } catch (backendErr: any) {
      if (
        backendErr?.response?.status === 404 ||
        backendErr?.response?.status === 403
      ) {
        throw new Error(
          backendErr?.response?.data?.error || backendErr.message,
        );
      }
      if (backendErr?.response?.status === 400) {
        const d = backendErr?.response?.data;
        const msg =
          d?.message ||
          d?.error ||
          (typeof d?.error === "string" ? d.error : null) ||
          "Cannot cancel job in current status";
        throw new Error(msg);
      }
    }

    if (!uid) throw new Error("User ID required for cancel");

    const jobRef = doc(db, "jobs", jobId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) throw new Error("Job not found");
    const job = mapDoc<Job>(jobSnap);
    if (job.created_by !== uid) throw new Error("Only job owner can cancel");
    if (job.status !== JobStatus.OPEN && job.status !== JobStatus.ACCEPTED) {
      throw new Error("Cannot cancel job in current status");
    }
    if (job.status === JobStatus.ACCEPTED && job.accepted_by) {
      const clientRef = doc(db, "users", job.created_by);
      const clientSnap = await getDoc(clientRef);
      const client = clientSnap.data();
      await updateDoc(clientRef, {
        wallet_balance: (client?.wallet_balance || 0) + job.price,
        updated_at: new Date().toISOString(),
      });
      await addDoc(collection(db, "transactions"), {
        user_id: job.created_by,
        amount: job.price,
        type: "refund",
        status: "completed",
        description: `Refund for cancelled job: ${job.title}`,
        created_at: new Date().toISOString(),
      });
    }
    await updateDoc(jobRef, {
      status: JobStatus.CANCELLED,
      cancellation_reason: reason || "Cancelled by employer",
      cancelled_at: new Date().toISOString(),
      cancelled_by: uid,
      updated_at: new Date().toISOString(),
    });
  },

  markJobAsDone: async (
    jobId: string,
    providerLocation: Location,
    otpCode?: string,
    meetCode?: string,
    completionExtras?: JobCompletionExtras,
  ): Promise<void> => {
    try {
      const providerId = localStorage.getItem("meerak_user_id") || undefined;
      // พยายามใช้ Backend ก่อน (Safety: OTP หรือ GPS สำหรับงาน Physical)
      try {
        await api.post(`/jobs/${jobId}/complete`, {
          providerLocation,
          otpCode: otpCode || undefined,
          meetCode: meetCode || undefined,
          userId: providerId,
          completionExtras: normalizeCompletionExtras(completionExtras),
        });
        return;
      } catch (backendError: any) {
        const data = backendError?.response?.data;
        const msg = data?.message || data?.error || backendError?.message;
        // มี HTTP response จาก backend = ห้าม fallback Firebase (จะข้าม OTP/GPS/proof ที่บังคับฝั่ง Postgres)
        if (backendError?.response) {
          const e: any = new Error(msg || "ไม่สามารถส่งงานได้");
          e.code = data?.error;
          e.status = backendError.response.status;
          throw e;
        }
        console.warn(
          "Backend job completion unreachable, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase (เมื่อ backend unreachable)
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) {
        throw new Error("Job not found");
      }
      const job = mapDoc<Job>(jobSnap);
      const extrasNorm = normalizeCompletionExtras(completionExtras);
      const prevPd =
        job.payment_details &&
        typeof job.payment_details === "object" &&
        !Array.isArray(job.payment_details)
          ? { ...(job.payment_details as object) }
          : {};
      if (extrasNorm) {
        (prevPd as Record<string, unknown>).provider_completion_extras =
          toStoredProviderExtras(extrasNorm);
      }
      await updateDoc(jobRef, {
        status: JobStatus.WAITING_FOR_APPROVAL,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_notified_at: null,
        client_viewed_notification: false,
        auto_approve_start_time: null,
        payment_details: prevPd,
      });

      await MockApi.sendNotification({
        user_id: job.created_by,
        title: "📸 มีผลงานรอตรวจสอบ",
        message: `ผู้รับงาน ${job.accepted_by_name} ได้ส่งรูปผลงานรอการตรวจสอบ`,
        type: "system",
        related_id: jobId,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      return handleFirestoreError(e, "markJobAsDone");
    }
  },

  requestJobCompletionOtp: async (
    jobId: string,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      await api.post(`/jobs/${jobId}/request-completion-otp`, {});
      return { success: true, message: "OTP generated; share with provider." };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error || e.message };
    }
  },

  // ✅ Employer: บันทึก Talent (Like/Heart) — สำหรับจ้างภายหลัง
  saveTalent: async (talentId: string): Promise<{ success: boolean }> => {
    try {
      const res = await api.post("/employer/saved-talents", {
        talent_id: talentId,
      });
      return { success: !!res.data?.success };
    } catch (e: any) {
      console.warn("saveTalent:", e?.response?.data || e.message);
      return { success: false };
    }
  },
  unsaveTalent: async (talentId: string): Promise<{ success: boolean }> => {
    try {
      await api.delete(`/employer/saved-talents/${talentId}`);
      return { success: true };
    } catch (e: any) {
      console.warn("unsaveTalent:", e?.response?.data || e.message);
      return { success: false };
    }
  },
  getSavedTalents: async (): Promise<
    { talent_id: string; full_name?: string; avatar_url?: string }[]
  > => {
    try {
      const res = await api.get("/employer/saved-talents");
      return res.data?.talents || [];
    } catch (e: any) {
      return [];
    }
  },
  // ✅ Employer: บล็อก Provider
  blockProvider: async (
    providerId: string,
    reason?: string,
  ): Promise<{ success: boolean }> => {
    try {
      const res = await api.post("/employer/blocked-providers", {
        provider_id: providerId,
        reason,
      });
      return { success: !!res.data?.success };
    } catch (e: any) {
      console.warn("blockProvider:", e?.response?.data || e.message);
      return { success: false };
    }
  },
  unblockProvider: async (
    providerId: string,
  ): Promise<{ success: boolean }> => {
    try {
      await api.delete(`/employer/blocked-providers/${providerId}`);
      return { success: true };
    } catch (e: any) {
      return { success: false };
    }
  },

  // ✅ Provider: availability, location pin, residential address
  setProviderAvailability: async (
    available: boolean,
  ): Promise<{ success: boolean; provider_available?: boolean }> => {
    try {
      const res = await api.patch("/provider/availability", { available });
      return {
        success: true,
        provider_available: res.data?.provider_available,
      };
    } catch (e: any) {
      return { success: false };
    }
  },
  pinProviderLocation: async (
    lat: number,
    lng: number,
    address?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.patch("/provider/location-pin", { lat, lng, address });
      return { success: true };
    } catch (e: unknown) {
      const ax = e as {
        response?: { status?: number; data?: { error?: string } };
        message?: string;
      };
      const msg =
        ax?.response?.data?.error ||
        (typeof ax?.message === "string" ? ax.message : undefined);
      console.warn("[pinProviderLocation]", ax?.response?.status, msg);
      return {
        success: false,
        error: typeof msg === "string" ? msg : undefined,
      };
    }
  },
  setResidentialAddress: async (
    address: string,
  ): Promise<{ success: boolean }> => {
    try {
      await api.patch("/provider/residential-address", {
        residential_address: address,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false };
    }
  },

  // ✅ Connection: UID:Key, coach-trainee
  getConnectionKey: async (): Promise<{
    connection_key: string;
    uid_key: string;
  }> => {
    const res = await api.get("/connection/key");
    return res.data;
  },
  coachAddTrainee: async (
    traineeKey: string,
  ): Promise<{ success: boolean; needs_trainee_confirm?: boolean }> => {
    const res = await api.post("/connection/coach-add", {
      trainee_key: traineeKey,
    });
    return res.data;
  },
  confirmConnection: async (
    connectionId: string,
    asTrainee: boolean,
  ): Promise<{ success: boolean }> => {
    const res = await api.post("/connection/confirm", {
      connection_id: connectionId,
      as_trainee: asTrainee,
    });
    return res.data;
  },
  getConnectionList: async (): Promise<{
    as_coach: any[];
    as_trainee: any[];
  }> => {
    const res = await api.get("/connection/list");
    return res.data;
  },

  async findSmartMatches(jobData: any): Promise<any[]> {
    try {
      console.log("Finding smart matches for:", jobData);

      // ถ้า backend ใช้ได้ ให้เรียก backend
      try {
        const response = await api.post("/jobs/match", jobData);
        return response.data;
      } catch (backendError) {
        console.warn("Backend matching failed, using Firebase");
      }

      // Fallback to Firebase (ใช้ v9 syntax)
      const q = query(
        collection(db, "users"),
        where("role", "==", "provider"),
        where("is_verified", "==", true),
      );

      const providersSnapshot = await getDocs(q);

      let providers = providersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Filter by category (เพราะไม่สามารถใช้ array-contains ใน where หลายๆ ตัว)
      providers = providers.filter(
        (p) =>
          p.categories?.includes(jobData.category) ||
          p.skills?.includes(jobData.category),
      );

      // Simple matching algorithm
      const matches = providers.map((provider) => {
        // คำนวณคะแนน
        let score = 0;

        // 1. Category match (40%)
        if (provider.categories?.includes(jobData.category)) {
          score += 40;
        }

        // 2. Location match (30%)
        if (provider.location && jobData.location) {
          const distance = this.calculateDistance(
            provider.location,
            jobData.location,
          );
          if (distance < 10) score += 30;
          else if (distance < 20) score += 20;
          else if (distance < 30) score += 10;
        }

        // 3. Rating match (20%)
        score += (provider.rating || 3) * 4;

        // 4. Price match (10%)
        const priceDiff = Math.abs((provider.hourly_rate || 0) - jobData.price);
        if (priceDiff < 100) score += 10;

        return {
          user: provider,
          score: Math.min(100, score),
          distance:
            provider.location && jobData.location
              ? this.calculateDistance(provider.location, jobData.location)
              : null,
        };
      });

      // เรียงลำดับคะแนน
      return matches.sort((a, b) => b.score - a.score).slice(0, 5);
    } catch (error) {
      console.error("Error in findSmartMatches:", error);
      return [];
    }
  },

  // Helper function
  calculateDistance(loc1: any, loc2: any): number {
    if (!loc1 || !loc2 || !loc1.lat || !loc1.lng || !loc2.lat || !loc2.lng) {
      return 999; // คืนค่าสูงถ้าไม่มี location
    }

    const R = 6371;
    const dLat = this.toRad(loc2.lat - loc1.lat);
    const dLon = this.toRad(loc2.lng - loc1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(loc1.lat)) *
        Math.cos(this.toRad(loc2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  },
  // ============================================
  // ✅ TRANSACTION SERVICES - ผสมผสาน
  // ============================================
  getTransactions: async (
    useFirebaseOnly?: boolean,
  ): Promise<Transaction[]> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) return [];

    try {
      // หลังเติม/ถอน ใช้ Firebase เท่านั้น เพื่อให้ประวัติอัปเดททันที (backend อาจยังไม่มีรายการใหม่)
      if (!useFirebaseOnly) {
        try {
          const response = await api.get(`/users/transactions/${userId}`);
          return response.data;
        } catch (backendError) {
          console.warn(
            "Backend transactions fetch failed, falling back to Firebase:",
            backendError,
          );
        }
      }

      const user = await MockApi.getProfile(userId);
      console.log(`🔍 Fetching transactions for: ${user.name} (${user.role})`);

      const q = query(
        collection(db, "transactions"),
        where("user_id", "==", userId),
      );
      const snap = await getDocs(q);
      let transactions = snap.docs.map((d) => mapDoc<Transaction>(d));

      console.log(`📊 Found ${transactions.length} raw transactions`);

      const uniqueTransactions = [];
      const seenKeys = new Set();

      for (const tx of transactions) {
        const key = `${tx.related_job_id || "no-job"}-${tx.type}-${tx.amount}-${
          tx.description
        }`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueTransactions.push(tx);
        } else {
          console.log(
            `🔄 Removing duplicate: ${tx.description} (${tx.amount})`,
          );
        }
      }

      console.log(
        `🔄 After deduplication: ${uniqueTransactions.length} transactions`,
      );

      const transactionsWithJob = uniqueTransactions.filter(
        (tx) => tx.related_job_id,
      );
      const transactionsWithoutJob = uniqueTransactions.filter(
        (tx) => !tx.related_job_id,
      );

      console.log(
        `📋 With job: ${transactionsWithJob.length}, Without job: ${transactionsWithoutJob.length}`,
      );

      const jobIds = [
        ...new Set(
          transactionsWithJob.map((tx) => tx.related_job_id!).filter(Boolean),
        ),
      ];

      console.log(`🔎 Need to check roles for ${jobIds.length} jobs`);

      const roleMap = await batchGetJobRoles(userId, jobIds);
      console.log(`✅ Role map size: ${roleMap.size}`);

      const filteredTransactionsWithJob = [];

      for (const tx of transactionsWithJob) {
        const roleInJob = roleMap.get(tx.related_job_id!);

        if (!roleInJob) {
          console.log(
            `🚫 Skipping: User not involved in job ${tx.related_job_id}`,
          );
          continue;
        }

        let shouldShow = false;

        if (roleInJob === "client") {
          shouldShow =
            tx.type === "payment" ||
            tx.type === "payment_out" ||
            tx.type === "tip";
        } else if (roleInJob === "provider") {
          shouldShow = tx.type === "income" || tx.type === "tip";
        }

        if (shouldShow) {
          const processedTx = { ...tx };

          if (
            (tx.type === "payment" || tx.type === "payment_out") &&
            tx.amount > 0
          ) {
            processedTx.amount = -Math.abs(tx.amount);
            console.log(
              `🔄 Fixed payment amount: ${tx.amount} → ${processedTx.amount}`,
            );
          }

          if (tx.type === "income" && tx.amount < 0) {
            processedTx.amount = Math.abs(tx.amount);
            console.log(
              `🔄 Fixed income amount: ${tx.amount} → ${processedTx.amount}`,
            );
          }

          filteredTransactionsWithJob.push(processedTx);
        }
      }

      const allFilteredTransactions = [
        ...filteredTransactionsWithJob,
        ...transactionsWithoutJob,
      ];

      allFilteredTransactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      console.log(
        `✅ Final result: ${allFilteredTransactions.length} transactions`,
      );

      if (allFilteredTransactions.length > 0) {
        console.log("📋 Sample filtered transactions:");
        allFilteredTransactions.slice(0, 5).forEach((tx, i) => {
          console.log(
            `  ${i + 1}. ${tx.description}: ${tx.amount > 0 ? "+" : ""}${
              tx.amount
            } (${tx.type}, ${tx.status})`,
          );
        });
      }

      return allFilteredTransactions;
    } catch (error) {
      console.error("❌ Error in getTransactions:", error);
      return [];
    }
  },

  // ============================================
  // 🔧 ADMIN: Update User Role (for fixing existing users)
  updateUserRole: async (userId: string, newRole: UserRole): Promise<void> => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        role: newRole,
        updated_at: new Date().toISOString(),
      });
      console.log(`✅ Updated user ${userId} to role: ${newRole}`);
    } catch (error) {
      console.error("Failed to update user role:", error);
      throw error;
    }
  },

  // ✅ PROVIDER SERVICES
  // ============================================
  getProvidersByIds: async (providerIds: string[]): Promise<any[]> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.post("/providers/batch", { providerIds });
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend providers fetch failed, falling back to mock:",
          backendError,
        );
      }

      // Fallback to mock data
      await new Promise((resolve) => setTimeout(resolve, 500));

      const mockProviders = providerIds.map((id, index) => ({
        id,
        name: `Provider ${String.fromCharCode(65 + index)}`,
        rating: 4.5 + Math.random() * 0.5,
        completedJobs: Math.floor(Math.random() * 100) + 1,
        status: ["available", "on_job", "offline"][
          Math.floor(Math.random() * 3)
        ],
        location: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya"][
          Math.floor(Math.random() * 4)
        ],
        phone: `+66 ${800 + index}${100 + index}${200 + index}`,
        email: `provider${index}@example.com`,
        avatarUrl: `https://randomuser.me/api/portraits/men/${index + 10}.jpg`,
        skills: [
          ["Cleaning", "Delivery", "Repair"][index % 3],
          ["Consulting", "Maintenance", "Installation"][(index + 1) % 3],
        ],
        hourlyRate: Math.floor(Math.random() * 500) + 300,
        joinedDate: new Date(
          Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000,
        ),
        totalEarnings: Math.floor(Math.random() * 50000) + 10000,
        responseRate: Math.floor(Math.random() * 20) + 80,
        lastActive: new Date(
          Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
        ),
      }));

      return mockProviders;
    } catch (error) {
      console.error("Error getting providers by IDs:", error);
      return [];
    }
  },

  getAllProviders: async (): Promise<any[]> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get("/providers");
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend all providers fetch failed, falling back to mock:",
          backendError,
        );
      }

      // Fallback to mock data
      await new Promise((resolve) => setTimeout(resolve, 800));

      const providers = [];
      for (let i = 1; i <= 20; i++) {
        providers.push({
          id: `provider_${i}`,
          name: `Provider ${String.fromCharCode(64 + i)}`,
          rating: 4.0 + Math.random() * 1.0,
          completedJobs: Math.floor(Math.random() * 150) + 1,
          status:
            i % 5 === 0 ? "on_job" : i % 3 === 0 ? "offline" : "available",
          location: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Hua Hin"][
            i % 5
          ],
          phone: `+66 ${800 + i}${100 + i}${200 + i}`,
          email: `provider${i}@example.com`,
          avatarUrl: `https://randomuser.me/api/portraits/${
            i % 2 === 0 ? "women" : "men"
          }/${i}.jpg`,
          skills: getRandomSkills(),
          hourlyRate: Math.floor(Math.random() * 600) + 200,
          joinedDate: new Date(
            Date.now() - Math.random() * 730 * 24 * 60 * 60 * 1000,
          ),
          verificationStatus:
            i % 4 === 0 ? "verified" : i % 3 === 0 ? "pending" : "basic",
        });
      }

      return providers;
    } catch (error) {
      console.error("Error getting all providers:", error);
      return [];
    }
  },

  // ============================================
  // ✅ PAYMENT RELEASE SERVICES
  // ============================================
  releasePendingPayment: async (jobId: string): Promise<boolean> => {
    try {
      // ใช้ Backend service
      const response = await BackendPaymentService.releasePayment(jobId);

      // อัพเดท local state
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      const job = mapDoc<Job>(jobSnap);

      const providerId = job.accepted_by;
      if (providerId) {
        const providerRef = doc(db, "users", providerId);
        const providerSnap = await getDoc(providerRef);
        const provider = mapDoc<UserProfile>(providerSnap);

        const paymentDetails = job.payment_details;
        const providerReceive = paymentDetails?.provider_receive || job.price;

        const newPending = Math.max(
          0,
          (provider.wallet_pending || 0) - providerReceive,
        );
        const newBalance = (provider.wallet_balance || 0) + providerReceive;

        await updateDoc(providerRef, {
          wallet_pending: newPending,
          wallet_balance: newBalance,
          pending_release_at: null,
        });

        await updateDoc(jobRef, {
          "payment_details.released_status": "released",
          "payment_details.released_at": new Date().toISOString(),
        });

        // ส่ง notification
        await MockApi.sendNotification({
          user_id: providerId,
          title: "💰 เงินพร้อมถอนแล้ว!",
          message: `ยอดเงิน ${providerReceive} บาท จากงาน "${job.title}" พร้อมถอนแล้ว`,
          type: "payment",
          related_id: jobId,
        });
      }

      return true;
    } catch (error) {
      console.error("Error releasing payment:", error);
      return false;
    }
  },

  // ============================================
  // ✅ HELPER & UTILITY SERVICES
  // ============================================
  uploadImage: async (file: File, tag?: string): Promise<string> => {
    console.log(
      `Uploading image: ${tag || "untagged"} (${file.name}) → AWS S3 via Backend`,
    );

    const forKyc = tag?.toLowerCase().startsWith("kyc") === true;
    const isChatTag = tag?.toLowerCase() === "chat";

    if (!forKyc && !isChatTag) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { data } = await api.post<{ url?: string; secure_url?: string }>(
          "/upload/profile-image",
          formData,
        );
        const multipartUrl = data.url || data.secure_url || "";
        if (multipartUrl) return multipartUrl;
      } catch (e: any) {
        const status = e?.response?.status;
        const allowFallback =
          status == null || status === 404 || status === 405 || status >= 500;
        if (!allowFallback) throw e;
        console.warn(
          "[uploadImage] multipart /upload/profile-image unavailable; using JSON fallback:",
          e?.message,
        );
      }
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

    try {
      const body: Record<string, unknown> = {
        file: base64,
        forKyc,
      };
      if (isChatTag) body.tag = "chat";
      const { data } = await api.post<{ url?: string; secure_url?: string }>(
        "/upload/image",
        body,
        { timeout: HTTP_TIMEOUT_MULTIPART_DEFAULT_MS },
      );
      return data.url || data.secure_url || "";
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const msg = e?.response?.data?.error;
      const detail =
        typeof msg === "string" && msg.trim()
          ? msg
          : e?.message || "อัปโหลดรูปไม่สำเร็จ";
      const err = new Error(detail) as Error & { code?: string };
      if (typeof code === "string") err.code = code;
      throw err;
    }
  },

  uploadVideo: async (file: File, tag?: string): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (tag) formData.append("tag", tag);

      const response = await api.post("/upload/video", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      return response.data.url;
    } catch (error) {
      console.error("Video upload error:", error);
      throw error;
    }
  },

  // ... (เหลือฟังก์ชันอื่นๆ ที่ไม่เปลี่ยนแปลง) ...

  getNotifications: async (): Promise<UserNotification[]> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) return [];

    // ✅ ตรวจสอบ Cache ก่อน (30 วินาที)
    const cacheKey = `notifications:${userId}`;
    const cached = getCached<UserNotification[]>(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, "notifications"),
        where("user_id", "==", userId),
      );
      const snap = await getDocs(q);
      const notifs = snap.docs.map((d) => mapDoc<UserNotification>(d));
      const sorted = notifs.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setCache(cacheKey, sorted); // ✅ เก็บ cache
      return sorted;
    } catch (e) {
      return [];
    }
  },

  markNotificationRead: async (id: string): Promise<void> => {
    // ✅ ล้าง cache เมื่ออ่านแล้ว
    const userId = localStorage.getItem("meerak_user_id");
    if (userId) clearCache(`notifications:${userId}`);

    try {
      await updateDoc(doc(db, "notifications", id), { is_read: true });
    } catch (e) {
      console.warn(e);
    }
  },

  sendNotification: async (notif: Partial<UserNotification>): Promise<void> => {
    await addDoc(collection(db, "notifications"), {
      ...notif,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  },

  // ============================================
  // ✅ EXISTING FUNCTIONS (ไม่เปลี่ยนแปลง)
  // ============================================
  enrollTraining: async (courseId: string): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    const user = await MockApi.getProfile(userId);
    const course = MOCK_COURSES.find((c) => c.id === courseId);
    if (!course) throw new Error("Course not found");

    const newTraining: TrainingModule = {
      ...course,
      status: TrainingStatus.IN_PROGRESS,
    };
    const updatedTrainings = [...(user.trainings || []), newTraining];

    return await MockApi.updateProfile({ trainings: updatedTrainings });
  },

  completeTraining: async (
    courseId: string,
    score: number = 100,
  ): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    const user = await MockApi.getProfile(userId);
    const course = MOCK_COURSES.find((c) => c.id === courseId);
    if (!course) throw new Error("Course not found");

    let updatedTrainings = user.trainings || [];
    const trainingIndex = updatedTrainings.findIndex((t) => t.id === courseId);

    const completedTraining = { ...course, status: TrainingStatus.COMPLETED };

    if (trainingIndex >= 0) {
      updatedTrainings[trainingIndex] = completedTraining;
    } else {
      updatedTrainings.push(completedTraining);
    }

    const currentSkills = user.skills || [];
    let updatedSkills = [...currentSkills];
    if (!updatedSkills.includes(course.category)) {
      updatedSkills.push(course.category);
    }

    let newRole = user.role;
    if (newRole === UserRole.USER) {
      newRole = UserRole.PROVIDER;
    }

    return await MockApi.updateProfile({
      trainings: updatedTrainings,
      skills: updatedSkills,
      role: newRole,
    });
  },

  updateAvatar: async (file: File): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    if (
      file.name.toLowerCase().includes("cartoon") ||
      file.name.toLowerCase().includes("anime")
    ) {
      throw new Error(
        "AI Detection: Profile picture must be a real human face. Cartoons are not allowed.",
      );
    }
    const avatarUrl = await MockApi.uploadImage(file);
    if (
      !avatarUrl ||
      typeof avatarUrl !== "string" ||
      avatarUrl.trim() === ""
    ) {
      throw new Error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }

    // ล้าง cache เพื่อให้ getProfile โหลดข้อมูลใหม่
    apiCache.delete(`profile:${userId}`);

    // 1. ลอง Backend ก่อน (ผู้ใช้ส่วนใหญ่อยู่ใน PostgreSQL)
    try {
      const res = await api.patch<{ success?: boolean; user?: UserProfile }>(
        `/users/profile/${userId}`,
        {
          avatar_url: avatarUrl,
        },
      );
      const backendUser = res.data?.user;
      if (backendUser && typeof backendUser === "object") {
        const merged: UserProfile = {
          ...backendUser,
          avatar_url: avatarUrl,
          id: backendUser.id || userId,
          name: backendUser.name ?? (backendUser as any).full_name,
        };
        setCache(`profile:${userId}`, merged);
        return merged;
      }
    } catch (backendErr: any) {
      const status = backendErr?.response?.status;
      // 404/403 = user ไม่มีใน backend → ใช้ Firestore
      if (status !== 404 && status !== 403) {
        console.warn(
          "[updateAvatar] Backend PATCH failed:",
          backendErr?.message,
        );
      }
    }

    // 2. Fallback: Firestore (สำหรับ user ที่ยังไม่มีใน Backend)
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { avatar_url: avatarUrl });
      const updatedSnap = await getDoc(userRef);
      const mapped = mapDoc<UserProfile>(updatedSnap);
      setCache(`profile:${userId}`, mapped);
      return mapped;
    } catch (firestoreErr: any) {
      // ถ้า Firestore ก็ล้มเหลว ให้ return profile ที่มีแค่ avatar_url อัปเดต (จาก upload ที่สำเร็จแล้ว)
      console.warn(
        "[updateAvatar] Firestore update failed:",
        firestoreErr?.message,
      );
      const current = await MockApi.getProfile(userId, { refresh: true }).catch(
        () => null,
      );
      if (current) {
        const fallback: UserProfile = { ...current, avatar_url: avatarUrl };
        setCache(`profile:${userId}`, fallback);
        return fallback;
      }
      throw new Error("ไม่สามารถอัปเดตรูปโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง");
    }
  },

  validateVoucher: async (code: string): Promise<Voucher> => {
    try {
      const q = query(collection(db, "vouchers"), where("code", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Invalid Voucher Code");
      return snap.docs[0].data() as Voucher;
    } catch (e) {
      throw e;
    }
  },

  sendMessage: async (
    jobId: string,
    text?: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<void | {
    antiBypassWarn?: { reasons: string[]; matchedMasked: string[] };
  }> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");
    const msg: any = {
      sender_id: userId,
      type,
      text: text || "",
      media_url: type === MessageType.IMAGE ? text : undefined,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const sendViaFirestore = async () => {
      try {
        await addDoc(collection(db, "chats", jobId, "messages"), sanitize(msg));
      } catch (e) {
        return handleFirestoreError(e, "sendMessage");
      }
    };

    if (isAntiBypassJobChatProxyOn()) {
      try {
        const body: Record<string, unknown> = {
          type: msg.type,
          text: msg.text || "",
        };
        if (type === MessageType.IMAGE && text) body.media_url = text;
        const { data } = await api.post<{
          success?: boolean;
          message_id?: string;
          anti_bypass_warn?: {
            reasons?: string[];
            matchedMasked?: string[];
          };
        }>(`/jobs/${encodeURIComponent(jobId)}/chat/messages`, body);

        const w = data?.anti_bypass_warn;
        if (
          w &&
          ((w.reasons && w.reasons.length) ||
            (w.matchedMasked && w.matchedMasked.length))
        ) {
          return {
            antiBypassWarn: {
              reasons: w.reasons || [],
              matchedMasked: w.matchedMasked || [],
            },
          };
        }
        return;
      } catch (e: any) {
        const status = e?.response?.status;
        const code = e?.response?.data?.code;
        if (status === 403 && code === "ANTI_BYPASS_BLOCKED") {
          throw new Error(
            e?.response?.data?.error || "ข้อความไม่ผ่านการตรวจสอบความปลอดภัย",
          );
        }
        if (status === 401) throw e;
        console.warn(
          "[sendMessage] job chat proxy failed, using Firestore:",
          e?.message,
        );
      }
    }

    await sendViaFirestore();
  },

  // ... (ฟังก์ชันอื่นๆ ที่เหลือ) ...

  getEarningsStats: async (): Promise<any> => {
    // Use mock data so Profile works without backend (avoids ERR_CONNECTION_REFUSED).
    // Backend /reports/financial-summary can be wired later when report API is ready.
    return {
      weekly: 15000,
      monthly: 60000,
      yearly: 720000,
      chartData: [
        { name: "Jan", amount: 40000 },
        { name: "Feb", amount: 30000 },
        { name: "Mar", amount: 50000 },
        { name: "Apr", amount: 45000 },
        { name: "May", amount: 60000 },
        { name: "Jun", amount: 55000 },
      ],
    };
  },

  // ... (ฟังก์ชันอื่นๆ ที่เหลือ) ...
  // ============================================
  // ✅ SIMPLIFIED CHECK AND RELEASE PAYMENTS
  // ============================================
  checkAndReleasePayments: async (): Promise<void> => {
    try {
      try {
        const response = await api.get("/payments/pending");
        if (response.data?.pending_payments?.length > 0) {
          return;
        }
      } catch (_) {}

      if (!db) return;
      const jobsQuery = query(
        collection(db, "jobs"),
        where("status", "==", JobStatus.COMPLETED),
      );
      const jobsSnap = await getDocs(jobsQuery);
      let pendingCount = 0;
      for (const docSnap of jobsSnap.docs) {
        const job = mapDoc<Job>(docSnap);
        if (job.payment_details?.released_status === "pending") pendingCount++;
      }
      if (pendingCount > 0) {
        console.log(`📊 Pending payments to release: ${pendingCount}`);
      }
    } catch (error) {
      console.error("❌ Error checking pending payments:", error);
    }
  },
  // เพิ่มก่อนปิดของ MockApi object
  getProviders: async (category?: string): Promise<any[]> => {
    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";
    // Demo Talent (Apple Review) — แสดงใน Talents เสมอ สำหรับ App Store Review
    const demoTalentAppleReview = {
      id: "apple-demo-talent",
      name: "Demo Professional",
      rating: 4.9,
      completed_jobs_count: 42,
      completedJobs: 42,
      status: "available",
      location: "Bangkok",
      phone: "0812345602",
      email: "tester.talent@aqond.com",
      /* No stock photo — UI shows editorial gradient placeholder (avoids random pravatar faces). */
      avatar_url: "",
      avatarUrl: "",
      portfolio_urls: [] as string[],
      skills: ["Party_Guest", "Dating", "Sommelier", "เพื่อนเที่ยว"],
      signature_service:
        "ตัวอย่างโปรไฟล์สำหรับทดสอบแอป — ดินเนอร์หรู/คุยธุรกิจ • Sommelier",
      expert_category: "party_guest",
      gender: "female",
      verified_badge: "Verified",
    };
    const mockTalents = [
      demoTalentAppleReview,
      {
        id: "talent-balcony",
        name: "Mia",
        rating: 4.9,
        completed_jobs_count: 62,
        completedJobs: 62,
        status: "available",
        location: "Bangkok",
        phone: "0812345001",
        email: "mia@example.com",
        avatar_url: `${baseUrl}/talents/talent-balcony.png`,
        avatarUrl: `${baseUrl}/talents/talent-balcony.png`,
        portfolio_urls: [`${baseUrl}/talents/talent-balcony.png`],
        skills: ["Party_Guest", "Dating", "Sommelier", "เพื่อนเที่ยว"],
        signature_service: "ดินเนอร์หรู/คุยธุรกิจ • Sommelier",
        expert_category: "party_guest",
        gender: "female",
        verified_badge: "Sommelier",
      },
      {
        id: "talent-boat",
        name: "Luna",
        rating: 4.8,
        completed_jobs_count: 48,
        completedJobs: 48,
        status: "available",
        location: "Phuket",
        phone: "0812345002",
        email: "luna@example.com",
        avatar_url: `${baseUrl}/talents/talent-boat.png`,
        avatarUrl: `${baseUrl}/talents/talent-boat.png`,
        portfolio_urls: [`${baseUrl}/talents/talent-boat.png`],
        skills: ["Party_Guest", "Dating", "เพื่อนเที่ยว"],
        signature_service: "เพื่อนเที่ยว • ชอบทะเล",
        expert_category: "party_guest",
        gender: "female",
        verified_badge: "Verified",
      },
      {
        id: "talent-sea",
        name: "Nina",
        rating: 4.7,
        completed_jobs_count: 35,
        completedJobs: 35,
        status: "available",
        location: "Chonburi",
        phone: "0812345003",
        email: "nina@example.com",
        avatar_url: `${baseUrl}/talents/talent-sea.png`,
        avatarUrl: `${baseUrl}/talents/talent-sea.png`,
        portfolio_urls: [`${baseUrl}/talents/talent-sea.png`],
        skills: ["Party_Guest", "Dating", "เพื่อนเที่ยว"],
        signature_service: "เพื่อนเที่ยว • ชิลล์ชายหาด",
        expert_category: "party_guest",
        gender: "female",
        verified_badge: "Verified",
      },
      {
        id: "talent-nong-kaning",
        name: "น้อง คะนิ้ง",
        rating: 4.9,
        completed_jobs_count: 89,
        completedJobs: 89,
        status: "available",
        location: "Bangkok",
        phone: "0812345004",
        email: "kaning@example.com",
        avatar_url: `${baseUrl}/talents/talent-nong-kaning.png`,
        avatarUrl: `${baseUrl}/talents/talent-nong-kaning.png`,
        portfolio_urls: [`${baseUrl}/talents/talent-nong-kaning.png`],
        skills: ["Party_Guest", "Dating", "Sommelier", "เพื่อนเที่ยว"],
        signature_service: "เอนดี คุยสนุก ตามใจลูกค้า • Sommelier",
        expert_category: "party_guest",
        gender: "female",
        verified_badge: "Sommelier",
        bio: "ตัวเล็ก H:155 W:45 • สัดส่วน 36-25-35 • มีรอยสักที่แขน",
      },
      {
        id: "talent-pray",
        name: "Pray",
        rating: 4.9,
        completed_jobs_count: 72,
        completedJobs: 72,
        status: "available",
        location: "Bangkok",
        phone: "0812345005",
        email: "pray@example.com",
        avatar_url: `${baseUrl}/talents/talent-pray.png`,
        avatarUrl: `${baseUrl}/talents/talent-pray.png`,
        portfolio_urls: [`${baseUrl}/talents/talent-pray.png`],
        skills: ["Party_Guest", "Dating", "เพื่อนเที่ยว"],
        signature_service: "เพื่อนเที่ยว • สไตล์ชิลล์",
        expert_category: "party_guest",
        gender: "female",
        verified_badge: "Verified",
        bio: "H:158 W:48 • สัดส่วน 34-26-35 • ไม่มีรอยสัก",
      },
      {
        id: "talent-mirror",
        name: "Jade",
        rating: 4.8,
        completed_jobs_count: 55,
        completedJobs: 55,
        status: "available",
        location: "Bangkok",
        phone: "0812345006",
        email: "jade@example.com",
        avatar_url: `${baseUrl}/talents/talent-mirror.png`,
        avatarUrl: `${baseUrl}/talents/talent-mirror.png`,
        portfolio_urls: [`${baseUrl}/talents/talent-mirror.png`],
        skills: ["Party_Guest", "Dating", "เพื่อนเที่ยว"],
        signature_service: "เพื่อนเที่ยว • คุยสนุก",
        expert_category: "party_guest",
        gender: "female",
        verified_badge: "Verified",
      },
    ];
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get("/providers", {
          params: category ? { category } : {},
          headers: {
            "x-session-id": adsService.getSessionId(),
          },
        });
        const data = Array.isArray(response.data) ? response.data : [];
        // ถ้า backend คืนว่าง ให้ใช้ mock talents เพื่อให้มีคนแสดงเสมอ
        if (data.length === 0) return mockTalents;
        // รวม mock talents เข้าไปด้วย (ถ้ายังไม่มี) เพื่อให้เห็น mock เสมอ
        const existingIds = new Set(data.map((p: any) => String(p.id)));
        const toAdd = mockTalents.filter((m) => !existingIds.has(m.id));
        return [...data, ...toAdd];
      } catch (backendError) {
        console.warn(
          "Backend providers fetch failed, falling back to mock:",
          backendError,
        );
      }

      // Fallback: ใช้ mock เมื่อ API ล้มเหลว
      return [
        ...mockTalents,
        {
          id: "provider1",
          name: "Provider User",
          rating: 4.8,
          completedJobs: 45,
          completed_jobs_count: 45,
          status: "available",
          location: "Bangkok",
          phone: "0800000003",
          email: "provider@example.com",
          avatar_url: "https://i.pravatar.cc/150?u=provider",
          avatarUrl: "https://i.pravatar.cc/150?u=provider",
          skills: ["Electrician", "Repair", "Cleaning"],
          hourlyRate: 500,
          joinedDate: new Date("2023-01-15"),
          verificationStatus: "verified",
        },
        {
          id: "provider2",
          name: "Another Provider",
          rating: 4.5,
          completedJobs: 32,
          completed_jobs_count: 32,
          status: "on_job",
          location: "Bangkok",
          phone: "0800000004",
          email: "provider2@example.com",
          avatar_url: "https://i.pravatar.cc/150?u=provider2",
          avatarUrl: "https://i.pravatar.cc/150?u=provider2",
          skills: ["Cleaning", "Delivery"],
          hourlyRate: 400,
          joinedDate: new Date("2023-03-20"),
          verificationStatus: "verified",
        },
      ];
    } catch (error) {
      console.error("Error getting providers:", error);
      return [];
    }
  },

  getNearbyProviders: async (
    limit = 8,
    opts?: { category?: string; lat?: number; lng?: number },
  ): Promise<
    Array<{
      id: string;
      name: string;
      avatarUrl?: string;
      rating: number;
      distance: string;
      distanceKm?: number | null;
    }>
  > => {
    const lat = opts?.lat;
    const lng = opts?.lng;
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      try {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        if (opts?.category) params.set("category", opts.category);
        const { data } = await api.get(
          `/providers/nearby?${params.toString()}`,
        );
        if (Array.isArray(data) && data.length > 0) {
          return data.map((p: any) => ({
            id: p.id,
            name: p.name || "Provider",
            avatarUrl: p.avatarUrl || p.avatar_url,
            rating:
              typeof p.rating === "number"
                ? p.rating
                : parseFloat(p.rating) || 4.5,
            distance: p.distanceLabel || p.distance || "—",
            distanceKm: p.distanceKm ?? null,
          }));
        }
      } catch (e) {
        console.warn("getNearbyProviders /providers/nearby failed:", e);
      }
    }
    try {
      const providers = await MockApi.getProviders(opts?.category);
      const withDistance = providers.slice(0, limit).map((p, i) => ({
        id: p.id,
        name: p.name || "Provider",
        avatarUrl: p.avatarUrl || p.avatar_url,
        rating: p.rating ?? 4.5,
        distance:
          ["250m", "500m", "800m", "1.2km", "1.5km", "2km", "2.5km", "3km"][
            i
          ] || "Nearby",
        distanceKm: null as number | null,
      }));
      return withDistance;
    } catch {
      return [
        {
          id: "p1",
          name: "Provider User",
          avatarUrl: "https://i.pravatar.cc/150?u=provider",
          rating: 4.8,
          distance: "500m",
          distanceKm: null,
        },
        {
          id: "p2",
          name: "Another Provider",
          avatarUrl: "https://i.pravatar.cc/150?u=provider2",
          rating: 4.5,
          distance: "1.2km",
          distanceKm: null,
        },
      ];
    }
  },

  /** Server-side quick match for /party-vibe — uses GPS + vibe */
  partyVibeQuickMatch: async (body: {
    lat: number;
    lng: number;
    vibeId: string;
  }): Promise<{
    top: Array<{
      id: string;
      name: string;
      avatarUrl?: string;
      rating: number;
      matchPct: number;
      distanceLabel: string;
      distanceKm: number | null;
    }>;
    best: { id: string; name: string; matchPct: number } | null;
  }> => {
    try {
      const { data } = await api.post("/party-vibe/quick-match", body);
      const top = (data?.top || []).map((p: any) => ({
        id: p.id,
        name: p.name || "Talent",
        avatarUrl: p.avatarUrl || p.avatar_url,
        rating:
          typeof p.rating === "number" ? p.rating : parseFloat(p.rating) || 4.5,
        matchPct: p.matchPct ?? 88,
        distanceLabel: p.distanceLabel || "—",
        distanceKm: p.distanceKm ?? null,
      }));
      return {
        top,
        best: data?.best || top[0] || null,
      };
    } catch (e) {
      console.warn("partyVibeQuickMatch failed:", e);
      return { top: [], best: null };
    }
  },

  // ============================================
  // Power to the User: Role Switcher & Peace Mode
  // ============================================
  getModeStatus: async (): Promise<{
    role: string;
    is_peace_mode: boolean;
    peace_mode_until: string | null;
    ban_expires_at: string | null;
    is_banned: boolean;
    provider_available: boolean;
  }> => {
    const response = await api.get("/users/me/mode-status");
    return response.data;
  },
  setAppMode: async (
    role: "user" | "provider" | "employer",
  ): Promise<{ success: boolean; role: string }> => {
    const response = await api.patch("/users/me/app-mode", { role });
    return response.data;
  },
  setPeaceMode: async (
    enabled: boolean,
    hoursUntilReset?: number,
  ): Promise<{
    success: boolean;
    is_peace_mode: boolean;
    peace_mode_until: string | null;
  }> => {
    const response = await api.patch("/users/me/peace-mode", {
      enabled,
      hours_until_reset: hoursUntilReset,
    });
    return response.data;
  },

  // ============================================
  // ✅ NEW: INTEGRATED FUNCTIONALITIES
  // ============================================

  // สร้าง voucher ใหม่ (ใช้ Backend)
  createVoucher: async (voucherData: any): Promise<any> => {
    try {
      const response = await api.post("/vouchers", voucherData);
      return response.data;
    } catch (error) {
      console.error("Voucher creation error:", error);
      throw error;
    }
  },

  // ดึงข้อมูลระบบการเงินทั้งหมด (mock when backend unavailable)
  getFinancialDashboard: async (): Promise<any> => {
    try {
      const [summary, earnings, disputes] = await Promise.all([
        BackendReportService.getFinancialSummary().catch(() => ({
          weekly: 15000,
          monthly: 60000,
          yearly: 720000,
        })),
        BackendReportService.getEarningsReport("monthly").catch(() => []),
        BackendReportService.getDisputeReports("pending").catch(() => []),
      ]);

      return {
        summary,
        earnings,
        pendingDisputes: disputes,
      };
    } catch (error) {
      console.error("Financial dashboard error:", error);
      throw error;
    }
  },

  // ดึงประวัติการชำระเงินทั้งหมด (ใช้ Backend)
  getPaymentHistory: async (filters?: any): Promise<any[]> => {
    try {
      const response = await api.get("/payments/history", { params: filters });
      return response.data;
    } catch (error) {
      console.error("Payment history error:", error);
      return [];
    }
  },

  // สร้าง dispute (ใช้ Backend)
  createDispute: async (disputeData: any): Promise<any> => {
    try {
      const response = await api.post("/disputes", disputeData);
      return response.data;
    } catch (error) {
      console.error("Dispute creation error:", error);
      throw error;
    }
  },

  // ดึงข้อมูล audit logs (ใช้ Backend)
  getAuditLogs: async (filters?: any): Promise<any[]> => {
    try {
      const response = await api.get("/audit/logs", { params: filters });
      return response.data;
    } catch (error) {
      console.error("Audit logs error:", error);
      return [];
    }
  },
  subscribeToRecommendedJobs: (
    callback: (jobs: Job[]) => void,
  ): Unsubscribe => {
    console.log("🔔 Subscribing to recommended jobs (backend + poll)");

    // โหลดทันที + refresh ทุก 1 นาที — ป้อนงานให้ provider ภายใน 5 นาที–1 ชม. skill match ขึ้นก่อน
    const refresh = () =>
      MockApi.getRecommendedJobs().then(callback).catch(console.error);
    refresh();
    const pollInterval = setInterval(refresh, 60 * 1000);

    // Return unsubscribe function
    return () => {
      console.log("🔕 Unsubscribing from recommended jobs");
      clearInterval(pollInterval);
    };
  },

  // 🔔 Real-time subscription สำหรับงานทั้งหมดของ User
  subscribeToMyJobs: (
    userId: string,
    callback: (jobs: Job[]) => void,
  ): Unsubscribe => {
    console.log("🔔 Subscribing to my jobs (Real-time):", userId);

    // Query งานทั้งหมดที่เกี่ยวข้องกับ user
    const q = query(collection(db, "jobs"), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          let jobs = snapshot.docs.map((d) => mapDoc<Job>(d));

          // กรองเฉพาะงานที่เกี่ยวข้องกับ user (created_by หรือ accepted_by)
          // ใช้ String + trim เพื่อให้ match ได้ทั้ง UUID และ format อื่น (Firebase fallback job)
          const uid = String(userId || "")
            .trim()
            .toLowerCase();
          jobs = jobs.filter((j) => {
            const cb = String(j.created_by ?? "")
              .trim()
              .toLowerCase();
            const ab = String(j.accepted_by ?? "")
              .trim()
              .toLowerCase();
            return (cb && cb === uid) || (ab && ab === uid);
          });

          // เรียงตามวันที่ล่าสุด
          jobs.sort(
            (a, b) =>
              new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
          );

          console.log(
            `📬 My jobs updated: ${jobs.length} jobs (created or accepted by me)`,
          );
          callback(jobs);
        } catch (error) {
          console.error("Error processing my jobs:", error);
        }
      },
      (error) => {
        console.error("Firestore subscription error:", error);
      },
    );

    return () => {
      console.log("🔕 Unsubscribing from my jobs");
      unsubscribe();
    };
  },

  // เพิ่มใน MockApi object (ใน mockApi.ts)
  startPaymentReleaseScheduler: (): NodeJS.Timeout | null => {
    // ตรวจสอบว่าอยู่ใน browser environment
    if (typeof window === "undefined") {
      console.warn("Payment scheduler only runs in browser");
      return null;
    }

    console.log("🚀 Starting payment release scheduler (every 5 minutes)");

    // เรียกครั้งแรกทันที
    MockApi.checkAndReleasePayments();

    // ตั้ง interval ทุก 5 นาที
    const intervalId = setInterval(
      () => {
        MockApi.checkAndReleasePayments();
      },
      5 * 60 * 1000,
    ); // 5 minutes

    // เก็บ intervalId ใน localStorage เพื่อจะได้หยุดได้
    localStorage.setItem("payment_scheduler_interval", String(intervalId));

    return intervalId;
  },

  stopPaymentReleaseScheduler: (
    intervalId: NodeJS.Timeout | number | null,
  ): void => {
    if (intervalId) {
      clearInterval(intervalId);
      console.log("⏹️ Payment release scheduler stopped");
      localStorage.removeItem("payment_scheduler_interval");
    }
  },

  // สร้างฟังก์ชัน stopPaymentReleaseScheduler โดยใช้ intervalId จาก localStorage
  stopExistingScheduler: (): void => {
    const storedInterval = localStorage.getItem("payment_scheduler_interval");
    if (storedInterval) {
      const intervalId = Number(storedInterval);
      clearInterval(intervalId);
      console.log("⏹️ Stopped existing payment scheduler");
      localStorage.removeItem("payment_scheduler_interval");
    }
  },

  // ============================================
  // ✅ NOTIFICATIONS (Admin broadcast + User-targeted เช่น ได้รับทิป)
  // ส่ง userId เมื่อ login เพื่อให้ได้ทั้ง broadcast และ notification เฉพาะ user
  // ============================================
  getLatestAdminNotifications: async (
    limit = 5,
    userId?: string,
  ): Promise<
    {
      id: string;
      title: string;
      message: string;
      target?: string;
      sentAt: string;
      source?: string;
      notificationType?: string;
      jobId?: string | null;
      data?: Record<string, unknown> | null;
    }[]
  > => {
    /** ใช้ `api` instance เดียวกับส่วนอื่น — baseURL = .../api, มี Authorization, ไม่ hardcode localhost */
    try {
      const params: Record<string, number | string> = { limit };
      if (userId) params.userId = userId;
      const res = await api.get("/notifications/latest", {
        params,
        timeout: 6000,
      });
      return res.data?.notifications ?? [];
    } catch (e: any) {
      if (e?.response?.status === 404 || e?.response?.status === 401) return [];
      throw e;
    }
  },

  // ============================================
  // ✅ HEALTH CHECK
  // ============================================
  checkBackendHealth: async (): Promise<boolean> => {
    try {
      const response = await api.get("/health", { timeout: 3000 });
      return response.status === 200;
    } catch (error) {
      console.warn("Backend health check failed:", error);
      return false;
    }
  },

  // ฟังก์ชันสำหรับ fallback mode
  isBackendAvailable: async (): Promise<boolean> => {
    const isAvailable = await MockApi.checkBackendHealth();
    if (!isAvailable) {
      console.warn("Backend is unavailable, using Firebase fallback");
    }
    return isAvailable;
  },
  // ใน MockApi object ให้เพิ่มฟังก์ชันเหล่านี้:

  // ============================================
  // ✅ ADD MISSING FUNCTIONS THAT ARE BEING CALLED
  // ============================================

  // 1. getActiveBanners - สำหรับ Home.tsx
  getActiveBanners: async (): Promise<SystemBanner[]> => {
    try {
      const q = query(collection(db, "banners"), where("active", "==", true));
      const snap = await getDocs(q);
      const banners = snap.docs.map(
        (d) =>
          ({
            ...d.data(),
            id: d.id,
          }) as SystemBanner,
      );

      // ถ้าไม่มี banners ใน database ให้ return mock data
      if (banners.length === 0) {
        return [
          {
            id: "banner-1",
            title: "Welcome to Meerak",
            description: "Find trusted service providers near you",
            image_url:
              "https://images.unsplash.com/photo-1581094794329-c8112a89af12",
            button_text: "Get Started",
            button_link: "/jobs",
            active: true,
            priority: 1,
          },
          {
            id: "banner-2",
            title: "Earn Extra Income",
            description: "Become a provider and start earning today",
            image_url:
              "https://images.unsplash.com/photo-1551434678-e076c223a692",
            button_text: "Join Now",
            button_link: "/register?role=provider",
            active: true,
            priority: 2,
          },
        ];
      }

      return banners;
    } catch (e) {
      console.warn("Failed to fetch banners:", e);
      return [];
    }
  },

  // 2. getRecommendedJobs - สำหรับ My Jobs > Recommended (ใช้ backend เดียวกับที่ Bob โพสต์)
  getRecommendedJobs: async (): Promise<Job[]> => {
    const userId = localStorage.getItem("meerak_user_id");

    // ✅ ถ้าไม่มี userId ให้คืนค่าว่างทันที (ป้องกัน Infinite Loop)
    if (!userId) {
      console.warn(
        "[getRecommendedJobs] No userId found, returning empty array",
      );
      return [];
    }

    const normalize = (j: any): Job => ({
      ...j,
      id: j.id != null ? String(j.id) : j.id,
      location:
        typeof j.location === "object" && j.location
          ? j.location
          : { lat: 13.736717, lng: 100.523186 },
      datetime: j.datetime || j.created_at,
      status: j.status || "open",
    });

    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const prof = await MockApi.getProfile(userId, { refresh: false });
        const loc = prof?.location as
          | { lat?: number; lng?: number }
          | undefined;
        if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
          lat = loc.lat;
          lng = loc.lng;
        }
      } catch {
        /* ignore */
      }
      const response = await api.get("/jobs/recommended", {
        params: lat != null && lng != null ? { userId, lat, lng } : { userId },
      });
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      let jobs = data.map(normalize);
      // กรองงานของตัวเองและงานที่รับแล้ว
      jobs = jobs.filter(
        (j: Job) =>
          String(j.created_by || "") !== userId &&
          (!j.accepted_by || String(j.accepted_by) !== userId),
      );
      jobs.sort(
        (a, b) =>
          new Date(b.datetime || b.created_at || 0).getTime() -
          new Date(a.datetime || a.created_at || 0).getTime(),
      );
      console.log(
        "[getRecommendedJobs] Backend returned",
        jobs.length,
        "job(s) for user",
        userId,
      );
      return jobs.slice(0, 50);
    } catch (backendErr: any) {
      // ✅ ถ้า Error ร้ายแรง (401, 403, 404) ให้หยุดทันที ไม่ fallback
      if (
        backendErr?.response?.status === 401 ||
        backendErr?.response?.status === 403 ||
        backendErr?.response?.status === 404
      ) {
        console.error(
          "[getRecommendedJobs] Auth/Permission error, returning empty array:",
          backendErr?.response?.status,
        );
        return [];
      }
      console.warn(
        "[getRecommendedJobs] Backend failed, falling back to Firestore:",
        backendErr?.message,
      );
    }

    // Fallback: Firestore (งานที่ Bob โพสต์ผ่าน backend จะไม่โผล่ตรงนี้)
    try {
      let userSkills: string[] = [];
      // ✅ เช็ค userId อีกรอบก่อนเรียก getProfile
      if (userId && userId.length > 10) {
        try {
          const user = await MockApi.getProfile(userId);
          userSkills = user.skills || [];
        } catch (profileErr: any) {
          // ✅ ถ้า User not found (404) ให้หยุดทันที
          if (profileErr?.response?.status === 404) {
            console.warn(
              "[getRecommendedJobs] User not found (404), returning empty array",
            );
            return [];
          }
          console.warn(
            "[getRecommendedJobs] getProfile failed:",
            profileErr?.message,
          );
        }
      }
      const q = query(collection(db, "jobs"), limit(50));
      const snap = await getDocs(q);
      let jobs = snap.docs.map((d) => mapDoc<Job>(d));
      jobs = jobs.filter((j) => {
        const isOpen =
          j.status === JobStatus.OPEN || j.status?.toLowerCase() === "open";
        const notMyJob = j.created_by !== userId;
        const notAcceptedByMe = !j.accepted_by || j.accepted_by !== userId;
        const now = Date.now();
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        const created = new Date(j.created_at || j.datetime).getTime();
        return (
          isOpen && notMyJob && notAcceptedByMe && now - created < SEVEN_DAYS
        );
      });
      if (userSkills.length > 0) {
        const matching = jobs.filter((j) =>
          userSkills.some((s) =>
            (j.category || "").toLowerCase().includes((s || "").toLowerCase()),
          ),
        );
        const other = jobs.filter((j) => !matching.includes(j));
        jobs = [...matching, ...other];
      }
      jobs.sort(
        (a, b) =>
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
      );
      return jobs.slice(0, 10);
    } catch (e) {
      console.warn("Failed to fetch recommended jobs:", e);
      return MOCK_JOBS.filter((job) => job.status === JobStatus.OPEN)
        .slice(0, 3)
        .map((job) => ({
          ...job,
          distance: Math.floor(Math.random() * 10) + 1,
        }));
    }
  },

  // 3. submitWorkForApproval - ที่อาจจะถูกเรียกใช้
  submitWorkForApproval: async (
    jobId: string,
    location: { lat: number; lng: number },
  ): Promise<boolean> => {
    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) {
        console.error(`Job ${jobId} not found`);
        return false;
      }

      // อัปเดตสถานะเป็นรออนุมัติ
      await updateDoc(jobRef, {
        status: JobStatus.WAITING_FOR_APPROVAL,
        submitted_at: new Date().toISOString(),
        submitted_location: location,
        updated_at: new Date().toISOString(),
      });

      // ส่ง notification ให้ผู้จ้าง
      const job = mapDoc<Job>(jobSnap);
      await MockApi.sendNotification({
        user_id: job.created_by,
        title: "📸 มีผลงานรอตรวจสอบ",
        message: `ผู้รับงาน ${job.accepted_by_name} ได้ส่งรูปผลงานรอการตรวจสอบ`,
        type: "system",
        related_id: jobId,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      console.log(`Job ${jobId} submitted for approval`);
      return true;
    } catch (error) {
      console.error("Error submitting work for approval:", error);
      return false;
    }
  },

  // 4. approveJob - สำหรับอนุมัติงาน (Firestore เท่านั้น; งานจาก Backend คืน true เพื่อให้ processPayment ดำเนินการต่อ)
  approveJob: async (jobId: string): Promise<boolean> => {
    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) {
        // งานจาก Backend ไม่มี doc ใน Firestore — คืน true เพื่อให้ handleSystemAutoApprove เรียก processPayment ได้
        console.log(
          `Job ${jobId} not in Firestore (backend job), skipping approve step`,
        );
        return true;
      }

      // อัปเดตสถานะเป็นอนุมัติแล้ว
      await updateDoc(jobRef, {
        status: JobStatus.WAITING_FOR_PAYMENT,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // เริ่มนับถอยหลัง auto-payment (5 นาที)
        auto_payment_deadline: new Date(
          Date.now() + 5 * 60 * 1000,
        ).toISOString(),
      });

      console.log(`Job ${jobId} approved by client`);
      return true;
    } catch (error) {
      console.error("Error approving job:", error);
      return false;
    }
  },

  // 5. getSearchSuggestions - สำหรับ search
  getSearchSuggestions: async (queryText: string): Promise<string[]> => {
    if (!queryText) return [];
    try {
      const jobs = await MockApi.getJobs();
      const lowerQ = queryText.toLowerCase();
      const titles = jobs
        .map((j) => j.title)
        .filter((t) => t.toLowerCase().includes(lowerQ))
        .slice(0, 5);
      return Array.from(new Set(titles));
    } catch (e) {
      return [];
    }
  },

  // 6. checkAvailability - สำหรับตรวจสอบ availability
  checkAvailability: async (
    providerId: string,
    jobDatetime: string,
    durationHours: number = 2,
  ): Promise<boolean> => {
    try {
      const provider = await MockApi.getProfile(providerId);
      if (!provider.availability || provider.availability.length === 0)
        return true;

      const jobStart = new Date(jobDatetime).getTime();
      const jobEnd = jobStart + durationHours * 60 * 60 * 1000;

      const hasConflict = provider.availability.some((slot) => {
        const slotStart = new Date(`${slot.date}T${slot.startTime}`).getTime();
        const slotEnd = new Date(`${slot.date}T${slot.endTime}`).getTime();
        return jobStart < slotEnd && jobEnd > slotStart;
      });

      return !hasConflict;
    } catch (e) {
      return true;
    }
  },

  // 7. getBotResponse - สำหรับ chatbot (fallback เมื่อไม่ใช้ Backend Support)
  getBotResponse: async (message: string): Promise<string> => {
    const responses = [
      "สวัสดีครับ! มีอะไรให้ช่วยไหมครับ?",
      "กรุณาติดต่อเจ้าหน้าที่สำหรับคำถามเฉพาะทาง",
      "ระบบตอบรับอัตโนมัติ: กรุณาระบุปัญหาของคุณ",
      "ผมเป็นบอทช่วยเหลือ สามารถช่วยเรื่องการใช้งานทั่วไปได้",
      "หากมีปัญหาด่วน กรุณาติดต่อ 02-123-4567",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  },

  // Support Tickets (Backend API — ใช้ค่าจริงจาก Settings Help & Support / JobDetails Dispute)
  createSupportTicket: async (params: {
    userId?: string;
    subject?: string;
    message: string;
    category?: string;
    email?: string;
    full_name?: string;
    phone?: string;
    is_emergency?: boolean;
    emergency_kind?: string;
  }): Promise<{ ticket: { id: string }; message: { id: string } }> => {
    const base = getBackendBase();
    const res = await axios.post(`${base}/api/support/tickets`, params, {
      timeout: 8000,
    });
    return res.data;
  },
  createDisputeSupportTicket: async (
    jobId: string,
    userId: string,
    reason: string,
    useInsuranceClaim?: boolean,
  ): Promise<{ ticket: { id: string } }> => {
    const base = getBackendBase();
    const res = await axios.post(
      `${base}/api/support/tickets/from-dispute`,
      {
        jobId,
        userId,
        reason,
        use_insurance_claim: useInsuranceClaim ?? false,
      },
      { timeout: 8000 },
    );
    return res.data;
  },
  getMySupportTickets: async (
    userId: string,
  ): Promise<{
    tickets: Array<{
      id: string;
      subject: string;
      status: string;
      lastUpdated: string;
      category: string;
      source?: string;
      jobId?: string;
    }>;
  }> => {
    const base = getBackendBase();
    const res = await axios.get(`${base}/api/support/tickets`, {
      params: { userId, limit: 20 },
      timeout: 8000,
    });
    return res.data;
  },
  getSupportTicketMessages: async (
    ticketId: string,
  ): Promise<{
    messages: Array<{
      id: string;
      sender: string;
      message: string;
      timestamp: string;
    }>;
  }> => {
    const base = getBackendBase();
    const res = await axios.get(
      `${base}/api/support/tickets/${ticketId}/messages`,
      { timeout: 8000 },
    );
    return res.data;
  },
  sendSupportMessage: async (
    ticketId: string,
    message: string,
  ): Promise<{ message: { id: string } }> => {
    const base = getBackendBase();
    const res = await axios.post(
      `${base}/api/support/tickets/${ticketId}/messages`,
      { message },
      { timeout: 8000 },
    );
    return res.data;
  },

  // แบนเนอร์จาก Admin (DB): retry รายการเต็ม + กรอง placement ฝั่ง client + fallback fetch ถ้า axios ล้ม
  getBanners: async (
    placement?: "home" | "welcome" | "job_detail",
    opts?: { signal?: AbortSignal },
  ): Promise<{ banners: Array<Record<string, unknown>> }> => {
    const signal = opts?.signal;
    const sortBanners = (list: Array<Record<string, unknown>>) =>
      [...list].sort(
        (a, b) =>
          (Number((a as { order?: number }).order) || 0) -
          (Number((b as { order?: number }).order) || 0),
      );

    const extractBannersArray = (data: unknown): unknown[] | null => {
      if (!data || typeof data !== "object") return null;
      const o = data as Record<string, unknown>;
      const nested = (k: string) => {
        const v = o[k];
        return v && typeof v === "object"
          ? (v as Record<string, unknown>)
          : null;
      };
      const candidates = [
        o.banners,
        nested("data")?.banners,
        nested("result")?.banners,
        nested("payload")?.banners,
      ];
      for (const c of candidates) {
        if (Array.isArray(c)) return c;
      }
      return null;
    };

    const normalize = (data: unknown): Array<Record<string, unknown>> => {
      const raw = extractBannersArray(data);
      if (!raw) return [];
      return raw
        .filter((x) => x && typeof x === "object")
        .map((x, i) => {
          const row = { ...(x as Record<string, unknown>) };
          if (row.id == null || String(row.id).trim() === "") {
            row.id = `banner-${i}`;
          }
          const img = row.imageUrl ?? row.image_url;
          if (img != null && row.imageUrl == null) {
            row.imageUrl = img;
          }
          if (
            (row.title == null || String(row.title).trim() === "") &&
            row.title_text != null
          ) {
            row.title = row.title_text;
          }
          return row;
        });
    };

    const filterForPlacement = (
      list: Array<Record<string, unknown>>,
      p: "home" | "welcome" | "job_detail",
    ): Array<Record<string, unknown>> => {
      const items = list as HomeBannerItem[];
      if (p === "home")
        return items.filter(bannerVisibleForHomePlacement) as Array<
          Record<string, unknown>
        >;
      if (p === "welcome")
        return items.filter(bannerVisibleForWelcomePlacement) as Array<
          Record<string, unknown>
        >;
      return items.filter(bannerVisibleForJobDetailPlacement) as Array<
        Record<string, unknown>
      >;
    };

    const tryAxios = async (pl?: string) => {
      const res = await api.get("/banners", {
        timeout: 15_000,
        params: pl ? { placement: pl } : undefined,
        signal,
      });
      return sortBanners(normalize(res.data));
    };

    const tryFetch = async (pl?: string) => {
      const base = getBackendBase().replace(/\/$/, "");
      const url = new URL(`${base}/api/banners`);
      if (pl) url.searchParams.set("placement", pl);
      const r = await fetch(url.toString(), {
        credentials: "omit",
        mode: "cors",
        signal,
      });
      if (!r.ok) throw new Error(`banners HTTP ${r.status}`);
      return sortBanners(normalize(await r.json()));
    };

    const isAbortError = (e: unknown): boolean =>
      Boolean(
        signal?.aborted ||
        (axios.isCancel != null && axios.isCancel(e)) ||
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error &&
          (e.name === "AbortError" ||
            /aborted|canceled|cancelled/i.test(e.message))),
      );

    try {
      if (!placement) {
        return { banners: await tryAxios() };
      }
      let list = await tryAxios(placement);
      if (list.length === 0) {
        const broad = await tryAxios();
        list = filterForPlacement(broad, placement);
        if (import.meta.env.DEV && broad.length > 0 && list.length > 0) {
          console.warn(
            `[getBanners] placement=${placement} ว่าง — ใช้รายการเต็มแล้วกรองฝั่ง client`,
          );
        }
      }
      return { banners: list };
    } catch (e1) {
      if (isAbortError(e1)) throw e1;
      try {
        if (!placement) {
          return { banners: await tryFetch() };
        }
        let list = await tryFetch(placement);
        if (list.length === 0) {
          const broad = await tryFetch();
          list = filterForPlacement(broad, placement);
        }
        return { banners: list };
      } catch (e2) {
        if (isAbortError(e2) || isAbortError(e1)) throw e2;
        console.warn(
          "[getBanners] failed:",
          (e1 as Error)?.message || e1,
          (e2 as Error)?.message || e2,
        );
        return { banners: [] };
      }
    }
  },
  /** วัดผลแบนเนอร์ — fire-and-forget */
  recordBannerEvent: async (
    bannerId: string,
    kind: "sheet_open" | "claim",
  ): Promise<void> => {
    const id = String(bannerId || "").trim();
    if (!id) return;
    try {
      await api.post(
        `/banners/${encodeURIComponent(id)}/events`,
        { kind },
        { timeout: 5000 },
      );
    } catch {
      /* ignore */
    }
  },
  claimVoucher: async (
    code: string,
  ): Promise<{
    voucher: { id: string; promoCode: string; remainingBaht: number };
    message: string;
  }> => {
    const base = getBackendBase();
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("กรุณาเข้าสู่ระบบก่อนรับโค้ด");
    const res = await axios.post(
      `${base}/api/vouchers/claim`,
      { code, userId },
      { timeout: 8000 },
    );
    return res.data;
  },
  getMyVouchers: async (): Promise<{
    vouchers: Array<{
      id: string;
      promoCode: string;
      remainingBaht: number;
      maxDiscountBaht: number;
      expiresAt?: string;
    }>;
  }> => {
    const base = getBackendBase();
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) return { vouchers: [] };
    const res = await axios.get(`${base}/api/vouchers/my`, {
      params: { userId },
      timeout: 8000,
    });
    return res.data;
  },

  // 8. getOpenJobs - สำหรับหน้า provider
  getOpenJobs: async (): Promise<Job[]> => {
    try {
      const q = query(
        collection(db, "jobs"),
        where("status", "==", JobStatus.OPEN),
      );
      const snap = await getDocs(q);
      const jobs = snap.docs.map((d) => mapDoc<Job>(d));

      // กรองงานที่เกิน 1 วัน
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      return jobs.filter((j) => {
        const created = new Date(j.created_at || j.datetime).getTime();
        return now - created < ONE_DAY;
      });
    } catch (e) {
      console.warn("Failed to fetch open jobs:", e);
      return MOCK_JOBS.filter((job) => job.status === JobStatus.OPEN);
    }
  },

  // 9. getProviderJobs - สำหรับ provider
  getProviderJobs: async (providerId: string): Promise<Job[]> => {
    try {
      const q = query(
        collection(db, "jobs"),
        where("accepted_by", "==", providerId),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => mapDoc<Job>(d));
    } catch (e) {
      console.warn("Failed to fetch provider jobs:", e);
      return MOCK_JOBS.filter((job) => job.accepted_by === providerId);
    }
  },

  // 10. getAvailableJobs - alias สำหรับ getOpenJobs
  getAvailableJobs: async (): Promise<Job[]> => {
    return await MockApi.getOpenJobs();
  },

  // 11. acceptJobAsProvider - สำหรับ provider รับงาน (backend ก่อน, ไม่อัปเดต Firestore ถ้าไม่มี doc)
  acceptJobAsProvider: async (
    jobId: string,
    providerId: string,
  ): Promise<Job> => {
    console.log("MockApi.acceptJobAsProvider called:", { jobId, providerId });

    try {
      try {
        const res = await api.post(`/jobs/${jobId}/accept`, {
          userId: providerId,
        });
        const job = res.data?.job;
        if (job)
          return {
            ...job,
            id: String(job.id),
            status: job.status || "accepted",
          } as Job;
      } catch (be: any) {
        if (be?.response?.status === 404)
          throw new Error(be?.response?.data?.error || "Job not found");
        if (be?.response?.status === 400)
          throw new Error(be?.response?.data?.error || "Job is not available");
      }

      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) throw new Error("Job not found");

      const job = mapDoc<Job>(jobSnap);
      if (job.status !== JobStatus.OPEN)
        throw new Error("Job is not available");

      const provider = await MockApi.getProfile(providerId);
      await updateDoc(jobRef, {
        status: JobStatus.ACCEPTED,
        accepted_by: providerId,
        accepted_by_name: provider.name,
        updated_at: new Date().toISOString(),
      });
      const updatedSnap = await getDoc(jobRef);
      return mapDoc<Job>(updatedSnap);
    } catch (error) {
      console.error("Error accepting job:", error);
      throw error;
    }
  },

  // 12. createNotification - สำหรับสร้าง notification
  createNotification: async (notificationData: any): Promise<any> => {
    try {
      const notification = {
        ...notificationData,
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(
        collection(db, "notifications"),
        notification,
      );
      return { ...notification, id: docRef.id };
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  },

  // 13. markNotificationAsRead - สำหรับ mark notification
  markNotificationAsRead: async (notificationId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        read: true,
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      throw error;
    }
  },

  // 14. getUserNotifications - สำหรับดึง notifications
  getUserNotifications: async (userId: string): Promise<any[]> => {
    try {
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(50),
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error getting notifications:", error);
      return [];
    }
  },

  // 15. submitReview - สำหรับส่งรีวิว
  submitReview: async (reviewData: any): Promise<void> => {
    try {
      await addDoc(collection(db, "reviews"), {
        ...reviewData,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error submitting review:", error);
      throw error;
    }
  },

  // 16. getReviews - สำหรับดึงรีวิว
  getReviews: async (userId: string): Promise<Review[]> => {
    try {
      const q = query(
        collection(db, "reviews"),
        where("target_user_id", "==", userId),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => mapDoc<Review>(d));
    } catch (e) {
      return [];
    }
  },

  // 17. getAllCourses - สำหรับ training
  getAllCourses: async (): Promise<TrainingModule[]> => {
    return MOCK_COURSES;
  },

  getProviderOnboardingStatus: async (
    userId: string,
  ): Promise<{
    provider_status: string;
    provider_verified_at: string | null;
    provider_test_next_retry_at: string | null;
    provider_test_attempts: number;
    onboarding_status?: string;
    exam_results?: {
      module: number;
      category?: string | null;
      attempt: number;
      score: number;
      passed: boolean;
      submitted_at: string | null;
      time_spent_seconds?: number | null;
    }[];
  }> => {
    try {
      const res = await api.get("/provider-onboarding/status", {
        params: { userId },
      });
      return res.data;
    } catch (e) {
      return {
        provider_status: "UNVERIFIED",
        provider_verified_at: null,
        provider_test_next_retry_at: null,
        provider_test_attempts: 0,
        onboarding_status: "NOT_STARTED",
        kyc_status: "not_submitted",
        exam_results: [],
      };
    }
  },

  // 18. sendTip - สำหรับส่งทิป
  sendTip: async (jobId: string, amount: number): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) throw new Error("Job not found");
      const job = jobSnap.data() as Job;
      const jobTitle = job.title || "งานบริการ";

      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", userId);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User not found");

        if (!job.accepted_by) throw new Error("Job not accepted yet");

        const providerRef = doc(db, "users", job.accepted_by);
        const providerDoc = await transaction.get(providerRef);
        if (!providerDoc.exists()) throw new Error("Provider not found");

        const userBal = userDoc.data().wallet_balance || 0;
        if (userBal < amount) throw new Error("Insufficient balance for tip");

        transaction.update(userRef, { wallet_balance: userBal - amount });
        transaction.update(providerRef, {
          wallet_balance: providerDoc.data().wallet_balance + amount,
        });
        transaction.update(jobRef, {
          tips_amount: (job.tips_amount || 0) + amount,
        });

        const userTxRef = doc(collection(db, "transactions"));
        const ownerTx: Transaction = {
          id: userTxRef.id,
          user_id: userId,
          type: "payment",
          amount: amount,
          date: new Date().toISOString(),
          description: `Tip sent for: ${jobTitle}`,
          status: "completed",
          related_job_id: jobId,
        };
        transaction.set(userTxRef, sanitize(ownerTx));

        const providerTxRef = doc(collection(db, "transactions"));
        const providerTx: Transaction = {
          id: providerTxRef.id,
          user_id: job.accepted_by,
          type: "income",
          amount: amount,
          date: new Date().toISOString(),
          description: `Tip received for: ${jobTitle}`,
          status: "completed",
          related_job_id: jobId,
        };
        transaction.set(providerTxRef, sanitize(providerTx));
      });

      await MockApi.sendNotification({
        user_id: job.accepted_by!,
        title: "ได้รับทิปใหม่! 💸",
        message: `คุณได้รับทิปจำนวน ${amount} บาท สำหรับงาน "${jobTitle}"`,
        type: "payment",
        related_id: jobId,
      });
    } catch (e) {
      console.error("Error sending tip:", e);
      throw e;
    }
  },

  // 19. reportJob - สำหรับรายงานปัญหา
  reportJob: async (jobId: string, reason: string): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    const dispute: Dispute = {
      id: "",
      job_id: jobId,
      reporter_id: userId || "anon",
      reason,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    await addDoc(collection(db, "disputes"), sanitize(dispute));
    await updateDoc(doc(db, "jobs", jobId), { status: JobStatus.DISPUTE });
  },

  // 20. changePassword - สำหรับเปลี่ยนรหัสผ่าน
  changePassword: async (oldPass: string, newPass: string): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    await updateDoc(doc(db, "users", userId), { password: newPass });
  },

  /** บันทึกวันหมดอายุบัตร/ใบขับขี่ลง kyc_submissions ล่าสุด */
  syncKycDocumentMeta: async (payload: {
    idCardExpiryDate?: string;
    driverLicenseExpiry?: string;
    id_card_expiry?: string;
    driver_license_expiry?: string;
  }): Promise<void> => {
    await api.post("/kyc/sync-document-meta", {
      idCardExpiryDate:
        payload.idCardExpiryDate ?? payload.id_card_expiry ?? undefined,
      driverLicenseExpiry:
        payload.driverLicenseExpiry ??
        payload.driver_license_expiry ??
        undefined,
    });
  },

  /** บันทึกเอกสารรถสาธารณะลง kyc_submissions ล่าสุด */
  syncKycPublicTransportDocs: async (payload: {
    wantsPublicTransport?: boolean;
    yellowPlatePhotoUrl?: string;
    publicTransportLicenseFrontUrl?: string;
    publicTransportLicenseBackUrl?: string;
  }): Promise<void> => {
    await api.post("/kyc/sync-public-transport-docs", {
      wantsPublicTransport: payload.wantsPublicTransport,
      yellowPlatePhotoUrl: payload.yellowPlatePhotoUrl,
      publicTransportLicenseFrontUrl: payload.publicTransportLicenseFrontUrl,
      publicTransportLicenseBackUrl: payload.publicTransportLicenseBackUrl,
    });
  },

  /** เพิ่มบัตรผ่าน PaySo token (ไม่ส่งเลขบัตรเต็มไป backend) */
  addCardPaymentMethod: async (payload: {
    cardToken: string;
    holderName: string;
  }): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("กรุณาเข้าสู่ระบบ");
    const { data } = await api.post<{
      success?: boolean;
      bank_accounts?: BankAccount[];
      error?: string;
    }>("/users/payment-methods/card", {
      cardToken: payload.cardToken,
      holderName: payload.holderName,
    });
    if (data?.error) throw new Error(data.error);
    clearCache(`profile:${userId}`);
    let profile = await MockApi.getProfile(userId, { refresh: true });
    if (data?.bank_accounts?.length) {
      profile = { ...profile, bank_accounts: data.bank_accounts };
    }
    setBankAccountsToStorage(userId, profile.bank_accounts || []);
    setCache(`profile:${userId}`, profile);
    return profile;
  },

  // 21. addBankAccount - สำหรับเพิ่มบัญชีธนาคาร
  // ✅ ใช้ Backend เท่านั้นสำหรับผู้ใช้ที่ล็อกอิน via Backend (userId เป็น UUID)
  // ผู้ใช้ Firebase (userId ไม่ใช่ UUID) ใช้ Firestore
  addBankAccount: async (account: any): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("กรุณาเข้าสู่ระบบ");
    const newAccount: BankAccount = {
      id: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...account,
    };
    const isBackendUser =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId || "",
      );
    try {
      if (isBackendUser) {
        // ผู้ใช้ Backend — ใช้ PATCH /api/users/profile เท่านั้น (ไม่มี Firestore doc)
        const current = await MockApi.getProfile(userId, { refresh: true });
        const currentAccounts: BankAccount[] = current?.bank_accounts || [];
        const updated = [...currentAccounts, newAccount];
        await api.patch(`/users/profile/${userId}`, { bank_accounts: updated });
        clearCache(`profile:${userId}`);
        let profile = await MockApi.getProfile(userId, { refresh: true });
        // Guarantee: if backend GET returned stale data, merge our known-good array synchronously
        const hasNewAccount = (profile?.bank_accounts || []).some(
          (a: BankAccount) =>
            a.account_number === newAccount.account_number &&
            a.account_name === newAccount.account_name,
        );
        if (!hasNewAccount) {
          profile = { ...profile, bank_accounts: updated };
        }
        setBankAccountsToStorage(userId, profile.bank_accounts || []);
        setCache(`profile:${userId}`, profile);
        return profile;
      }
      // ผู้ใช้ Firebase — ใช้ Firestore
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const currentAccounts = userSnap.data()?.bank_accounts || [];
      const updated = [...currentAccounts, newAccount];
      await updateDoc(userRef, { bank_accounts: updated });
      clearCache(`profile:${userId}`);
      let profile = await MockApi.getProfile(userId);
      const hasNewAccount = (profile?.bank_accounts || []).some(
        (a: BankAccount) =>
          a.account_number === newAccount.account_number &&
          a.account_name === newAccount.account_name,
      );
      if (!hasNewAccount) {
        profile = { ...profile, bank_accounts: updated };
      }
      setBankAccountsToStorage(userId, profile.bank_accounts || []);
      setCache(`profile:${userId}`, profile);
      return profile;
    } catch (e) {
      console.error("Error adding bank account:", e);
      const err = e as any;
      const msg = err?.response?.data?.error || err?.message;
      throw new Error(msg || "บันทึกช่องทางรับเงินไม่สำเร็จ");
    }
  },

  // 22. removeBankAccount - สำหรับลบบัญชีธนาคาร
  // ✅ ใช้ Backend เท่านั้นสำหรับผู้ใช้ที่ล็อกอิน via Backend (userId เป็น UUID)
  removeBankAccount: async (accountId: string): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("กรุณาเข้าสู่ระบบ");
    const isBackendUser =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId,
      );
    try {
      if (isBackendUser) {
        const current = await MockApi.getProfile(userId, { refresh: true });
        const currentAccounts: BankAccount[] = current?.bank_accounts || [];
        const updated = currentAccounts.filter((a: any) => a.id !== accountId);
        await api.patch(`/users/profile/${userId}`, { bank_accounts: updated });
        clearCache(`profile:${userId}`);
        const profile = await MockApi.getProfile(userId, { refresh: true });
        setBankAccountsToStorage(userId, profile.bank_accounts || []);
        setCache(`profile:${userId}`, profile);
        return profile;
      }
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const currentAccounts: BankAccount[] =
        userSnap.data()?.bank_accounts || [];
      await updateDoc(userRef, {
        bank_accounts: currentAccounts.filter((a) => a.id !== accountId),
      });
      clearCache(`profile:${userId}`);
      const profile = await MockApi.getProfile(userId);
      setBankAccountsToStorage(userId, profile.bank_accounts || []);
      setCache(`profile:${userId}`, profile);
      return profile;
    } catch (e) {
      console.error("Error removing bank account:", e);
      const err = e as any;
      const msg = err?.response?.data?.error || err?.message;
      throw new Error(msg || "ลบช่องทางรับเงินไม่สำเร็จ");
    }
  },
  // ============================================
  // ✅ TRANSACTION UTILITY FUNCTIONS
  // ============================================

  getProviderWalletSummary: async (): Promise<{
    available: number;
    pending: number;
    total: number;
    nextReleaseTime?: string;
    recentTransactions: Transaction[];
  }> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get(`/users/wallet-summary/${userId}`);
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend wallet summary failed, falling back to local:",
          backendError,
        );
      }

      // Fallback to local calculation
      const user = await MockApi.getProfile(userId);
      const transactions = await MockApi.getTransactions();

      const available = user.wallet_balance || 0;
      const pending = user.wallet_pending || 0;
      const total = available + pending;

      const pendingFromTransactions = transactions
        .filter((tx) => tx.status === "pending_release" && tx.type === "income")
        .reduce((sum, tx) => sum + tx.amount, 0);

      if (pending !== pendingFromTransactions) {
        console.warn(
          `⚠️ Pending mismatch: wallet_pending=${pending}, transactions=${pendingFromTransactions}`,
        );
      }

      const pendingTx = transactions.find(
        (tx) => tx.status === "pending_release",
      );
      const nextReleaseTime = pendingTx?.release_info?.scheduled_release;

      return {
        available,
        pending,
        total,
        nextReleaseTime,
        recentTransactions: transactions.slice(0, 10),
      };
    } catch (error) {
      console.error("Error getting wallet summary:", error);
      return {
        available: 0,
        pending: 0,
        total: 0,
        recentTransactions: [],
      };
    }
  },

  fixNegativeIncomes: async (): Promise<number> => {
    try {
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) return 0;

      console.log("🔧 Fixing negative income transactions...");

      const q = query(
        collection(db, "transactions"),
        where("user_id", "==", userId),
        where("type", "==", "income"),
      );

      const snap = await getDocs(q);
      let fixedCount = 0;

      for (const docSnap of snap.docs) {
        const tx = docSnap.data() as Transaction;

        if (tx.amount < 0) {
          console.log(
            `🔄 Fixing negative income: ${tx.description} (${tx.amount})`,
          );

          await updateDoc(doc(db, "transactions", docSnap.id), {
            amount: Math.abs(tx.amount),
            fixed_at: new Date().toISOString(),
            original_amount: tx.amount,
          });

          fixedCount++;
        }
      }

      console.log(`✅ Fixed ${fixedCount} negative income transactions`);
      return fixedCount;
    } catch (error) {
      console.error("Error fixing negative incomes:", error);
      return 0;
    }
  },

  emergencyRemoveDuplicateTransactions: async (): Promise<number> => {
    try {
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) return 0;

      console.log("🚨 Emergency: Removing duplicate transactions...");

      const q = query(
        collection(db, "transactions"),
        where("user_id", "==", userId),
      );
      const snap = await getDocs(q);
      const transactions = snap.docs.map((d) => ({
        id: d.id,
        ...mapDoc<Transaction>(d),
      }));

      const groups: Record<string, Array<{ id: string } & Transaction>> = {};
      const toDelete: string[] = [];

      transactions.forEach((tx) => {
        const key = `${tx.related_job_id || "no-job"}-${tx.type}-${
          tx.amount
        }-${tx.description.substring(0, 50)}`;

        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(tx);
      });

      Object.values(groups).forEach((group) => {
        if (group.length > 1) {
          group.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
          for (let i = 1; i < group.length; i++) {
            toDelete.push(group[i].id);
          }
        }
      });

      let deletedCount = 0;
      for (const txId of toDelete) {
        try {
          await deleteDoc(doc(db, "transactions", txId));
          deletedCount++;
        } catch (error) {
          console.error(`❌ Failed to delete transaction ${txId}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error("❌ Emergency cleanup failed:", error);
      return 0;
    }
  },

  // ============================================
  // ✅ CHECK PAYMENT STATUS FUNCTION
  // ============================================
  checkPaymentStatus: async (
    jobId: string,
  ): Promise<{
    paid: boolean;
    paidAt?: string;
    amount?: number;
    status?: string;
  }> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get(`/payments/status/${jobId}`);
        return response.data;
      } catch (backendError) {
        console.warn("Backend payment status check failed:", backendError);
      }

      // Fallback to local check
      const job = await MockApi.getJobDetails(jobId);
      if (!job) {
        return { paid: false };
      }

      return {
        paid: job.payment_status === "paid",
        paidAt: job.paid_at,
        amount: job.payment_details?.amount,
        status: job.payment_status,
      };
    } catch (error) {
      console.error("Error checking payment status:", error);
      return { paid: false };
    }
  },

  /** สรุปฟิลด์ BA หลายคนในครั้งเดียว (ลดรอบขอ getProfile บนหน้างาน) */
  getBrandAdviserProfilesSummary: async (
    ids: string[],
  ): Promise<
    Record<
      string,
      {
        is_brand_adviser?: boolean;
        adviser_status?: string | null;
        brand_adviser_program_enabled?: boolean;
        brand_adviser_suspend_warning?: boolean;
        days_until_suspend_estimate?: number | null;
      }
    >
  > => {
    const unique = [...new Set((ids || []).map(String).filter(Boolean))].slice(
      0,
      24,
    );
    if (unique.length === 0) return {};
    try {
      const response = await api.post(`/users/profiles/brand-adviser-summary`, {
        ids: unique,
      });
      const raw = response?.data?.profiles;
      if (raw && typeof raw === "object") return raw;
    } catch (e) {
      console.warn(
        "[getBrandAdviserProfilesSummary] batch failed, fallback per id:",
        (e as any)?.message,
      );
    }
    const out: Record<
      string,
      {
        is_brand_adviser?: boolean;
        adviser_status?: string | null;
        brand_adviser_program_enabled?: boolean;
        brand_adviser_suspend_warning?: boolean;
        days_until_suspend_estimate?: number | null;
      }
    > = {};
    await Promise.all(
      unique.map(async (id) => {
        try {
          const p = await MockApi.getProfile(id, { refresh: false });
          out[id] = {
            is_brand_adviser: p.is_brand_adviser,
            adviser_status: p.adviser_status,
            brand_adviser_program_enabled: p.brand_adviser_program_enabled,
            brand_adviser_suspend_warning: p.brand_adviser_suspend_warning,
            days_until_suspend_estimate: p.days_until_suspend_estimate ?? null,
          };
        } catch (_) {}
      }),
    );
    return out;
  },

  /** Intercity charter — floor (min job fee) for counter-offers; backend-only */
  getJobBidFloor: async (jobId: string) => {
    const { data } = await api.get(`/jobs/${jobId}/bid-floor`);
    return data as {
      min_job_fee_thb: number;
      insurance_amount: number;
      listed_final_price_thb: number;
      bid_ttl_minutes?: number;
    };
  },

  getJobBids: async (
    jobId: string,
    userId?: string,
  ): Promise<{
    bids: Array<{
      id: string;
      job_id: string;
      provider_id: string;
      proposed_job_fee_thb: number;
      proposed_final_price_thb: number;
      status: string;
      created_at: string;
      bid_expires_at?: string | null;
      provider_name?: string | null;
    }>;
    bid_ttl_minutes?: number;
    floor: {
      min_job_fee_thb: number;
      insurance_amount: number;
      listed_final_price_thb: number;
    } | null;
  }> => {
    const uid = userId || localStorage.getItem("meerak_user_id");
    if (!uid) throw new Error("Not logged in");
    const { data } = await api.get(`/jobs/${jobId}/bids`, {
      params: { userId: uid },
    });
    return data;
  },

  submitJobBid: async (
    jobId: string,
    proposed_job_fee_thb: number,
    userId?: string,
  ) => {
    const uid = userId || localStorage.getItem("meerak_user_id");
    if (!uid) throw new Error("Not logged in");
    const { data } = await api.post(`/jobs/${jobId}/bids`, {
      userId: uid,
      proposed_job_fee_thb,
    });
    return data as {
      success: boolean;
      bid: Record<string, unknown>;
      bid_ttl_minutes?: number;
    };
  },

  acceptJobBid: async (jobId: string, bidId: string, userId?: string) => {
    const uid = userId || localStorage.getItem("meerak_user_id");
    if (!uid) throw new Error("Not logged in");
    const { data } = await api.post(`/jobs/${jobId}/bids/${bidId}/accept`, {
      userId: uid,
    });
    return data as {
      success: boolean;
      job?: Job;
      provider_name?: string;
      message?: string;
    };
  },

  invalidateProfileCache,
};

/**
 * Thin export สำหรับการสมัคร — เลี่ยงปัญหา TS ประเมินไทป์จาก `MockApi` ใหญ่มากบางทีครบเมื่อเรียกจากหน้า Register
 */
export async function registerViaBackendApi(
  data: Parameters<(typeof MockApi)["register"]>[0],
  opts?: RegisterCallOptions,
): Promise<ReturnType<(typeof MockApi)["register"]>> {
  return MockApi.register(data, opts);
}
