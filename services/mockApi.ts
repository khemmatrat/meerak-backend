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
} from "../types";

// --- BACKEND CONFIGURATION ---
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "https://meerak-backend.onrender.com";

// --- CLOUDINARY CONFIGURATION ---
const CLOUDINARY_CLOUD_NAME = "thanixs-cdn" as const;
const CLOUDINARY_UPLOAD_PRESET = "meerak-app" as const;
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload` as const;

// Helper to convert phone to email for user data
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

// Helper for API calls
const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("meerak_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

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

  checkKYCStatus: async (): Promise<any> => {
    try {
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) throw new Error("Not logged in");

      // ใช้ Backend endpoint สำหรับตรวจสอบสถานะ
      const response = await api.get(`/kyc/status/${userId}`);
      return response.data;
    } catch (error) {
      console.error("KYC status check error:", error);

      // Fallback: ตรวจสอบจาก Firestore
      const userId = localStorage.getItem("meerak_user_id");
      if (!userId) throw new Error("Not logged in");

      const user = await MockApi.getProfile(userId);
      return {
        kyc_status: user.kyc_status || "not_submitted",
        kyc_level: user.kyc_level || "level_1",
        submitted_at: user.kyc_submitted_at || null,
        steps_completed: 0,
        is_verified: false,
      };
    }
  },

  // ============================================
  // ✅ AUTHENTICATION SERVICES
  // ============================================

  // Phase 1: Helper functions for OTP login
  getUserIdByPhone: async (phone: string): Promise<string | null> => {
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
    try {
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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

  login: async (
    phone: string,
    password: string,
  ): Promise<{ token: string; user: UserProfile }> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.post("/auth/login", { phone, password });
        const { token, user } = response.data;

        localStorage.setItem("meerak_token", token);
        localStorage.setItem("meerak_user_id", user.id);

        return { token, user };
      } catch (backendError) {
        console.warn(
          "Backend login failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      const email = phoneToEmail(phone);
      const q = query(collection(db, "users"), where("phone", "==", phone));
      const querySnapshot = await getDocs(q);

      let userProfile: UserProfile;

      if (querySnapshot.empty) {
        const isAnna = phone === "0800000001";
        const isBob = phone === "0800000002";

        if (isAnna || isBob) {
          const newUser: UserProfile = {
            id: "",
            phone,
            email,
            name: isAnna ? "Anna Provider" : "Bob Provider",
            role: UserRole.PROVIDER,
            wallet_balance: isAnna ? 50000 : 100,
            created_at: new Date().toISOString(),
            kyc_level: "level_2",
            avatar_url: isAnna
              ? "https://i.pravatar.cc/150?u=anna"
              : "https://i.pravatar.cc/150?u=bob",
            skills: isBob ? ["Electrician", "Cleaning", "Driver"] : [],
            completed_jobs_count: isBob ? 10 : 0,
            location: isAnna
              ? { lat: 13.7462, lng: 100.5347 }
              : { lat: 13.7465, lng: 100.535 },
            trainings: [],
            availability: [],
          };
          const docRef = await addDoc(
            collection(db, "users"),
            sanitize(newUser),
          );
          userProfile = { ...newUser, id: docRef.id };
        } else {
          throw new Error("User not found. Please register.");
        }
      } else {
        userProfile = mapDoc<UserProfile>(querySnapshot.docs[0]);

        if (phone === "0800000001" || phone === "0800000002") {
          const loc =
            phone === "0800000001"
              ? { lat: 13.7462, lng: 100.5347 }
              : { lat: 13.7465, lng: 100.535 };
          try {
            const userRef = doc(db, "users", userProfile.id);
            await updateDoc(userRef, { location: loc });
            userProfile.location = loc;
          } catch (e) {
            console.warn("Failed to update location on login (Offline?)", e);
          }
        }
      }

      if (userProfile.is_banned) {
        throw new Error("Account has been suspended. Please contact support.");
      }

      localStorage.setItem("meerak_user_id", userProfile.id);
      const token = `mock-jwt-token-${userProfile.id}-${Date.now()}`;
      localStorage.setItem("meerak_token", token);

      return { token, user: userProfile };
    } catch (error: any) {
      if (error.code === "unavailable") {
        throw new Error("Cannot connect to server. Please check internet.");
      }
      throw error;
    }
  },

  register: async (
    data: any,
  ): Promise<{ token: string; user: UserProfile }> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.post("/auth/register", data);
        const { token, user } = response.data;

        localStorage.setItem("meerak_token", token);
        localStorage.setItem("meerak_user_id", user.id);

        return { token, user };
      } catch (backendError) {
        console.warn(
          "Backend register failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      const { phone, role, name, password } = data;
      const email = phoneToEmail(phone);

      const q = query(collection(db, "users"), where("phone", "==", phone));
      const snap = await getDocs(q);
      if (!snap.empty) throw new Error("Phone number already registered");

      const newUser: UserProfile = {
        id: "",
        name,
        phone,
        email,
        role,
        kyc_level: "level_1",
        wallet_balance: 0,
        created_at: new Date().toISOString(),
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(
          name,
        )}&background=random`,
        location: { lat: 13.7563, lng: 100.5018 },
        skills: [],
        trainings: [],
        availability: [],
      };

      const docRef = await addDoc(collection(db, "users"), sanitize(newUser));
      const user = { ...newUser, id: docRef.id };

      localStorage.setItem("meerak_user_id", user.id);
      const token = `mock-jwt-${docRef.id}`;
      localStorage.setItem("meerak_token", token);

      return { token, user };
    } catch (e) {
      return handleFirestoreError(e, "register");
    }
  },

  getProfile: async (userId?: string): Promise<UserProfile> => {
    const targetId = userId || localStorage.getItem("meerak_user_id");
    if (!targetId) throw new Error("No user ID provided");

    try {
      const docRef = doc(db, "users", targetId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return mapDoc<UserProfile>(docSnap);
      }
      try {
        const response = await api.get(`/users/profile/${targetId}`);
        if (response.data) return response.data;
      } catch (_) {}
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

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, sanitize(updates));
      const updatedSnap = await getDoc(userRef);
      return mapDoc<UserProfile>(updatedSnap);
    } catch (e) {
      return handleFirestoreError(e, "updateProfile");
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

    const idempotencyKey = `withdraw_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

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
      // พยายามใช้ Backend ก่อน
      try {
        const params: any = {};
        if (category && category !== "All") params.category = category;
        if (searchQuery) params.search = searchQuery;

        const response = await api.get("/jobs", { params });
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend jobs fetch failed, falling back to Firebase:",
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
      return jobs.sort(
        (a, b) =>
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
      );
    } catch (e) {
      console.warn("Failed to fetch jobs:", e);
      return [];
    }
  },

  getYourJobs: async (): Promise<Job[]> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) return [];
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get(`/users/jobs/${userId}`);
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend user jobs fetch failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      const q = query(collection(db, "jobs"));
      const snap = await getDocs(q);
      const allJobs = snap.docs.map((d) => mapDoc<Job>(d));
      const relevantJobs = allJobs.filter(
        (j) => j.created_by === userId || j.accepted_by === userId,
      );
      return relevantJobs.sort(
        (a, b) =>
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
      );
    } catch (e) {
      return [];
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

      // 2. เตรียมข้อมูลให้ consistent
      const cleanJobData = {
        ...jobData,
        // ใช้ key แบบเดียวกันทั้งหมด
        created_by: userId,
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
        return response.data;
      } catch (backendError: any) {
        console.warn(
          "Backend job creation failed, falling back to Firebase:",
          backendError.message,
        );

        // ตรวจสอบว่า error นี้ควร fallback หรือไม่
        if (
          backendError.response?.status === 401 ||
          backendError.response?.status === 403
        ) {
          // ถ้าเป็น authentication error ไม่ควร fallback
          throw new Error("Authentication failed. Please login again.");
        }
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
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get(`/jobs/${jobId}`);
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend job details fetch failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      const docRef = doc(db, "jobs", jobId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) return mapDoc<Job>(docSnap);
      return undefined;
    } catch (e) {
      return undefined;
    }
  },

  acceptJob: async (jobId: string): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");
    try {
      // พยายามใช้ Backend ก่อน
      try {
        await api.post(`/jobs/${jobId}/accept`, { userId });
        return;
      } catch (backendError) {
        console.warn(
          "Backend job acceptance failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      const user = await MockApi.getProfile(userId);
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      const job = mapDoc<Job>(jobSnap);

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

  cancelJob: async (jobId: string, reason?: string): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");

    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);

      if (!jobSnap.exists()) {
        throw new Error("Job not found");
      }

      const job = mapDoc<Job>(jobSnap);

      // ตรวจสอบว่าเป็นเจ้าของงาน
      if (job.created_by !== userId) {
        throw new Error("Only job owner can cancel");
      }

      // ตรวจสอบว่างานยังไม่มีคนรับ หรือ ยังไม่เริ่มทำ
      if (job.status !== JobStatus.OPEN && job.status !== JobStatus.ACCEPTED) {
        throw new Error("Cannot cancel job in current status");
      }

      // คืนเงินถ้ามีการกันเงินไว้
      if (job.status === JobStatus.ACCEPTED && job.accepted_by) {
        const clientRef = doc(db, "users", job.created_by);
        const clientSnap = await getDoc(clientRef);
        const client = clientSnap.data();

        await updateDoc(clientRef, {
          wallet_balance: (client?.wallet_balance || 0) + job.price,
          updated_at: new Date().toISOString(),
        });

        // บันทึก transaction
        await addDoc(collection(db, "transactions"), {
          user_id: job.created_by,
          amount: job.price,
          type: "refund",
          status: "completed",
          description: `Refund for cancelled job: ${job.title}`,
          created_at: new Date().toISOString(),
        });
      }

      // อัปเดต job status
      await updateDoc(jobRef, {
        status: JobStatus.CANCELLED,
        cancellation_reason: reason || "Cancelled by employer",
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        updated_at: new Date().toISOString(),
      });

      console.log("Job cancelled successfully:", jobId);
    } catch (e: any) {
      console.error("Cancel job error:", e);
      throw e;
    }
  },

  markJobAsDone: async (
    jobId: string,
    providerLocation: Location,
  ): Promise<void> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        await api.post(`/jobs/${jobId}/complete`, { providerLocation });
        return;
      } catch (backendError) {
        console.warn(
          "Backend job completion failed, falling back to Firebase:",
          backendError,
        );
      }

      // Fallback to Firebase
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) {
        throw new Error("Job not found");
      }
      const job = mapDoc<Job>(jobSnap);
      await updateDoc(jobRef, {
        status: JobStatus.WAITING_FOR_APPROVAL,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_notified_at: null,
        client_viewed_notification: false,
        auto_approve_start_time: null,
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
          avatarUrl: `https://randomuser.me/api/portraits/${i % 2 === 0 ? "women" : "men"}/${i}.jpg`,
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
    console.log(`Uploading image: ${tag || "untagged"} (${file.name})`);

    if (CLOUDINARY_UPLOAD_PRESET && CLOUDINARY_CLOUD_NAME) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

        if (tag) {
          formData.append("tags", tag);
        }

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) throw new Error("Cloudinary upload failed");

        const data = await response.json();
        return data.secure_url;
      } catch (error) {
        console.warn("Cloudinary upload failed, falling back to base64", error);
      }

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }
    return "";
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
    try {
      const q = query(
        collection(db, "notifications"),
        where("user_id", "==", userId),
      );
      const snap = await getDocs(q);
      const notifs = snap.docs.map((d) => mapDoc<UserNotification>(d));
      return notifs.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } catch (e) {
      return [];
    }
  },

  markNotificationRead: async (id: string): Promise<void> => {
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
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, { avatar_url: avatarUrl });
    const updatedSnap = await getDoc(userRef);
    return mapDoc<UserProfile>(updatedSnap);
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
  ): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");
    const msg: any = {
      id: `msg-${Date.now()}`,
      room_id: jobId,
      sender_id: userId,
      type,
      text: text || "",
      media_url: type === MessageType.IMAGE ? text : undefined,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    try {
      await addDoc(collection(db, "chat_messages"), sanitize(msg));
    } catch (e) {
      return handleFirestoreError(e, "sendMessage");
    }
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
  getProviders: async (): Promise<any[]> => {
    try {
      // พยายามใช้ Backend ก่อน
      try {
        const response = await api.get("/providers");
        return response.data;
      } catch (backendError) {
        console.warn(
          "Backend providers fetch failed, falling back to mock:",
          backendError,
        );
      }

      // Fallback to mock data
      return [
        {
          id: "provider1",
          name: "Provider User",
          rating: 4.8,
          completedJobs: 45,
          status: "available",
          location: "Bangkok",
          phone: "0800000003",
          email: "provider@example.com",
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
          status: "on_job",
          location: "Bangkok",
          phone: "0800000004",
          email: "provider2@example.com",
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
    console.log("🔔 Subscribing to recommended jobs (Real-time)");

    const userId = localStorage.getItem("meerak_user_id");

    // เรียก callback ทันทีครั้งแรก
    MockApi.getRecommendedJobs().then(callback).catch(console.error);

    // ตั้ง real-time listener กับ Firebase
    const q = query(
      collection(db, "jobs"),
      where("status", "==", "open"),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          let jobs = snapshot.docs.map((d) => mapDoc<Job>(d));

          // กรองเหมือน getRecommendedJobs
          jobs = jobs.filter((j) => {
            const isOpen =
              j.status === JobStatus.OPEN || j.status?.toLowerCase() === "open";
            const notMyJob = j.created_by !== userId;
            const notAcceptedByMe = !j.accepted_by || j.accepted_by !== userId; // ✅ เพิ่มตรงนี้
            const now = Date.now();
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            const created = new Date(j.created_at || j.datetime).getTime();
            const notExpired = now - created < SEVEN_DAYS;

            return isOpen && notMyJob && notExpired && notAcceptedByMe; // ✅ เพิ่ม notAcceptedByMe
          });

          // เรียงตามวันที่
          jobs.sort(
            (a, b) =>
              new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
          );

          console.log(`📬 Recommended jobs updated: ${jobs.length} jobs`);
          callback(jobs.slice(0, 10));
        } catch (error) {
          console.error("Error processing recommended jobs:", error);
        }
      },
      (error) => {
        console.error("Firestore subscription error:", error);
      },
    );

    // Return unsubscribe function
    return () => {
      console.log("🔕 Unsubscribing from recommended jobs");
      unsubscribe();
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
          jobs = jobs.filter(
            (j) => j.created_by === userId || j.accepted_by === userId,
          );

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
  // ✅ HEALTH CHECK
  // ============================================
  checkBackendHealth: async (): Promise<boolean> => {
    try {
      const response = await axios.get(`${BACKEND_URL}/health`, {
        timeout: 3000,
      });
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

  // 2. getRecommendedJobs - สำหรับ Layout.tsx
  getRecommendedJobs: async (): Promise<Job[]> => {
    const userId = localStorage.getItem("meerak_user_id");
    try {
      let userSkills: string[] = [];
      if (userId) {
        const user = await MockApi.getProfile(userId);
        userSkills = user.skills || [];
      }

      const q = query(collection(db, "jobs"), limit(50));

      const snap = await getDocs(q);
      let jobs = snap.docs.map((d) => mapDoc<Job>(d));

      // กรองเฉพาะงานที่ OPEN และไม่ใช่งานของตัวเอง
      jobs = jobs.filter((j) => {
        // ตรวจสอบ status (case-insensitive)
        const isOpen =
          j.status === JobStatus.OPEN || j.status?.toLowerCase() === "open";

        // ไม่ใช่งานของตัวเอง
        const notMyJob = j.created_by !== userId;

        // ✅ ไม่ใช่งานที่ตัวเองรับแล้ว
        const notAcceptedByMe = !j.accepted_by || j.accepted_by !== userId;

        // งานสร้างไม่เกิน 7 วัน
        const now = Date.now();
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        const created = new Date(j.created_at || j.datetime).getTime();
        const notExpired = now - created < SEVEN_DAYS;

        return isOpen && notMyJob && notExpired && notAcceptedByMe; // ✅ เพิ่ม notAcceptedByMe
      });

      // ถ้ามีทักษะ ให้แนะนำงานที่ตรงทักษะก่อน
      if (userSkills.length > 0) {
        const matchingJobs = jobs.filter((j) =>
          userSkills.includes(j.category),
        );
        const otherJobs = jobs.filter((j) => !userSkills.includes(j.category));
        jobs = [...matchingJobs, ...otherJobs];
      }

      // เรียงตามวันที่ล่าสุด
      jobs.sort(
        (a, b) =>
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
      );

      return jobs.slice(0, 10);
    } catch (e) {
      console.warn("Failed to fetch recommended jobs:", e);

      // Fallback to mock data
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

  // 4. approveJob - สำหรับอนุมัติงาน
  approveJob: async (jobId: string): Promise<boolean> => {
    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      if (!jobSnap.exists()) {
        console.error(`Job ${jobId} not found`);
        return false;
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

  // 7. getBotResponse - สำหรับ chatbot
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

  // 11. acceptJobAsProvider - สำหรับ provider รับงาน
  acceptJobAsProvider: async (
    jobId: string,
    providerId: string,
  ): Promise<Job> => {
    console.log("MockApi.acceptJobAsProvider called:", { jobId, providerId });

    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);

      if (!jobSnap.exists()) {
        throw new Error("Job not found");
      }

      const job = mapDoc<Job>(jobSnap);

      if (job.status !== JobStatus.OPEN) {
        throw new Error("Job is not available");
      }

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

  // 21. addBankAccount - สำหรับเพิ่มบัญชีธนาคาร
  addBankAccount: async (account: any): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const currentAccounts = userSnap.data()?.bank_accounts || [];
      const newAccount: BankAccount = { id: `bank-${Date.now()}`, ...account };
      await updateDoc(userRef, {
        bank_accounts: [...currentAccounts, newAccount],
      });
      return await MockApi.getProfile(userId);
    } catch (e) {
      console.error("Error adding bank account:", e);
      throw e;
    }
  },

  // 22. removeBankAccount - สำหรับลบบัญชีธนาคาร
  removeBankAccount: async (accountId: string): Promise<UserProfile> => {
    const userId = localStorage.getItem("meerak_user_id");
    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const currentAccounts: BankAccount[] =
        userSnap.data()?.bank_accounts || [];
      await updateDoc(userRef, {
        bank_accounts: currentAccounts.filter((a) => a.id !== accountId),
      });
      return await MockApi.getProfile(userId);
    } catch (e) {
      console.error("Error removing bank account:", e);
      throw e;
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
};
