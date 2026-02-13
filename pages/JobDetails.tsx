import React, { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Navigation,
  MapPin,
  Clock,
  CreditCard,
  User,
  Shield,
  Send,
  CheckCircle,
  AlertTriangle,
  Image as ImageIcon,
  Paperclip,
  XCircle,
  X,
  Flag,
  Wallet,
  Hourglass,
  Loader2,
  Star,
  Timer,
  AlertOctagon,
  Share2,
  Facebook,
  Twitter,
  MessageCircle,
  Copy,
  Eye,
  ThumbsUp,
  Heart,
  Gift,
  DollarSign,
  PenTool as Tool,
  Activity,
  Camera,
  ClipboardList,
  Calendar,
  Phone,
  RefreshCw,
} from "lucide-react";
// UPDATED IMPORT PATHS
import { MockApi } from "../services/mockApi";
import {
  Job,
  ChatMessage,
  JobStatus,
  UserRole,
  MessageType,
  PaymentMethod,
} from "../types";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import DriverTracking from "../components/DriverTracking";
import LocationService from "../services/locationService";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
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
import { db } from "../services/firebase";
import FirebaseApi from "../services/firebase";
import { StorageService } from "../services/storage";
import PaymentService from "../services/paymentService";
import ReviewService from "../services/reviewService";
import StarRating from "../components/StarRating";
import { REVIEW_TAGS } from "../types";

export const JobDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, login, token } = useAuth();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingPay, setProcessingPay] = useState(false);
  const [submittingWork, setSubmittingWork] = useState(false);
  const [autoApproveTime, setAutoApproveTime] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Security States
  const [hasReviewedProof, setHasReviewedProof] = useState(false);
  const [gpsVerifying, setGpsVerifying] = useState(false);
  const [completionOtp, setCompletionOtp] = useState("");

  // Job Expiration State
  const [expirationTime, setExpirationTime] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Tip Modal State
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [sendingTip, setSendingTip] = useState(false);

  // Cancellation Countdown Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSeconds, setCancelSeconds] = useState(10);

  // Dispute Modal State
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);

  // 🗺️ Location Tracking State
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [isLocationTracking, setIsLocationTracking] = useState(false);

  // 📍 Phase 3: Arrival Confirmation State
  const [confirmingArrival, setConfirmingArrival] = useState(false);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const [currentProviderLocation, setCurrentProviderLocation] = useState<{lat: number, lng: number} | null>(null);

  // 📸 Phase 4: Before/After Photos State
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [beforePhotoPreview, setBeforePhotoPreview] = useState<string | null>(null);
  const [afterPhotoPreview, setAfterPhotoPreview] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // 💰 Insurance (เบี้ยประกัน) — แสดงในหน้าจ้างงาน เมื่อรอชำระเงิน
  const [hasInsurance, setHasInsurance] = useState(false);
  const [insuranceRatePercent, setInsuranceRatePercent] = useState(10);

  // 💰 Phase 5: Escrow Payment State
  const [disputeWindowRemaining, setDisputeWindowRemaining] = useState<string | null>(null);
  const [autoApproving, setAutoApproving] = useState(false);
  const [filingDispute, setFilingDispute] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const beforePhotoInputRef = useRef<HTMLInputElement>(null);
  const afterPhotoInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [paymentHeld, setPaymentHeld] = useState(false);
  const [clientViewedJob, setClientViewedJob] = useState(false);

  const tags = [
    "tag_polite",
    "tag_professional",
    "tag_safe",
    "tag_punctual",
    "tag_service",
  ];
  const isOwner = user?.id === job?.created_by;
  const isAssignedProvider = user?.id === job?.accepted_by;
  const isUserProvider = user?.role === UserRole.PROVIDER;

  // 🔍 Debug: Check Accept Button Visibility
  useEffect(() => {
    if (job && user) {
      console.log("🔍 Accept Button Debug:", {
        isUserProvider,
        userRole: user?.role,
        jobStatus: job?.status,
        isOwner,
        isExpired,
        userId: user?.id,
        jobCreatedBy: job?.created_by,
        shouldShowButton: isUserProvider && job.status === JobStatus.OPEN && !isOwner && !isExpired
      });
    }
  }, [job, user, isUserProvider, isOwner, isExpired]);
  // เพิ่มฟังก์ชันนี้ก่อน return statement
  const calculateDistance = (
    loc1: { lat: number; lng: number },
    loc2: { lat: number; lng: number }
  ): number => {
    const R = 6371; // Radius of the earth in km
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

  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
  };
  // 1. สร้าง custom icon ไว้ก่อน
  const createCustomIcon = (color: string = "blue") => {
    return L.divIcon({
      html: `
      <div style="
        background-color: ${color};
        width: 25px;
        height: 25px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
      ">
        ${color === "blue" ? "📍" : "👤"}
      </div>
    `,
      className: "custom-marker",
      iconSize: [25, 25],
      iconAnchor: [12, 12],
    });
  };
  // เพิ่มฟังก์ชันดึงตำแหน่งปัจจุบัน
  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };
  // ใน JobDetails.tsx
  // เมื่อผู้จ้าง (เจ้าของงาน) โหลดหน้านี้
  useEffect(() => {
    if (isOwner && job?.status === JobStatus.WAITING_FOR_APPROVAL) {
      // บันทึกว่าผู้จ้างได้เห็นงานแล้ว
      markJobAsViewedByClient();
    }
  }, [isOwner, job?.status]);

  const markJobAsViewedByClient = async () => {
    if (!id || !isOwner) return;

    try {
      const jobRef = doc(db, "jobs", id);
      await updateDoc(jobRef, {
        client_viewed_notification: true,
        client_viewed_at: new Date().toISOString(),
        // ✅ เริ่มนับถอยหลัง auto-approve ตั้งแต่นี้!
        auto_approve_start_time: new Date().toISOString(),
      });

      setClientViewedJob(true);
    } catch (error) {
      console.error("Failed to mark job as viewed:", error);
    }
  };
  const handleSaveJob = async () => {
    if (!user || !job) return;

    try {
      const jobInfo = {
        jobId: job.id,
        title: job.title,
        customer: job.created_by_name,
        phone: job.created_by_phone,
        address: job.location.fullAddress,
        price: jobFeeRounded,
        time: job.datetime,
        category: job.category,
        location: job.location,
      };

      const result = await StorageService.saveJobForUser(user.id, jobInfo);

      if (result.success) {
        notify(result.message, "success");
      } else {
        notify(result.message, "info");
      }
    } catch (error) {
      notify("บันทึกงานไม่สำเร็จ", "error");
      console.error("Save job error:", error);
    }
  };

  // ใช้ใน useEffect
  useEffect(() => {
    if (user?.role === UserRole.PROVIDER && job?.location) {
      getCurrentLocation()
        .then(setCurrentLocation)
        .catch(() => {
          // ถ้าไม่ได้ให้ใช้ตำแหน่ง default
          setCurrentLocation({ lat: 13.7563, lng: 100.5018 });
        });
    }
  }, [user?.role, job?.location]);
  useEffect(() => {
    if (
      job?.status === JobStatus.ACCEPTED ||
      job?.status === JobStatus.IN_PROGRESS
    ) {
      setPaymentHeld(true); // ถ้างานถูกจับคู่แล้ว วงเงินควรถูกกันไว้แล้ว
    }
  }, [job]);

  // เบี้ยประกัน: ดึง % จาก Backend ตามหมวดงาน (job.category) — เชื่อมกับ InsuranceManager (Admin เปลี่ยนแล้วยอดตรง)
  const fetchInsuranceRate = useCallback(() => {
    const base = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";
    const category = job?.category ? encodeURIComponent(String(job.category).trim()) : "";
    const url = category ? `${base}/api/settings/insurance-rate?category=${category}` : `${base}/api/settings/insurance-rate`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setInsuranceRatePercent(d.insurance_rate_percent ?? 10))
      .catch(() => setInsuranceRatePercent(10));
  }, [job?.category]);

  useEffect(() => {
    fetchInsuranceRate();
  }, [job?.id, job?.category, fetchInsuranceRate]);

  // เมื่อผู้ใช้กลับมาเปิดแท็บ (เช่น ไปแก้อัตราใน Admin แล้วกลับมา) ให้ดึงอัตราประกันล่าสุด
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && job?.id) fetchInsuranceRate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [job?.id, fetchInsuranceRate]);

  // 💰 Phase 5: Dispute Window Countdown Timer
  useEffect(() => {
    if (!job || job.status !== JobStatus.WAITING_FOR_APPROVAL || !job.dispute_window_ends_at) {
      setDisputeWindowRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const result = PaymentService.checkDisputeWindow(job.dispute_window_ends_at!);
      setDisputeWindowRemaining(result.remainingText);

      // ถ้าหมดเวลา และยังไม่มี dispute -> auto-approve
      if (result.hasEnded && job.dispute_status === 'none' && !autoApproving) {
        console.log('⏱️ Dispute window ended, auto-approving...');
        setAutoApproving(true);
        PaymentService.autoApproveJob(job.id)
          .then(() => {
            console.log('✅ Job auto-approved!');
            notify('✅ งานได้รับการอนุมัติอัตโนมัติ และปล่อยเงินให้ผู้รับงานแล้ว', 'success');
          })
          .catch((err) => {
            console.error('❌ Auto-approve failed:', err);
          })
          .finally(() => {
            setAutoApproving(false);
          });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [job?.status, job?.dispute_window_ends_at, job?.dispute_status, autoApproving]);

  // โหลดงานจาก Backend หรือ Firestore ก่อน (รองรับงานที่สร้างจาก Backend ที่ไม่มีใน Firestore)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    MockApi.getJobDetails(id).then((j) => {
      if (cancelled) return;
      if (j) {
        setJob(j);
      } else {
        navigate("/jobs");
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, navigate]);

  // --- REAL-TIME SUBSCRIPTIONS (อัปเดตเมื่อ Firestore มีข้อมูล — ถ้างานมีแค่ใน Backend จะไม่ได้ null แล้ว redirect)
  useEffect(() => {
    if (!id) return;

    const unsubJob = MockApi.subscribeToJob(id, (updatedJob) => {
      if (updatedJob) {
        setJob(updatedJob);
      }
      setLoading(false);
    });

    const unsubChat = MockApi.subscribeToMessages(id, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    return () => {
      unsubJob();
      unsubChat();
    };
  }, [id]);
  // 🚗 Auto-start Location Tracking สำหรับ Provider เมื่อรับงาน
  useEffect(() => {
    // ✅ เริ่ม tracking เมื่อ Provider รับงานแล้ว (status = accepted หรือ in_progress)
    if (
      user?.id &&
      job?.id &&
      isAssignedProvider &&
      (job.status === 'accepted' || job.status === 'in_progress') &&
      !locationWatchId
    ) {
      console.log('🚀 Starting location tracking for Provider:', user.id);
      
      const watchId = LocationService.startTracking(
        user.id,
        job.id,
        (error) => {
          console.error('❌ Geolocation error:', error);
          notify('ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาเปิด GPS', 'error');
        }
      );
      
      if (watchId) {
        setLocationWatchId(watchId);
        setIsLocationTracking(true);
        notify('📍 เริ่มติดตามตำแหน่งแล้ว', 'success');
      }
    }

    // 🛑 หยุด tracking เมื่องานเสร็จสิ้น
    if (
      locationWatchId &&
      job?.status &&
      !['accepted', 'in_progress'].includes(job.status)
    ) {
      console.log('🛑 Stopping location tracking');
      LocationService.stopTracking(locationWatchId);
      setLocationWatchId(null);
      setIsLocationTracking(false);
    }

    // Cleanup on unmount
    return () => {
      if (locationWatchId) {
        LocationService.stopTracking(locationWatchId);
        setLocationWatchId(null);
        setIsLocationTracking(false);
      }
    };
  }, [user?.id, job?.id, job?.status, isAssignedProvider, locationWatchId]);

  // 📍 Calculate distance to destination for arrival confirmation
  useEffect(() => {
    if (!isAssignedProvider || !job?.location || job.status !== 'accepted') return;

    // Subscribe to provider's location to check distance
    const unsubscribe = LocationService.subscribeToProviderLocation(
      user!.id,
      job.id,
      (location) => {
        if (location && job.location) {
          const distance = LocationService.calculateDistance(
            location.lat,
            location.lng,
            job.location.lat,
            job.location.lng
          );
          setDistanceToDestination(distance);
          setCurrentProviderLocation({ lat: location.lat, lng: location.lng });
          
          console.log('📏 Distance to destination:', distance, 'km');
        }
      }
    );

    return () => unsubscribe();
  }, [isAssignedProvider, user?.id, job?.id, job?.location, job?.status]);

  // Expiration Timer Logic
  useEffect(() => {
    if (job && job.status === JobStatus.OPEN) {
      const createdAt = new Date(job.created_at || job.datetime).getTime();
      const expiration = createdAt + 24 * 60 * 60 * 1000;

      const timer = setInterval(() => {
        const now = Date.now();
        const diff = expiration - now;

        if (diff <= 0) {
          setIsExpired(true);
          setExpirationTime("00:00:00");
          clearInterval(timer);
          
          // 🔥 Auto-cancel job when expired
          if (id && job.status === JobStatus.OPEN) {
            MockApi.cancelJob(id, "Job expired after 24 hours")
              .then(() => notify("งานหมดอายุและถูกยกเลิกอัตโนมัติ", "info"))
              .catch((error) => console.error("Failed to auto-cancel:", error));
          }
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setExpirationTime(
            `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
          );
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [job, id, notify]);

  // Cancellation Countdown Logic
  useEffect(() => {
    let timer: any;
    if (showCancelModal && cancelSeconds > 0) {
      timer = setInterval(() => {
        setCancelSeconds((prev) => prev - 1);
      }, 1000);
    } else if (showCancelModal && cancelSeconds === 0) {
      // Time's up, perform cancellation
      performCancellation();
    }
    return () => clearInterval(timer);
  }, [showCancelModal, cancelSeconds]);
  // เริ่มนับถอยหลังเมื่อผู้จ้างเปิดดูงาน
useEffect(() => {
  const startTimerIfNeeded = async () => {
    if (!id || !job || !isOwner) return;
    
    // เฉพาะเมื่องานรออนุมัติ และยังไม่ได้เริ่ม timer
    if (job.status === JobStatus.WAITING_FOR_APPROVAL && !job.auto_approve_start_time) {
      console.log("🕒 Starting auto-approve timer for job:", id);
      
      try {
        const jobRef = doc(db, "jobs", id);
        await updateDoc(jobRef, {
          auto_approve_start_time: new Date().toISOString(),
        });
        console.log("✅ Timer started at:", new Date().toISOString());
      } catch (error) {
        console.error("❌ Failed to start timer:", error);
      }
    }
  };

  startTimerIfNeeded();
}, [id, job, isOwner]);

  // Auto-Approve Countdown Logic
  // Auto-approve countdown
useEffect(() => {
  let interval: NodeJS.Timeout;
  
  if (job?.status === JobStatus.WAITING_FOR_APPROVAL && job.auto_approve_start_time) {
    console.log("⏰ Auto-approve timer started from:", job.auto_approve_start_time);
    
    interval = setInterval(() => {
      const startTime = new Date(job.auto_approve_start_time!).getTime();
      const autoApproveDeadline = startTime + 5 * 60 * 1000; // 5 นาที
      const now = Date.now();
      const diff = autoApproveDeadline - now;

      if (diff <= 0) {
        console.log("🔄 Auto-approve time's up!");
        clearInterval(interval);
        handleSystemAutoApprove();
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        setAutoApproveTime(timeString);
        console.log("⏱️ Time remaining:", timeString);
      }
    }, 1000);
  } else if (job?.status === JobStatus.WAITING_FOR_APPROVAL && !job.auto_approve_start_time) {
    console.log("⚠️ Waiting for auto_approve_start_time to be set...");
  } else {
    setAutoApproveTime(null);
  }

  return () => {
    if (interval) clearInterval(interval);
  };
}, [job]);

  const handleSystemAutoApprove = async () => {
    if (!job || !id || processingPay) {
      console.log("Auto-approve: Missing job, id, or already processing");
      return;
    }
    console.log("Auto-approve triggered for job:", id);
    try {
      // 1. อนุมัติงานก่อน
      const approveSuccess = await MockApi.approveJob(id);
      if (!approveSuccess) {
        console.error("Failed to auto-approve job");
        return;
      }

      // 2. โอนเงิน (processPayment return UserProfile) — ส่ง has_insurance ถ้าผู้จ้างติ๊กซื้อประกัน
      const updatedUser = await MockApi.processPayment(
        id,
        PaymentMethod.WALLET,
        0,
        hasInsurance
      );
      // 2b. ปล่อยเงินเข้า wallet ผู้รับ (pending → balance)
      try {
        await MockApi.releasePayment(id);
      } catch (releaseErr: any) {
        console.warn('Release payment failed:', releaseErr?.message);
      }

      // 3. แจ้งเตือน
      notify(t("detail.system_approved") || "ระบบอนุมัติงานอัตโนมัติ", "info");

      // 4. อัปเดตข้อมูลผู้ใช้ถ้าผู้จ้างเป็นเจ้าของ job
      if (user?.role === UserRole.USER && user.id === job.created_by && token) {
        login(updatedUser, token);
      }

      // 5. แสดง modal รีวิว (ถ้าเป็นเจ้าของงาน)
      if (user?.id === job.created_by) {
        setTimeout(() => {
          setShowReviewModal(true);
        }, 2000);
      }
    } catch (e: any) {
      console.error("Auto-approve failed", e);
      // ไม่ต้อง notify เพราะเป็นระบบอัตโนมัติ
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;
    const text = newMessage;
    setNewMessage("");
    await MockApi.sendMessage(id, text);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && id) {
      const file = e.target.files[0];
      try {
        notify("Uploading image...", "info");
        const url = await MockApi.uploadImage(file);
        await MockApi.sendMessage(id, url, MessageType.IMAGE);
        notify("Image sent", "success");
      } catch (err) {
        notify("Failed to upload image", "error");
      }
    }
  };

  const handleAcceptJob = async () => {
    if (!id || !user || !job) return;
    try {
      // 1. ยอมรับงานก่อน (backend หรือ Firestore) — งานที่ Bob โพสต์อยู่ที่ backend
      await MockApi.acceptJob(id);

      // 2. กันเงินจาก Employer (Firestore) — ข้ามอัตโนมัติถ้างานไม่มีใน Firestore
      try {
        const holdSuccess = await PaymentService.holdPayment(
          id,
          jobFeeRounded,
          job.created_by,
          user.id
        );
        if (!holdSuccess) console.warn('Hold payment returned false');
      } catch (holdErr: any) {
        console.warn('Hold payment skipped or failed:', holdErr?.message);
      }

      notify("✅ " + t("detail.action_success"), "success");
      console.log('✅ Job accepted');
    } catch (err: any) {
      console.error('❌ Error accepting job:', err);
      notify(err.message || "Failed to accept job", "error");
    }
  };

  // 📍 Phase 3: Confirm Arrival
  const handleConfirmArrival = async () => {
    if (!id || !user || !isAssignedProvider) return;

    // ✅ ตรวจสอบระยะทาง (ต้องใกล้จุดหมาย < 0.5 km หรือ 500 เมตร)
    if (distanceToDestination !== null && distanceToDestination > 0.5) {
      notify(`⚠️ คุณยังอยู่ห่างจากจุดหมาย ${distanceToDestination.toFixed(2)} km กรุณาเดินทางให้ใกล้กว่า 500 เมตรก่อน`, 'error');
      return;
    }

    try {
      setConfirmingArrival(true);
      
      // Update job status to in_progress and record arrival time
      await FirebaseApi.confirmArrival(id, user.id);
      
      // Update provider location status to 'arrived'
      if (currentProviderLocation) {
        await LocationService.updateProviderStatus(user.id, id, 'arrived');
      }
      
      notify('✅ ยืนยันการมาถึงสำเร็จ! เริ่มทำงานได้เลย', 'success');
      
      console.log('✅ Arrival confirmed at:', new Date().toISOString());
    } catch (error) {
      console.error('❌ Error confirming arrival:', error);
      notify('ไม่สามารถยืนยันการมาถึงได้', 'error');
    } finally {
      setConfirmingArrival(false);
    }
  };

  // 📸 Handle Before Photo Upload
  const handleBeforePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBeforePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBeforePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 📸 Handle After Photo Upload
  const handleAfterPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAfterPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAfterPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 📸 Upload Photos to Storage
  const handleUploadPhotos = async () => {
    if (!id || !user || !beforePhoto || !afterPhoto) {
      notify('❌ กรุณาถ่ายรูปทั้งก่อนและหลังทำงาน', 'error');
      return;
    }

    try {
      setUploadingPhotos(true);

      // Upload Before Photo
      console.log('📤 Uploading before photo...');
      const beforeUrl = await StorageService.uploadJobProof(id, beforePhoto, 'before');
      
      // Upload After Photo
      console.log('📤 Uploading after photo...');
      const afterUrl = await StorageService.uploadJobProof(id, afterPhoto, 'after');

      // Update job with photo URLs
      await updateDoc(doc(db, 'jobs', id), {
        before_photo_url: beforeUrl,
        after_photo_url: afterUrl,
        photos_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      notify('✅ อัปโหลดรูปสำเร็จ!', 'success');
      console.log('✅ Photos uploaded:', { beforeUrl, afterUrl });
    } catch (error) {
      console.error('❌ Error uploading photos:', error);
      notify('ไม่สามารถอัปโหลดรูปได้', 'error');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleSubmitWork = async () => {
    if (!id || !job) return;

    // ✅ Phase 4: ตรวจสอบว่ามี Before/After Photos หรือยัง
    if (!job.before_photo_url || !job.after_photo_url) {
      notify('❌ กรุณาอัปโหลดรูปก่อนและหลังทำงานก่อนส่งงาน', 'error');
      return;
    }

    if (navigator.geolocation) {
      setGpsVerifying(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const currentLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          try {
            // ส่งงาน (Safety: งาน Physical ส่ง otpCode ถ้ามี จาก Employer)
            await MockApi.markJobAsDone(id, currentLoc, completionOtp.trim() || undefined);
            
            // 💰 Phase 5: เริ่ม 5-minute Dispute Window
            console.log('⏱️ Starting 5-minute dispute window...');
            const disputeEndsAt = await PaymentService.startDisputeWindow(id);
            console.log('✅ Dispute window ends at:', disputeEndsAt);
            
            notify("✅ " + t("detail.action_success") + " - รอการอนุมัติ 5 นาที", "success");
          } catch (err: any) {
            console.error('❌ Error submitting work:', err);
            alert(`Error: ${err.message || "Failed to submit"}`);
          } finally {
            setGpsVerifying(false);
          }
        },
        (err) => {
          setGpsVerifying(false);
          alert("Please enable GPS to verify you are at the job location.");
        }
      );
    } else {
      alert("Geolocation is not supported.");
    }
  };
  const handleApproveWork = async () => {
    if (!id || !job || !user) return;

    if (!hasReviewedProof) {
      alert("กรุณาตรวจสอบรูปหลักฐานงานก่อนอนุมัติ");
      return;
    }

    const confirmMsg = hasInsurance
      ? `ยืนยันการอนุมัติงานและโอนเงิน ${totalPrice.toLocaleString()} บาท (รวมค่าประกัน ${insuranceAmount.toLocaleString()} บาท) ให้ผู้รับงาน?`
      : `ยืนยันการอนุมัติงานและโอนเงิน ${jobFeeRounded} บาทให้ผู้รับงาน?`;
    if (window.confirm(confirmMsg)) {
      setProcessingPay(true);
      try {
        // 1. อนุมัติงาน
        const approveSuccess = await MockApi.approveJob(id);
        if (!approveSuccess) {
          notify("อนุมัติงานไม่สำเร็จ", "error");
          return;
        }

        // 2. โอนเงินให้ผู้รับงาน — ส่ง has_insurance ถ้าติ๊กซื้อประกัน
        const updatedUser = await MockApi.processPayment(
          id,
          PaymentMethod.WALLET,
          0,
          hasInsurance
        );

        // 2b. ปล่อยเงินจาก escrow เข้า wallet ผู้รับงาน (pending → balance)
        try {
          await MockApi.releasePayment(id);
        } catch (releaseErr: any) {
          console.warn('Release payment (pending→balance) failed:', releaseErr?.message);
        }

        if (token) {
          login(updatedUser, token);

          // ✅ 3. อัปเดต status เป็น COMPLETED (สำคัญมาก!)
          console.log('✅ Updating job status to COMPLETED...');
          await updateDoc(doc(db, 'jobs', id), {
            status: JobStatus.COMPLETED,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          console.log('✅ Job marked as COMPLETED successfully!');

          notify("อนุมัติงานและโอนเงินเรียบร้อยแล้ว", "success");

          // 4. แสดง modal รีวิวหลังจากอนุมัติ
          setTimeout(() => {
            setShowReviewModal(true);
          }, 1500);

          // 5. อัปเดตข้อมูลผู้ใช้
          if (token) {
            const updatedUser = await MockApi.getProfile(user.id);
            login(updatedUser, token);
          }
        } else {
          notify("โอนเงินไม่สำเร็จ", "error");
        }
      } catch (error: any) {
        notify(error.message || "อนุมัติงานไม่สำเร็จ", "error");
      } finally {
        setProcessingPay(false);
      }
    }
  };

  const handleCancelClick = () => {
    setCancelSeconds(10);
    setShowCancelModal(true);
  };

  const performCancellation = async () => {
    if (!id || !job) return;
    try {
      await MockApi.cancelJob(id);
      notify(t("detail.action_success"), "success");
    } catch (err: any) {
      const msg = err?.message || "Failed to cancel";
      notify(msg, "error");
    } finally {
      setShowCancelModal(false);
    }
  };

  const handlePay = () => {
    if (!id) return;
    navigate(`/payment/${id}`);
  };

  // 🧪 TEST MODE: Quick Complete Job for Testing
  const handleQuickCompleteForTest = async () => {
    if (!id || !job || !user) return;

    const confirmTest = window.confirm(
      '🧪 TEST MODE: ต้องการทดสอบระบบให้งานเสร็จสิ้นทันทีหรือไม่?\n\n' +
      'จะทำการ:\n' +
      '0. Confirm Arrival (ถ้ายังไม่ได้ยืนยัน)\n' +
      '1. Upload mock photos (before/after)\n' +
      '2. Submit work\n' +
      '3. Approve work (auto)\n' +
      '4. Mark as COMPLETED\n\n' +
      '⚠️ สำหรับทดสอบเท่านั้น!'
    );

    if (!confirmTest) return;

    try {
      setUploadingPhotos(true);
      notify('🧪 TEST MODE: เริ่มทดสอบ...', 'info');

      const jobRef = doc(db, 'jobs', id);

      // 0. Confirm Arrival (ถ้า status ยังเป็น ACCEPTED)
      if (job.status === JobStatus.ACCEPTED) {
        console.log('🧪 TEST: Step 0 - Confirming arrival...');
        await updateDoc(jobRef, {
          status: JobStatus.IN_PROGRESS,
          arrived_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        notify('✅ TEST: Arrival confirmed!', 'success');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 1. สร้าง Mock Photos (1x1 pixel base64 images)
      const mockBeforePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const mockAfterPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

      console.log('🧪 TEST: Step 1 - Uploading mock photos...');
      
      // อัปเดต job ด้วย mock photo URLs
      await updateDoc(jobRef, {
        before_photo_url: mockBeforePhoto,
        after_photo_url: mockAfterPhoto,
        photos_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      notify('✅ TEST: Mock photos uploaded!', 'success');
      
      // รอ 500ms
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. Submit Work
      console.log('🧪 TEST: Step 2 - Submitting work...');
      await updateDoc(jobRef, {
        status: JobStatus.WAITING_FOR_APPROVAL,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      notify('✅ TEST: Work submitted!', 'success');
      
      // รอ 500ms
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. Auto Approve (จำลอง employer กด approve)
      console.log('🧪 TEST: Step 3 - Auto approving work...');
      await updateDoc(jobRef, {
        status: JobStatus.WAITING_FOR_PAYMENT,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      notify('✅ TEST: Work approved!', 'success');
      
      // รอ 500ms
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. Mark as COMPLETED (จำลองจ่ายเงิน)
      console.log('🧪 TEST: Step 4 - Marking as completed...');
      await updateDoc(jobRef, {
        status: JobStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      notify('✅ TEST: Job completed! ตรวจสอบ History Tab ได้เลย!', 'success');
      
      console.log('🧪 TEST: All steps completed successfully!');
      console.log('🧪 TEST: ไปที่ My Jobs → History Tab เพื่อดูงานที่เสร็จแล้ว');

    } catch (error: any) {
      console.error('❌ TEST ERROR:', error);
      notify('❌ TEST ERROR: ' + error.message, 'error');
    } finally {
      setUploadingPhotos(false);
    }
  };
  // หรือในฟังก์ชัน handleApproveAndPay (เมื่อจ่ายเงินแล้ว)
  const handleApproveAndPay = async () => {
    if (!id || !job || !user) return;

    if (!hasReviewedProof) {
      alert(
        "Please review the proof of work image in the chat before approving."
      );
      return;
    }

    const confirmMsg = t("detail.auto_pay_confirm").replace(
      "{amount}",
      String(hasInsurance ? totalPrice : jobFeeRounded)
    );
    if (window.confirm(confirmMsg)) {
      setProcessingPay(true);
      try {
        // 1. อนุมัติงานก่อน
        const approveResult = await MockApi.approveJob(id);
        if (!approveResult) {
          notify("อนุมัติงานไม่สำเร็จ", "error");
          return;
        }

        // 2. โอนเงินให้ผู้รับงาน — ส่ง has_insurance ถ้าติ๊กซื้อประกัน
        const updatedUser = await MockApi.processPayment(
          id,
          PaymentMethod.WALLET,
          0,
          hasInsurance
        );
        // 2b. ปล่อยเงินเข้า wallet ผู้รับ (pending → balance)
        try {
          await MockApi.releasePayment(id);
        } catch (releaseErr: any) {
          console.warn('Release payment failed:', releaseErr?.message);
        }
        // อัปเดตข้อมูลผู้ใช้
        if (token) login(updatedUser, token);
        notify(t("detail.instant_pay_success"), "success");
        if (job.accepted_by) {
          setTimeout(() => {
            setShowReviewModal(true);
          }, 1500);
        }
      } catch (error: any) {
        notify(error.message || "Payment failed", "error");
      } finally {
        setProcessingPay(false);
      }
    }
  };
  const onReviewSubmitted = () => {
    // 1. ปิด modal
    setShowReviewModal(false);

    // 2. แสดงข้อความสำเร็จ
    notify("รีวิวของคุณถูกบันทึกเรียบร้อยแล้ว", "success");

    // 3. เก็บใน localStorage เพื่อไม่ให้แสดง modal ซ้ำ
    if (job?.id) {
      localStorage.setItem(`job_reviewed_${job.id}`, "true");
    }

    // 4. รีเซ็ตฟอร์ม (ถ้ายังไม่ได้ทำใน handleSubmitReview)
    setReviewRating(0);
    setReviewComment("");
    setReviewTags([]);
  };
  const toggleTag = (tag: string) => {
    if (reviewTags.includes(tag)) {
      setReviewTags((prev) => prev.filter((t) => t !== tag));
    } else {
      setReviewTags((prev) => [...prev, tag]);
    }
  };

  // ⭐ Phase 6: Updated Review Submission Handler
  const handleSubmitReview = async () => {
    if (!id || !job || !job.accepted_by || !user) {
      notify("ข้อมูลไม่ครบถ้วน", "error");
      return;
    }

    if (reviewRating === 0) {
      notify("❌ กรุณาให้ดาวคะแนน", "error");
      return;
    }

    setSubmittingReview(true);
    try {
      // ⭐ Use ReviewService instead of MockApi
      await ReviewService.submitReview({
        job_id: id,
        reviewer_id: user.id,
        reviewer_name: user.name || 'ผู้ใช้งาน',
        reviewee_id: job.accepted_by,
        reviewer_type: 'employer',
        reviewee_type: 'provider',
        target_user_id: job.accepted_by,
        rating: reviewRating,
        comment: reviewComment,
        tags: reviewTags,
        is_verified_job: true
      });

      notify(`✅ ส่งรีวิวสำเร็จ! คุณให้ ${reviewRating} ดาว`, "success");

      // ส่ง notification ให้ผู้รับงาน (non-critical)
      try {
        await MockApi.sendNotification({
          user_id: job.accepted_by,
          title: "⭐ คุณได้รับรีวิวใหม่!",
          message: `${user.name} ให้คะแนนคุณ ${reviewRating} ดาว สำหรับงาน "${job.title}"`,
          type: "system",
          related_id: id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      } catch (notifErr) {
        console.log('Notification failed (non-critical):', notifErr);
      }

      // ปิด modal และรีเซ็ตข้อมูล
      setTimeout(() => {
        setShowReviewModal(false);
        setReviewRating(0);
        setReviewComment("");
        setReviewTags([]);

        // อัปเดตหน้าจอเพื่อแสดงรีวิวใหม่
        if (onReviewSubmitted) {
          onReviewSubmitted();
        }
      }, 1500);
    } catch (error: any) {
      console.error("Submit review error:", error);
      notify(error.message || "ส่งรีวิวไม่สำเร็จ", "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleReportProblem = async () => {
    if (!id || !disputeReason.trim()) return;
    setSubmittingDispute(true);
    try {
      await MockApi.reportJob(id, disputeReason);
      notify(t("detail.dispute_submitted"), "success");
      setShowDisputeModal(false);
    } catch (err) {
      notify("Failed to submit report", "error");
    } finally {
      setSubmittingDispute(false);
    }
  };

  // ⭐ Phase 6: Updated Tip Handler
  const handleSendTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !job || !user || !tipAmount || isNaN(Number(tipAmount))) return;

    if (!job.accepted_by) {
      notify("❌ ไม่พบผู้รับงาน", "error");
      return;
    }

    const amount = Number(tipAmount);
    if (amount < 10) {
      notify("❌ ทิปขั้นต่ำ 10 บาท", "error");
      return;
    }

    setSendingTip(true);
    try {
      // ⭐ Use ReviewService
      await ReviewService.sendTip(id, user.id, job.accepted_by, amount);
      notify(`✅ ส่งทิป ${amount} บาทสำเร็จ!`, "success");
      setShowTipModal(false);
      setTipAmount("");
      if (user && token) {
        const updatedProfile = await MockApi.getProfile(user.id);
        login(updatedProfile, token);
      }
    } catch (e: any) {
      notify(e.message || "Failed to send tip", "error");
    } finally {
      setSendingTip(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${job?.title} | Meerak App`,
      text: `Check out this job: ${job?.title}. Budget: ${job?.price} THB.`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      setShowShareModal(true);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    notify(t("detail.link_copied"), "success");
    setShowShareModal(false);
  };

  const openSocialShare = (platform: "facebook" | "twitter" | "line") => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(
      `Check out this job: ${job?.title} on Meerak!`
    );
    let shareUrl = "";

    if (platform === "facebook")
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    if (platform === "twitter")
      shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    if (platform === "line")
      shareUrl = `https://social-plugins.line.me/lineit/share?url=${url}`;

    window.open(shareUrl, "_blank", "width=600,height=400");
    setShowShareModal(false);
  };

  const handleViewProof = (url: string) => {
    setHasReviewedProof(true);
    window.open(url, "_blank");
  };

  // Placeholder handlers for In-Progress Actions
  const handleUpdateProgress = () =>
    notify(t("action.update_progress") + " (Mock)", "info");
  const handleUploadProof = () => fileInputRef.current?.click();
  const handleViewDetails = () =>
    notify(job?.description || "No details", "info");
  const handleReportIssue = () => setShowDisputeModal(true);

  // 💰 Phase 5: Handle Dispute Filing
  const handleFileDispute = async () => {
    if (!id || !user || !job || !disputeReason.trim()) {
      notify('❌ กรุณาระบุเหตุผลในการยื่น dispute', 'error');
      return;
    }

    try {
      setFilingDispute(true);
      await PaymentService.fileDispute(id, user.id, disputeReason);
      try {
        await MockApi.createDisputeSupportTicket(id, user.id, disputeReason);
      } catch (e) {
        console.warn('Support ticket creation failed:', e);
      }
      notify('✅ ยื่น Dispute สำเร็จ - ระบบจะพิจารณาภายใน 24-48 ชั่วโมง', 'success');
      setShowDisputeModal(false);
      setDisputeReason('');
    } catch (err: any) {
      console.error('❌ Error filing dispute:', err);
      notify(err.message || 'ไม่สามารถยื่น dispute ได้', 'error');
    } finally {
      setFilingDispute(false);
    }
  };

  // 💰 Phase 5: Handle Provider Withdrawal Request
  const handleRequestWithdrawal = async () => {
    if (!id || !user || !job) return;

    if (!job.payment_released) {
      notify('❌ ยังไม่สามารถถอนเงินได้ กรุณารอการอนุมัติงาน', 'error');
      return;
    }

    const confirmMsg = `ยืนยันการขอถอนเงิน ${jobFeeRounded} บาท?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await PaymentService.requestWithdrawal(id, user.id);
      notify('✅ ขอถอนเงินสำเร็จ - ระบบจะโอนเงินภายใน 24 ชั่วโมง', 'success');
    } catch (err: any) {
      console.error('❌ Error requesting withdrawal:', err);
      notify(err.message || 'ไม่สามารถขอถอนเงินได้', 'error');
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center">
        {t("common.loading") || "Loading..."}
      </div>
    );
  if (!job)
    return (
      <div className="p-8 text-center">
        {t("detail.not_found") || "Job not found"}
      </div>
    );



  const round2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const jobFeeRounded = job ? round2(job.price) : 0;
  const insuranceAmount = job && hasInsurance ? round2(jobFeeRounded * (insuranceRatePercent / 100)) : 0;
  const totalPrice = job ? round2(jobFeeRounded + insuranceAmount) : 0;
  const canAutoPay = (user?.wallet_balance || 0) >= totalPrice;
  const hasProof = messages.some(
    (m) => m.sender_id === user?.id && m.type === MessageType.IMAGE
  );

  const otherAvatar = isAssignedProvider
    ? job.created_by_avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        job.created_by_name || "User"
      )}&background=pink&color=fff`
    : `https://ui-avatars.com/api/?name=Provider&background=pink&color=fff`;
  // 1. เอาไปวางไว้ใต้ useState ทั้งหมด แต่ก่อน return JSX

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
      {/* Share Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in slide-in-from-bottom-10 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {t("detail.share_via")}
              </h3>
              <button onClick={() => setShowShareModal(false)}>
                <XCircle className="text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <button
                onClick={() => openSocialShare("facebook")}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center">
                  <Facebook size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  Facebook
                </span>
              </button>
              <button
                onClick={() => openSocialShare("line")}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-[#00C300] text-white rounded-full flex items-center justify-center">
                  <MessageCircle size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">LINE</span>
              </button>
              <button
                onClick={() => openSocialShare("twitter")}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-sky-500 text-white rounded-full flex items-center justify-center">
                  <Twitter size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  Twitter
                </span>
              </button>
              <button
                onClick={copyToClipboard}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center">
                  <Copy size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">Copy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tip Modal */}
      {showTipModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <Heart className="text-pink-500 mr-2 fill-current" /> Send Tip /
                Extra
              </h3>
              <button onClick={() => setShowTipModal(false)}>
                <XCircle className="text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Love the service? Or need to pay for overtime? Send an extra tip
              directly to the provider.
            </p>

            <div className="bg-pink-50 p-4 rounded-xl mb-4 border border-pink-100">
              <div className="text-xs font-bold text-pink-700 uppercase mb-1">
                Your Wallet Balance
              </div>
              <div className="text-xl font-bold text-pink-900">
                {user?.wallet_balance?.toLocaleString()} THB
              </div>
            </div>

            <form onSubmit={handleSendTip}>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Amount (THB)
              </label>
              <input
                type="number"
                className="w-full p-3 border border-gray-300 rounded-lg text-lg font-bold mb-4 focus:ring-2 focus:ring-pink-500 outline-none"
                placeholder="e.g. 100"
                required
                min="1"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
              />
              <button
                type="submit"
                disabled={
                  sendingTip ||
                  !tipAmount ||
                  (user?.wallet_balance || 0) < Number(tipAmount)
                }
                className="w-full py-3 bg-pink-500 text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50 flex items-center justify-center shadow-lg shadow-pink-200"
              >
                {sendingTip ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Confirm Tip"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cancellation Countdown Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 text-center p-8">
            <div className="w-20 h-20 rounded-full border-4 border-red-500 flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl font-bold text-red-600">
                {cancelSeconds}
              </span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {t("detail.cancelling_title")}
            </h3>
            <p className="text-gray-500 mb-6">
              {t("detail.cancelling_desc")} {cancelSeconds}s
            </p>
            <button
              onClick={() => setShowCancelModal(false)}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
            >
              {t("detail.keep_job")}
            </button>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <AlertOctagon className="text-red-500 mr-2" />{" "}
                {t("detail.report")}
              </h3>
              <button onClick={() => setShowDisputeModal(false)}>
                <XCircle className="text-gray-400" />
              </button>
            </div>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-red-500 outline-none"
              rows={4}
              placeholder="What went wrong?"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <button
              onClick={handleReportProblem}
              disabled={submittingDispute || !disputeReason.trim()}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center"
            >
              {submittingDispute ? (
                <Loader2 className="animate-spin" />
              ) : (
                t("detail.report")
              )}
            </button>
          </div>
        </div>
      )}
      {/* Review Modal - แบบสมบูรณ์ */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-6 text-center text-white">
              <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <Star
                  size={32}
                  className="text-yellow-300"
                  fill="currentColor"
                />
              </div>
              <h3 className="text-xl font-bold">รีวิวผู้รับงาน</h3>
              <p className="text-emerald-100 text-sm mt-1">
                ช่วยให้คะแนนและรีวิว {job?.accepted_by_name || "ผู้รับงาน"}
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Star Rating */}
              <div className="flex justify-center space-x-1 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className="transition-transform hover:scale-125 focus:outline-none"
                  >
                    <Star
                      size={40}
                      fill={star <= reviewRating ? "#FBBF24" : "none"}
                      className={
                        star <= reviewRating
                          ? "text-yellow-400"
                          : "text-gray-300"
                      }
                    />
                  </button>
                ))}
              </div>

              {/* Rating Text */}
              <div className="text-center mb-6">
                <p className="text-lg font-bold text-gray-800">
                  {reviewRating === 5
                    ? "ยอดเยี่ยมมาก! ⭐⭐⭐⭐⭐"
                    : reviewRating === 4
                    ? "ดีมาก! ⭐⭐⭐⭐"
                    : reviewRating === 3
                    ? "ดี ⭐⭐⭐"
                    : reviewRating === 2
                    ? "พอใช้ ⭐⭐"
                    : reviewRating === 1
                    ? "ต้องปรับปรุง ⭐"
                    : "ให้ดาวเลย!"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {reviewRating > 0
                    ? "ขอบคุณสำหรับการให้คะแนน!"
                    : "เลือกระดับดาว"}
                </p>
              </div>

              {/* Tags */}
              <div className="mb-6">
                <p className="text-sm font-bold text-gray-700 mb-3 text-center">
                  เลือกข้อดีของผู้รับงาน (เลือกได้หลายข้อ)
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    {
                      key: "professional",
                      label: "🧑‍💼 เป็นมืออาชีพ",
                      icon: "briefcase",
                    },
                    { key: "punctual", label: "⏰ ตรงเวลา", icon: "clock" },
                    { key: "friendly", label: "😊 นิสัยดี", icon: "smile" },
                    { key: "quality", label: "✨ งานคุณภาพ", icon: "award" },
                    {
                      key: "communicate",
                      label: "💬 ติดต่อดี",
                      icon: "message-circle",
                    },
                    {
                      key: "clean",
                      label: "🧹 สะอาดเรียบร้อย",
                      icon: "sparkles",
                    },
                  ].map((tag) => (
                    <button
                      key={tag.key}
                      onClick={() => {
                        const newTag = tag.label;
                        if (reviewTags.includes(newTag)) {
                          setReviewTags((prev) =>
                            prev.filter((t) => t !== newTag)
                          );
                        } else {
                          setReviewTags((prev) => [...prev, newTag]);
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-all flex items-center ${
                        reviewTags.includes(tag.label)
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm scale-105"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {reviewTags.includes(tag.label) && (
                        <CheckCircle
                          size={12}
                          className="mr-1 text-emerald-600"
                        />
                      )}
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ความคิดเห็นเพิ่มเติม (ถ้ามี)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="บอกเล่าประสบการณ์ในการใช้บริการ..."
                  rows={3}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  ความคิดเห็นของคุณจะช่วยให้ผู้รับงานพัฒนาตนเอง
                </p>
              </div>

              {/* Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    // บันทึกว่าได้ข้ามรีวิวแล้ว
                    localStorage.setItem(`skipped_review_${job?.id}`, "true");
                  }}
                  className="flex-1 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-xl transition-colors"
                >
                  ข้ามไปก่อน
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={submittingReview || reviewRating === 0}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:from-emerald-600 hover:to-green-600 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={18} />
                      กำลังส่ง...
                    </>
                  ) : (
                    "ส่งรีวิว"
                  )}
                </button>
              </div>

              {/* Tips */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    setShowTipModal(true);
                  }}
                  className="text-sm text-pink-600 hover:text-pink-700 font-medium inline-flex items-center"
                >
                  <Heart className="mr-1" size={14} />
                  หรือส่งทิปให้ผู้รับงาน?
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Info Column */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className={`p-6 border-b border-gray-50 text-white ${
              job.status === JobStatus.CANCELLED
                ? "bg-gray-500"
                : job.status === JobStatus.DISPUTE
                ? "bg-red-600"
                : "bg-emerald-600"
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <span
                  className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 opacity-90 ${
                    job.status === JobStatus.CANCELLED
                      ? "bg-gray-600"
                      : job.status === JobStatus.DISPUTE
                      ? "bg-red-800"
                      : "bg-emerald-700"
                  }`}
                >
                  {t(`cat.${job.category}`) || job.category}
                </span>
                <h1 className="text-2xl font-bold">{job.title}</h1>
              </div>
              <div className="text-right">
                <button
                  onClick={handleShare}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors mb-2 ml-auto block"
                >
                  <Share2 size={20} />
                </button>
                <p className="text-3xl font-bold flex items-center justify-end">
                  {jobFeeRounded}{" "}
                  <span className="text-sm ml-1 font-normal opacity-80">
                    {t("detail.thb")}
                  </span>
                </p>
                {job.tips_amount && job.tips_amount > 0 ? (
                  <p className="text-sm text-emerald-100 flex items-center justify-end mt-1">
                    <Heart size={12} className="mr-1 fill-current" /> +{" "}
                    {job.tips_amount} Tips
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Expiration Timer */}
            {job.status === JobStatus.OPEN && (
              <div
                className={`p-3 rounded-lg flex items-center justify-between ${
                  isExpired
                    ? "bg-red-50 text-red-800"
                    : "bg-blue-50 text-blue-800"
                }`}
              >
                <div className="flex items-center">
                  <Timer size={18} className="mr-2" />
                  <span className="font-bold text-sm">
                    {isExpired ? t("detail.expired") : t("detail.expires_in")}
                  </span>
                </div>
                <span className="font-mono font-bold text-lg">
                  {expirationTime || "--:--:--"}
                </span>
              </div>
            )}

            {/* Status Banners */}
            {job.status === JobStatus.CANCELLED && (
              <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-100 flex items-center justify-center font-bold">
                <XCircle className="mr-2" /> {t("detail.cancelled")}
              </div>
            )}

            {job.status === JobStatus.DISPUTE && (
              <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-100 flex items-center justify-center font-bold animate-pulse">
                <AlertOctagon className="mr-2" /> {t("detail.under_review")}
              </div>
            )}

            {(job.status === JobStatus.ACCEPTED ||
              job.status === JobStatus.IN_PROGRESS) && (
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg border border-blue-100 flex items-center">
                <CheckCircle className="mr-2" /> {t("detail.accepted")}
              </div>
            )}

            {job.status === JobStatus.WAITING_FOR_APPROVAL && (
              <div className="bg-purple-50 text-purple-800 p-4 rounded-lg border border-purple-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <Hourglass className="mr-2" />
                    <span className="font-bold">
                      {t("รอการตรวจสอบผลงาน") || "รอการตรวจสอบผลงาน"}
                    </span>
                  </div>

                  {/* ✅ แสดง badge สถานะ */}
                  {!job.auto_approve_start_time ? (
                    <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                      กำลังเตรียมระบบ
                    </span>
                  ) : (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      นับถอยหลัง
                    </span>
                  )}
                </div>

                {/* ✅ แสดงสถานะ timer */}
                <div className="mt-2">
                  {!job.auto_approve_start_time ? (
                    <p className="text-sm text-purple-600">
                      ⏳ กำลังเริ่มระบบนับถอยหลัง...
                    </p>
                  ) : autoApproveTime ? (
                    <div className="text-sm font-medium bg-purple-100 px-3 py-2 rounded inline-block">
                      {t("ระบบจะอนุมัติอัตโนมัติใน") ||
                        "ระบบจะอนุมัติอัตโนมัติใน"}{" "}
                      <span className="font-mono font-bold">
                        {autoApproveTime}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-purple-600">
                      ✅ ระบบกำลังดำเนินการ...
                    </p>
                  )}
                </div>

                {/* ✅ แสดงข้อมูล debug (ถ้าต้องการ) - ใส่ใน development mode เท่านั้น */}
                {process.env.NODE_ENV === "development" && (
                  <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-gray-500">
                    <p className="mb-1">
                      <span className="font-medium">Job ID:</span> {job.id}
                    </p>
                    <p className="mb-1">
                      <span className="font-medium">Start time:</span>{" "}
                      {job.auto_approve_start_time
                        ? new Date(
                            job.auto_approve_start_time
                          ).toLocaleTimeString()
                        : "Not set"}
                    </p>
                    <p>
                      <span className="font-medium">Submitted:</span>{" "}
                      {new Date(job.submitted_at || "").toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {job.status === JobStatus.WAITING_FOR_PAYMENT && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-lg border border-amber-100 flex items-center">
                <Clock className="mr-2" /> {t("detail.waiting_payment")}
              </div>
            )}

            {job.status === JobStatus.COMPLETED && (
              <div className="bg-green-50 text-green-800 p-4 rounded-lg border border-green-100 flex items-center justify-center font-bold">
                <CheckCircle className="mr-2" /> {t("detail.completed")}
              </div>
            )}

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <img
                  src={
                    job.created_by_avatar ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      job.created_by_name || "U"
                    )}`
                  }
                  alt="User"
                  className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
                />
              </div>
              <div>
                <p className="text-sm text-gray-500">{t("detail.posted_by")}</p>
                <p className="font-medium text-gray-900">
                  {job.created_by_name || t("detail.unverified")}
                </p>
                <div className="flex items-center text-emerald-600 text-xs mt-1">
                  <Shield size={12} className="mr-1" /> {t("detail.kyc")}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                {t("create.desc")}
              </h3>
              <p className="text-gray-700 leading-relaxed">{job.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center text-gray-500 mb-1">
                  <Clock size={16} className="mr-2" />
                  <span className="text-xs font-medium uppercase">
                    {t("detail.time")}
                  </span>
                </div>
                <p className="text-gray-900 font-medium">
                  {new Date(job.datetime).toLocaleString()}
                </p>
                {job.duration_hours && (
                  <p className="text-xs text-gray-500 mt-1">
                    Duration: {job.duration_hours} hrs
                  </p>
                )}
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center text-gray-500 mb-1">
                  <MapPin size={16} className="mr-2" />
                  <span className="text-xs font-medium uppercase">
                    {t("detail.loc")}
                  </span>
                </div>
                <p className="text-gray-900 font-medium">
                  Lat: {job.location.lat.toFixed(3)}, Lng:{" "}
                  {job.location.lng.toFixed(3)}
                </p>
              </div>
            </div>

            {/* Action Box */}
            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                {t("detail.action_title")}
              </h3>
              <div className="space-y-4">
                {/* 1. ACCEPT JOB: Visible to ANY Provider (User with PROVIDER role) if Job is OPEN and they are NOT the owner */}
                {isUserProvider &&
                  job.status === JobStatus.OPEN &&
                  !isOwner &&
                  !isExpired && (
                    <button
                      onClick={handleAcceptJob}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-200"
                    >
                      <CheckCircle className="mr-2" /> {t("detail.accept")}
                    </button>
                  )}

                {/* 2. SUBMIT WORK & IN_PROGRESS ACTIONS: Visible ONLY to the Assigned Provider */}
                {isAssignedProvider &&
                  (job.status === JobStatus.ACCEPTED ||
                    job.status === JobStatus.IN_PROGRESS) && (
                    <div className="space-y-3">
                      {/* 🧪 TEST MODE BUTTON - Quick Access (Always visible after accepting job) */}
                      <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
                        <p className="text-xs text-purple-700 font-semibold mb-2 flex items-center">
                          🧪 TEST MODE - สำหรับทดสอบระบบ
                        </p>
                        <button
                          onClick={handleQuickCompleteForTest}
                          disabled={uploadingPhotos}
                          className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 font-bold rounded-lg transition-all flex items-center justify-center border-2 border-purple-300 shadow-lg"
                          title="Test Mode: Complete job in one click (For testing only)"
                        >
                          {uploadingPhotos ? (
                            <>
                              <Loader2 size={18} className="mr-2 animate-spin" />
                              กำลังทดสอบ...
                            </>
                          ) : (
                            <>
                              🧪 ทดสอบ: ทำงานให้เสร็จทันที
                            </>
                          )}
                        </button>
                        <p className="text-[10px] text-purple-600 mt-2 text-center">
                          จะข้ามทุกขั้นตอน: รูปถ่าย → Submit → อนุมัติ → เสร็จสิ้น
                        </p>
                      </div>

                      {!hasProof && (
                        <div className="mb-2 text-xs text-red-500 flex items-center justify-center">
                          <AlertTriangle size={12} className="mr-1" />
                          {t("detail.req_proof")}
                        </div>
                      )}

                      {/* Safety: งาน Physical (มาบ้าน) — รหัส OTP จากผู้จ้าง (ถ้ามี) */}
                      {job.category && ["maid", "plumbing", "electrician", "ac_cleaning", "logistics", "cleaning", "repair", "delivery", "handyman"].some((c) => String(job.category).toLowerCase().includes(c)) && (
                        <div className="mb-3">
                          <label className="block text-xs text-gray-600 mb-1">
                            รหัส OTP จากผู้จ้าง (ถ้าผู้จ้างส่งให้)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="000000"
                            value={completionOtp}
                            onChange={(e) => setCompletionOtp(e.target.value.replace(/\D/g, ""))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center font-mono text-lg"
                          />
                        </div>
                      )}

                      <button
                        onClick={handleSubmitWork}
                        disabled={submittingWork || !hasProof || gpsVerifying}
                        className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg ${
                          !hasProof
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200"
                        }`}
                      >
                        {submittingWork || gpsVerifying ? (
                          <>
                            <Loader2 className="mr-2 animate-spin" />{" "}
                            {gpsVerifying
                              ? "Verifying GPS..."
                              : "Processing..."}
                          </>
                        ) : (
                          <>
                            <Flag className="mr-2" /> {t("detail.mark_done")}
                          </>
                        )}
                      </button>

                      {/* Additional In-Progress Tools */}
                      {job.status === JobStatus.IN_PROGRESS && (
                        <div className="space-y-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                          <p className="text-sm font-bold text-yellow-800 flex items-center">
                            <Tool size={16} className="mr-2" />
                            {t("detail.in_progress_actions") ||
                              "Provider Actions"}
                          </p>

                          <button
                            onClick={handleUpdateProgress}
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <Activity size={18} className="mr-2" />{" "}
                            {t("action.update_progress") || "Update Progress"}
                          </button>

                          <button
                            onClick={handleUploadProof}
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <Camera size={18} className="mr-2" />{" "}
                            {t("action.upload_proof") || "Upload Proof"}
                          </button>

                          <button
                            onClick={() =>
                              navigate(`/profile/${job.created_by}`)
                            }
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <User size={18} className="mr-2" />{" "}
                            {t("action.contact_owner_chat") || "Contact Owner"}
                          </button>

                          <button
                            onClick={handleViewDetails}
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <ClipboardList size={18} className="mr-2" />{" "}
                            {t("action.view_instructions") || "View Details"}
                          </button>

                          <button
                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`,
                                "_blank"
                              )
                            }
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <MapPin size={18} className="mr-2" />{" "}
                            {t("action.check_location") || "Check Location"}
                          </button>

                          <button
                            onClick={handleReportIssue}
                            className="w-full py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <AlertTriangle size={18} className="mr-2" />{" "}
                            {t("action.report_issue") || "Report Issue"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                {/* 3. ACTIONS FOR OWNER: Visible ONLY to Job Owner */}
                {isOwner && (
                  <>
                    {/* WAITING_FOR_APPROVAL: Approve & Pay / Report (รวมข้อความคำแนะนำและการเตือน) */}
                    {job.status === JobStatus.WAITING_FOR_APPROVAL && (
                      <div className="space-y-4">
                        {/* 💰 Phase 5: Dispute Window Countdown */}
                        {disputeWindowRemaining && (
                          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h4 className="font-bold text-lg text-blue-900 flex items-center">
                                  <Clock size={24} className="mr-2" />
                                  ⏱️ ระยะเวลาตรวจสอบงาน
                                </h4>
                                <p className="text-blue-700 text-sm mt-1">
                                  คุณมีเวลา 5 นาทีในการตรวจสอบและยื่น Dispute (ถ้าจำเป็น)
                                </p>
                              </div>
                              <div className="text-center">
                                <div className="text-4xl font-bold text-blue-600">
                                  {disputeWindowRemaining}
                                </div>
                                <p className="text-blue-500 text-sm">เหลือเวลา</p>
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg border border-blue-200">
                              <p className="text-blue-900 font-bold mb-2">ℹ️ ข้อมูลสำคัญ:</p>
                              <ul className="text-blue-700 text-sm space-y-1">
                                <li>✅ หากคุณพอใจกับผลงาน สามารถอนุมัติได้ทันที</li>
                                <li>⚠️ หากมีปัญหา กด "ยื่น Dispute" ภายใน 5 นาที</li>
                                <li>⏰ หมดเวลา 5 นาที = อนุมัติอัตโนมัติ + ปล่อยเงินให้ผู้รับงาน</li>
                              </ul>
                            </div>
                          </div>
                        )}

                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-sm text-purple-800">
                          <strong>{t("detail.owner_action_req")}</strong>
                          <strong>กรุณาตรวจสอบผลงานก่อนอนุมัติ</strong>
                          <p className="mt-1">1. {t("detail.verify_work")}</p>
                          <p className="mt-1">1. ตรวจสอบรูปผลงานในแชท</p>
                          <p>2. {t("detail.click_approve")}</p>
                          <p>2. คลิกปุ่มอนุมัติเมื่องานถูกต้องตามที่ตกลง</p>
                          <p>3. ระบบจะโอนเงินให้ผู้รับงานภายใน 5 นาที</p>
                        </div>
                        {!hasReviewedProof && (
                          <div className="text-center py-2">
                            <p className="text-xs text-red-500 font-bold animate-pulse">
                              {t("detail.must_view_proof")}
                              ⚠️ กรุณาตรวจสอบรูปหลักฐานก่อนชำระเงิน
                            </p>
                          </div>
                        )}
                        {/* ซื้อประกันภัยงาน — แสดงให้ผู้จ้างเห็นเสมอ (รวมมือถือ) ไม่ซ่อนไว้ใน canAutoPay */}
                        {(job.status === JobStatus.WAITING_FOR_APPROVAL || job.status === JobStatus.WAITING_FOR_PAYMENT) && (
                          <div className="mb-4 p-4 rounded-xl border-2 border-teal-200 bg-teal-50/80 text-sm">
                            <label className="flex items-start gap-3 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={hasInsurance}
                                onChange={(e) => setHasInsurance(e.target.checked)}
                                className="mt-1.5 h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-800 flex items-center gap-2">
                                    <Shield size={20} className="text-teal-600 flex-shrink-0" />
                                    ซื้อประกันภัยงาน ({insuranceRatePercent}%)
                                  </span>
                                  <button type="button" onClick={() => fetchInsuranceRate()} className="p-1.5 rounded hover:bg-teal-100 text-teal-600" title="ดึงอัตราล่าสุดจากระบบ">
                                    <RefreshCw size={16} />
                                  </button>
                                </div>
                                <p className="text-slate-600 text-xs mt-0.5">รวมค่าประกันในยอดชำระ — คุ้มครองกรณีข้อพิพาท/เคลม</p>
                              </div>
                            </label>
                            <div className="mt-3 pt-3 border-t border-teal-200/80 space-y-1 text-slate-700">
                              <div className="flex justify-between">
                                <span>ราคางาน</span>
                                <span>{jobFeeRounded.toLocaleString()} บาท</span>
                              </div>
                              {hasInsurance && (
                                <div className="flex justify-between text-teal-700">
                                  <span>ค่าประกัน ({insuranceRatePercent}%)</span>
                                  <span>+{insuranceAmount.toLocaleString()} บาท</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold text-base pt-1">
                                <span>รวมชำระ</span>
                                <span>{totalPrice.toLocaleString()} บาท</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {canAutoPay ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg text-emerald-800 text-sm">
                              <span className="flex items-center">
                                <Wallet size={16} className="mr-2" />{" "}
                                {t("ยอดเงินของคุณในกระเป๋าเงิน")}:
                              </span>
                              <span className="font-bold">
                                {user?.wallet_balance} THB
                              </span>
                            </div>
                            <button
                              onClick={handleApproveWork}
                              disabled={processingPay || !hasReviewedProof}
                              className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-200 ${
                                !hasReviewedProof
                                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                              }`}
                            >
                              {processingPay ? (
                                t("กำลังอนุมัติ...")
                              ) : (
                                <>
                                  <CheckCircle className="mr-2" />{" "}
                                  {t("อนุมัติและโอนเงิน")}
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowDisputeModal(true)}
                            disabled={!hasReviewedProof}
                            className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-200 ${
                              !hasReviewedProof
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                            }`}
                          >
                            <CreditCard className="mr-2" />{" "}
                            {t("detail.pay_btn")}
                          </button>
                        )}
                        {/* 💰 Phase 5: Dispute Button (เปิดใช้งานเฉพาะภายใน dispute window) */}
                        <button
                          onClick={() => setShowDisputeModal(true)}
                          disabled={!disputeWindowRemaining || job.dispute_status !== 'none'}
                          className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center ${
                            !disputeWindowRemaining || job.dispute_status !== 'none'
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400'
                          }`}
                        >
                          <AlertTriangle size={18} className="mr-2" />{" "}
                          {t("รายงานปัญหา")}
                        </button>
                      </div>
                    )}

                    {/* COMPLETED: Send Tip */}
                    {job.status === JobStatus.COMPLETED && (
                      <button
                        onClick={() => setShowTipModal(true)}
                        className="w-full py-3 bg-pink-50 text-pink-600 border border-pink-100 hover:bg-pink-100 font-bold rounded-lg transition-colors flex items-center justify-center"
                      >
                        <Gift className="mr-2" size={18} />{" "}
                        {t("detail.send_tip")}
                      </button>
                    )}

                    {/* ACCEPTED / IN_PROGRESS: แสดงช่องติ๊กประกันให้ผู้จ้างเห็นตั้งแต่มีผู้รับงาน — ไม่ต้องรอถึงขั้นรออนุมัติ */}
                    {isOwner &&
                      (job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_PROGRESS) && (
                      <div className="mb-4 p-4 rounded-xl border-2 border-teal-200 bg-teal-50/80 text-sm">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={hasInsurance}
                            onChange={(e) => setHasInsurance(e.target.checked)}
                            className="mt-1.5 h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 flex items-center gap-2">
                                <Shield size={20} className="text-teal-600 flex-shrink-0" />
                                ซื้อประกันภัยงาน ({insuranceRatePercent}%)
                              </span>
                              <button type="button" onClick={() => fetchInsuranceRate()} className="p-1.5 rounded hover:bg-teal-100 text-teal-600" title="ดึงอัตราล่าสุดจากระบบ">
                                <RefreshCw size={16} />
                              </button>
                            </div>
                            <p className="text-slate-600 text-xs mt-0.5">
                              เลือกได้เลย — เมื่ออนุมัติงาน ระบบจะหักยอดรวม (ราคางาน + ค่าประกันถ้าติ๊ก)
                            </p>
                          </div>
                        </label>
                        <div className="mt-3 pt-3 border-t border-teal-200/80 space-y-1 text-slate-700">
                          <div className="flex justify-between">
                            <span>ราคางาน</span>
                            <span>{jobFeeRounded.toLocaleString()} บาท</span>
                          </div>
                          {hasInsurance && (
                            <div className="flex justify-between text-teal-700">
                              <span>ค่าประกัน ({insuranceRatePercent}%)</span>
                              <span>+{insuranceAmount.toLocaleString()} บาท</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-base pt-1">
                            <span>รวมชำระ (เมื่ออนุมัติ)</span>
                            <span>{totalPrice.toLocaleString()} บาท</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ALL OTHER STATUS: Cancel Button */}
                    {![
                      JobStatus.COMPLETED,
                      JobStatus.CANCELLED,
                      JobStatus.DISPUTE,
                    ].includes(job.status) &&
                      isOwner && (
                        <button
                          onClick={handleCancelClick}
                          className="w-full py-3 bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 font-medium rounded-lg transition-colors flex items-center justify-center mt-2"
                        >
                          <XCircle className="mr-2" size={18} />{" "}
                          {t("detail.cancel")}
                        </button>
                      )}
                    {/* ==================== 🗺️ REAL-TIME DRIVER TRACKING (สำหรับเจ้าของงานเท่านั้น) ==================== */}
                    {isOwner &&
                      job.accepted_by &&
                      (job.status === "in_progress" ||
                        job.status === "accepted") && (
                        <div className="lg:col-span-3 mt-8">
                          <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
                            <div className="p-6 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                  <h3 className="text-xl font-bold text-blue-900 flex items-center">
                                    <Navigation
                                      className="text-blue-600 mr-3"
                                      size={24}
                                    />
                                    ติดตามผู้รับงานแบบเรียลไทม์
                                  </h3>
                                  <p className="text-blue-600 mt-1">
                                    ตำแหน่งปัจจุบันของ{" "}
                                    {job.accepted_by_name || "ผู้รับงาน"}{" "}
                                    ที่กำลังมาทำงานให้คุณ
                                  </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  {/* ✅ Arrival Status Badge */}
                                  {job.status === 'in_progress' && job.arrived_at ? (
                                    <div className="flex items-center bg-green-500 text-white px-4 py-2 rounded-lg">
                                      <CheckCircle size={16} className="mr-2" />
                                      <span className="font-bold">✅ มาถึงแล้ว!</span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                                      <span className="text-sm font-medium text-blue-700">
                                        🚗 กำลังเดินทาง...
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 📍 Arrival Notification for Employer */}
                            {job.status === 'in_progress' && job.arrived_at && (
                              <div className="p-4 bg-gradient-to-r from-green-100 to-emerald-100 border-b border-green-200">
                                <div className="flex items-center justify-center">
                                  <CheckCircle className="text-green-600 mr-2" size={24} />
                                  <div>
                                    <p className="font-bold text-green-900">
                                      ผู้รับงานมาถึงแล้ว!
                                    </p>
                                    <p className="text-sm text-green-700">
                                      เวลา: {new Date(job.arrived_at).toLocaleString('th-TH', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })} น.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="p-6">
                              {/* 🚗 Real-time Driver Tracking Component */}
                              <DriverTracking
                                driverId={job.accepted_by}
                                jobId={job.id}
                                height="500px"
                                showControls={true}
                              />

                              {/* 📸 Phase 4: Before/After Photos Display for Employer */}
                              {(job.before_photo_url || job.after_photo_url) && (
                                <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
                                  <h4 className="font-bold text-lg text-purple-900 mb-4 flex items-center">
                                    <Camera size={24} className="mr-2" />
                                    📸 รูปถ่ายก่อน/หลังทำงาน
                                  </h4>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Before Photo */}
                                    {job.before_photo_url && (
                                      <div className="bg-white p-4 rounded-xl shadow-md">
                                        <h5 className="font-bold text-orange-700 mb-3 flex items-center">
                                          <Camera size={18} className="mr-2" />
                                          📷 ก่อนทำงาน (Before)
                                        </h5>
                                        <img
                                          src={job.before_photo_url}
                                          alt="Before"
                                          className="w-full h-64 object-cover rounded-lg border-2 border-orange-300 cursor-pointer hover:scale-105 transition-transform"
                                          onClick={() => window.open(job.before_photo_url, '_blank')}
                                        />
                                      </div>
                                    )}

                                    {/* After Photo */}
                                    {job.after_photo_url && (
                                      <div className="bg-white p-4 rounded-xl shadow-md">
                                        <h5 className="font-bold text-green-700 mb-3 flex items-center">
                                          <Camera size={18} className="mr-2" />
                                          📷 หลังทำงาน (After)
                                        </h5>
                                        <img
                                          src={job.after_photo_url}
                                          alt="After"
                                          className="w-full h-64 object-cover rounded-lg border-2 border-green-300 cursor-pointer hover:scale-105 transition-transform"
                                          onClick={() => window.open(job.after_photo_url, '_blank')}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {job.photos_uploaded_at && (
                                    <p className="text-center text-purple-600 text-sm mt-4">
                                      อัปโหลดเมื่อ: {new Date(job.photos_uploaded_at).toLocaleString('th-TH', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* ข้อมูลเพิ่มเติมสำหรับเจ้าของงาน */}
                              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                  <div className="text-sm text-blue-500 font-medium">
                                    สถานะผู้รับงาน
                                  </div>
                                  <div className="text-lg font-bold text-blue-700">
                                    {job.status === "in_progress"
                                      ? "กำลังดำเนินงาน"
                                      : "รับงานแล้ว"}
                                  </div>
                                </div>
                                <div className="bg-emerald-50 p-4 rounded-lg">
                                  <div className="text-sm text-emerald-500 font-medium">
                                    เวลาเริ่มงาน
                                  </div>
                                  <div className="text-lg font-bold text-emerald-700">
                                    {job.started_at
                                      ? new Date(
                                          job.started_at
                                        ).toLocaleTimeString("th-TH", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "รอเริ่มงาน"}
                                  </div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-lg">
                                  <div className="text-sm text-purple-500 font-medium">
                                    สามารถติดต่อได้ที่
                                  </div>
                                  <div className="text-lg font-bold text-purple-700">
                                    <a
                                      href={`tel:${
                                        job.accepted_by_phone || "#"
                                      }`}
                                      className="hover:text-purple-800"
                                    >
                                      {job.accepted_by_phone || "ไม่ระบุ"}
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ==================== 🗺️ PROVIDER WORK MAP (สำหรับผู้รับงานเท่านั้น) ==================== */}
      {user?.role === "PROVIDER" &&
        user?.id !== job?.created_by &&
        job?.location && (
          <div className="lg:col-span-3 mt-8">
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
              {/* Header - สำหรับผู้รับงาน */}
              <div className="p-6 border-b border-emerald-100 bg-gradient-to-r from-emerald-500 to-green-500">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center">
                      <MapPin className="text-emerald-100 mr-3" size={24} />
                      🚗 แผนที่นำทางไปทำงาน
                    </h3>
                    <p className="text-emerald-100 mt-1 flex items-center">
                      <Navigation className="mr-2" size={16} />
                      {user?.name || "ผู้รับงาน"} | งาน: {job.title}
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    {/* 📍 Tracking Status Badge */}
                    {isLocationTracking && (
                      <div className="flex items-center bg-white/20 backdrop-blur-sm px-3 py-2 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse mr-2"></div>
                        <span className="text-white text-sm font-medium">
                          📍 กำลังส่งตำแหน่ง
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => setShowMap(!showMap)}
                      className="px-4 py-2 bg-white text-emerald-600 font-bold rounded-lg hover:bg-emerald-50 transition-colors"
                    >
                      {showMap ? "🔻 ซ่อนแผนที่" : "🗺️ แสดงแผนที่"}
                    </button>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                    >
                      <Navigation className="mr-2" size={18} />
                      เปิดใน Google Maps
                    </a>
                  </div>
                </div>
              </div>

              {/* 📍 Phase 3: Arrival Confirmation Button */}
              {job.status === 'accepted' && isAssignedProvider && (
                <div className="p-6 border-b border-emerald-100 bg-gradient-to-r from-blue-50 to-cyan-50">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-bold text-lg text-blue-900 mb-2">
                        📍 ยืนยันการมาถึง
                      </h4>
                      {distanceToDestination !== null ? (
                        <div className="space-y-1">
                          <p className="text-blue-700">
                            ระยะห่างจากจุดหมาย: <span className="font-bold">{distanceToDestination.toFixed(2)} km</span>
                          </p>
                          {distanceToDestination <= 0.5 ? (
                            <p className="text-green-600 font-medium flex items-center">
                              <CheckCircle size={16} className="mr-1" />
                              ✅ คุณอยู่ใกล้พอที่จะยืนยันการมาถึงแล้ว!
                            </p>
                          ) : (
                            <p className="text-orange-600 font-medium flex items-center">
                              <AlertTriangle size={16} className="mr-1" />
                              ⚠️ กรุณาเดินทางให้ใกล้กว่า 500 เมตรก่อนยืนยัน
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-600">กำลังตรวจสอบตำแหน่งของคุณ...</p>
                      )}
                    </div>
                    
                    <button
                      onClick={handleConfirmArrival}
                      disabled={confirmingArrival || distanceToDestination === null || distanceToDestination > 0.5}
                      className={`px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${
                        confirmingArrival || distanceToDestination === null || (distanceToDestination && distanceToDestination > 0.5)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 hover:shadow-xl'
                      }`}
                    >
                      {confirmingArrival ? (
                        <div className="flex items-center">
                          <Loader2 className="animate-spin mr-2" size={20} />
                          กำลังยืนยัน...
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <MapPin className="mr-2" size={20} />
                          ยืนยันการมาถึง
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ✅ Arrival Confirmed Status */}
              {job.status === 'in_progress' && isAssignedProvider && job.arrived_at && (
                <div className="p-6 border-b border-emerald-100 bg-gradient-to-r from-green-50 to-emerald-50">
                  <div className="flex items-center justify-center">
                    <CheckCircle className="text-green-600 mr-3" size={32} />
                    <div>
                      <h4 className="font-bold text-lg text-green-900">
                        ✅ ยืนยันการมาถึงแล้ว!
                      </h4>
                      <p className="text-green-700">
                        เวลามาถึง: {new Date(job.arrived_at).toLocaleString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 📸 Phase 4: Before/After Photos Upload */}
              {job.status === 'in_progress' && isAssignedProvider && (
                <div className="p-6 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                  <div className="mb-4">
                    <h4 className="font-bold text-lg text-blue-900 flex items-center mb-2">
                      <Camera size={24} className="mr-2" />
                      📸 ถ่ายรูปก่อน/หลังทำงาน
                    </h4>
                    <p className="text-blue-700 text-sm">
                      ⚠️ <strong>จำเป็นต้องมี:</strong> รูปถ่ายทั้งก่อนและหลังทำงานก่อนส่งงาน
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Before Photo */}
                    <div className="bg-white p-4 rounded-xl border-2 border-orange-200">
                      <h5 className="font-bold text-orange-700 mb-3 flex items-center">
                        <Camera size={18} className="mr-2" />
                        📷 ก่อนทำงาน (Before)
                      </h5>
                      
                      {beforePhotoPreview || job.before_photo_url ? (
                        <div className="relative">
                          <img
                            src={beforePhotoPreview || job.before_photo_url}
                            alt="Before"
                            className="w-full h-48 object-cover rounded-lg border-2 border-orange-300"
                          />
                          {!job.before_photo_url && (
                            <button
                              onClick={() => {
                                setBeforePhoto(null);
                                setBeforePhotoPreview(null);
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                            >
                              <X size={16} />
                            </button>
                          )}
                          {job.before_photo_url && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                              ✅ อัปโหลดแล้ว
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="file"
                            ref={beforePhotoInputRef}
                            onChange={handleBeforePhotoChange}
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                          />
                          <button
                            onClick={() => beforePhotoInputRef.current?.click()}
                            className="w-full py-12 border-2 border-dashed border-orange-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-all flex flex-col items-center justify-center"
                          >
                            <Camera size={48} className="text-orange-400 mb-2" />
                            <span className="text-orange-700 font-bold">ถ่ายรูป/เลือกรูป</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* After Photo */}
                    <div className="bg-white p-4 rounded-xl border-2 border-green-200">
                      <h5 className="font-bold text-green-700 mb-3 flex items-center">
                        <Camera size={18} className="mr-2" />
                        📷 หลังทำงาน (After)
                      </h5>
                      
                      {afterPhotoPreview || job.after_photo_url ? (
                        <div className="relative">
                          <img
                            src={afterPhotoPreview || job.after_photo_url}
                            alt="After"
                            className="w-full h-48 object-cover rounded-lg border-2 border-green-300"
                          />
                          {!job.after_photo_url && (
                            <button
                              onClick={() => {
                                setAfterPhoto(null);
                                setAfterPhotoPreview(null);
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                            >
                              <X size={16} />
                            </button>
                          )}
                          {job.after_photo_url && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                              ✅ อัปโหลดแล้ว
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="file"
                            ref={afterPhotoInputRef}
                            onChange={handleAfterPhotoChange}
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                          />
                          <button
                            onClick={() => afterPhotoInputRef.current?.click()}
                            className="w-full py-12 border-2 border-dashed border-green-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all flex flex-col items-center justify-center"
                          >
                            <Camera size={48} className="text-green-400 mb-2" />
                            <span className="text-green-700 font-bold">ถ่ายรูป/เลือกรูป</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload Button */}
                  {(beforePhoto || afterPhoto) && !job.before_photo_url && !job.after_photo_url && (
                    <div className="mt-6">
                      <button
                        onClick={handleUploadPhotos}
                        disabled={uploadingPhotos || !beforePhoto || !afterPhoto}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${
                          uploadingPhotos || !beforePhoto || !afterPhoto
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl'
                        }`}
                      >
                        {uploadingPhotos ? (
                          <div className="flex items-center justify-center">
                            <Loader2 className="animate-spin mr-2" size={24} />
                            กำลังอัปโหลด...
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <ImageIcon className="mr-2" size={24} />
                            อัปโหลดรูปทั้งสอง
                          </div>
                        )}
                      </button>
                      {(!beforePhoto || !afterPhoto) && (
                        <p className="text-center text-red-600 text-sm mt-2">
                          ⚠️ กรุณาถ่ายรูปทั้งสองภาพ
                        </p>
                      )}
                    </div>
                  )}

                  {/* Success Message */}
                  {job.before_photo_url && job.after_photo_url && (
                    <div className="mt-6 p-4 bg-green-100 border-2 border-green-300 rounded-xl text-center">
                      <CheckCircle size={32} className="text-green-600 mx-auto mb-2" />
                      <p className="font-bold text-green-900">✅ อัปโหลดรูปเรียบร้อยแล้ว!</p>
                      <p className="text-green-700 text-sm">คุณสามารถส่งงานได้แล้ว</p>
                    </div>
                  )}
                </div>
              )}

              {/* 💰 Phase 5: Payment Hold Status (Provider) */}
              {isAssignedProvider && job.escrow_status === 'held' && (
                <div className="p-6 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-yellow-50">
                  <div className="flex items-center mb-3">
                    <DollarSign className="text-amber-600 mr-2" size={24} />
                    <h4 className="font-bold text-lg text-amber-900">
                      💰 เงินถูกกันไว้แล้ว
                    </h4>
                  </div>
                  <p className="text-amber-700 mb-2">
                    จำนวน: <span className="font-bold text-xl">{job.escrow_amount?.toLocaleString()} บาท</span>
                  </p>
                  <p className="text-amber-600 text-sm">
                    ✅ เงินจะถูกปล่อยให้คุณหลังจากผู้จ้างอนุมัติงาน หรืออัตโนมัติภายใน 5 นาทีหลังส่งงาน
                  </p>
                </div>
              )}

              {/* 💰 Phase 5: Provider Withdrawal UI */}
              {isAssignedProvider && job.payment_released && !job.withdrawal_completed && (
                <div className="p-6 border-b border-green-100 bg-gradient-to-r from-green-50 to-emerald-50">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-lg text-green-900 flex items-center">
                        <DollarSign size={24} className="mr-2" />
                        💵 เงินพร้อมถอนแล้ว
                      </h4>
                      <p className="text-green-700 mt-1">
                        จำนวน: <span className="font-bold text-2xl">{jobFeeRounded.toLocaleString()} บาท</span>
                      </p>
                    </div>
                    {!job.withdrawal_requested && (
                      <button
                        onClick={handleRequestWithdrawal}
                        className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg hover:from-green-700 hover:to-emerald-700 transition-all flex items-center"
                      >
                        <DollarSign size={20} className="mr-2" />
                        ขอถอนเงิน
                      </button>
                    )}
                  </div>
                  {job.withdrawal_requested && (
                    <div className="mt-4 p-4 bg-blue-100 border-2 border-blue-300 rounded-lg">
                      <p className="text-blue-900 font-bold">⏳ รอการโอนเงิน</p>
                      <p className="text-blue-700 text-sm mt-1">
                        ระบบจะโอนเงินเข้าบัญชีของคุณภายใน 24 ชั่วโมง
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Info - ข้อมูลด่วนสำหรับผู้รับงาน */}
              <div className="p-6 border-b border-emerald-50 bg-emerald-50">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-gray-500">💰 ราคางาน</div>
                    <div className="text-2xl font-bold text-emerald-700">
                      {jobFeeRounded} บาท
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-gray-500">⏰ เวลานัด</div>
                    <div className="text-lg font-bold text-gray-900">
                      {new Date(job.datetime).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(job.datetime).toLocaleDateString("th-TH")}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-gray-500">👤 ลูกค้า</div>
                    <div className="text-lg font-bold text-gray-900">
                      {job.created_by_name || "ไม่ระบุ"}
                    </div>
                    {job.created_by_phone && (
                      <div className="text-sm text-blue-600 mt-1">
                        📞 {job.created_by_phone}
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-gray-500">📍 ที่อยู่</div>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {job.location.fullAddress || "ไม่ได้ระบุที่อยู่"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Map Section */}
              {showMap && (
                <div className="p-6">
                  <div className="mb-6">
                    <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                      <Navigation className="text-blue-600 mr-2" />
                      แผนที่นำทาง
                    </h4>

                    <div
                      className="rounded-xl overflow-hidden border border-gray-300 shadow-lg"
                      style={{ height: "400px" }}
                    >
                      <MapContainer
                        center={[job.location.lat, job.location.lng]}
                        zoom={14}
                        style={{ height: "100%", width: "100%" }}
                        scrollWheelZoom={true}
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />

                        {/* 📍 Marker ตำแหน่งงาน */}
                        <Marker
                          position={[job.location.lat, job.location.lng]}
                          icon={L.divIcon({
                            html: `<div style="
                      background-color: #10B981;
                      width: 35px;
                      height: 35px;
                      border-radius: 50%;
                      border: 3px solid white;
                      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: white;
                      font-size: 20px;
                      font-weight: bold;
                    ">📍</div>`,
                            className: "custom-marker",
                            iconSize: [35, 35],
                            iconAnchor: [17, 17],
                          })}
                        >
                          <Popup className="custom-popup">
                            <div className="font-bold text-emerald-700 text-lg">
                              📍 ตำแหน่งงาน
                            </div>
                            <div className="text-sm mt-1 font-medium">
                              {job.title}
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              {job.location.fullAddress}
                            </div>
                            <div className="mt-2 text-sm">
                              <span className="font-bold text-emerald-600">
                                💰 {jobFeeRounded} บาท
                              </span>
                            </div>
                          </Popup>
                        </Marker>

                        {/* 👤 Marker ตำแหน่งปัจจุบันของผู้รับงาน (ถ้ามี) */}
                        {currentLocation && (
                          <Marker
                            position={[
                              currentLocation.lat,
                              currentLocation.lng,
                            ]}
                            icon={L.divIcon({
                              html: `<div style="
                        background-color: #3B82F6;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 16px;
                      ">👤</div>`,
                              className: "custom-marker",
                              iconSize: [30, 30],
                              iconAnchor: [15, 15],
                            })}
                          >
                            <Popup>
                              <div className="font-bold text-blue-700">
                                📍 ตำแหน่งปัจจุบันของคุณ
                              </div>
                              <div className="text-sm mt-1">
                                ระยะทางถึงงาน:{" "}
                                {calculateDistance(
                                  {
                                    lat: currentLocation.lat,
                                    lng: currentLocation.lng,
                                  },
                                  job.location
                                ).toFixed(1)}{" "}
                                กม.
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </MapContainer>
                    </div>

                    {/* ข้อมูลระยะทาง */}
                    {currentLocation && (
                      <div className="mt-6">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-blue-500 font-medium">
                                📏 ระยะทางจากคุณถึงงาน
                              </div>
                              <div className="text-3xl font-bold text-blue-700">
                                {calculateDistance(
                                  {
                                    lat: currentLocation.lat,
                                    lng: currentLocation.lng,
                                  },
                                  job.location
                                ).toFixed(1)}{" "}
                                กม.
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-500">
                                โดยประมาณ
                              </div>
                              <div className="text-lg font-bold text-gray-900">
                                {Math.round(
                                  calculateDistance(
                                    {
                                      lat: currentLocation.lat,
                                      lng: currentLocation.lng,
                                    },
                                    job.location
                                  ) * 10
                                )}{" "}
                                นาที
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons สำหรับผู้รับงาน */}
                  <div className="mt-8">
                    <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                      <Tool className="text-emerald-600 mr-2" />
                      เครื่องมือสำหรับผู้รับงาน
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <button
                        onClick={() =>
                          job.created_by_phone &&
                          window.open(`tel:${job.created_by_phone}`)
                        }
                        disabled={!job.created_by_phone}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all ${
                          job.created_by_phone
                            ? "bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                            : "bg-gray-100 border border-gray-200 cursor-not-allowed"
                        }`}
                      >
                        <Phone
                          className={`mb-2 ${
                            job.created_by_phone
                              ? "text-emerald-600"
                              : "text-gray-400"
                          }`}
                          size={24}
                        />
                        <span
                          className={`font-medium ${
                            job.created_by_phone
                              ? "text-emerald-700"
                              : "text-gray-500"
                          }`}
                        >
                          โทรหาลูกค้า
                        </span>
                        {job.created_by_phone && (
                          <span className="text-xs text-gray-500 mt-1">
                            {job.created_by_phone}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          const message = `สวัสดีครับ/ค่ะ ${
                            job.created_by_name || "ลูกค้า"
                          } ผมรับงาน "${
                            job.title
                          }" แล้ว จะไปถึงตามเวลานัดหมายครับ/ค่ะ`;
                          navigate(`/jobs/${job.id}#chat`);
                        }}
                        className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all"
                      >
                        <MessageCircle
                          className="text-blue-600 mb-2"
                          size={24}
                        />
                        <span className="font-medium text-blue-700">
                          แจ้งลูกค้า
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          ผ่านแชท
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                            job.title
                          )}&dates=${new Date(job.datetime)
                            .toISOString()
                            .replace(/-|:|\.\d+/g, "")}/${new Date(
                            new Date(job.datetime).getTime() +
                              (job.duration_hours || 2) * 60 * 60 * 1000
                          )
                            .toISOString()
                            .replace(
                              /-|:|\.\d+/g,
                              ""
                            )}&details=${encodeURIComponent(
                            `งาน: ${job.title}\nที่อยู่: ${
                              job.location.fullAddress || "ไม่ระบุ"
                            }\nราคา: ${jobFeeRounded} บาท`
                          )}`;
                          window.open(calendarUrl, "_blank");
                        }}
                        className="flex flex-col items-center justify-center p-4 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all"
                      >
                        <Calendar className="text-purple-600 mb-2" size={24} />
                        <span className="font-medium text-purple-700">
                          บันทึกเวลา
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          ในปฏิทิน
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          // บันทึกข้อมูลงานใน localStorage
                          localStorage.setItem(
                            "current_job",
                            JSON.stringify({
                              id: job.id,
                              title: job.title,
                              location: job.location,
                              time: job.datetime,
                              customer: job.created_by_name,
                            })
                          );
                          notify("บันทึกข้อมูลงานเรียบร้อย", "success");
                        }}
                        className="flex flex-col items-center justify-center p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all"
                      >
                        <ClipboardList
                          className="text-amber-600 mb-2"
                          size={24}
                        />
                        <span className="font-medium text-amber-700">
                          บันทึกงาน
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          เก็บเป็นข้อมูล
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* ข้อมูลลูกค้า (สำหรับผู้รับงาน) */}
                  <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
                    <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                      <User className="text-blue-600 mr-2" />
                      ข้อมูลลูกค้าสำหรับการติดต่อ
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-5 rounded-xl shadow-sm">
                        <div className="text-sm text-gray-500 mb-2">
                          👤 ข้อมูลลูกค้า
                        </div>
                        <div className="font-bold text-lg text-gray-900">
                          {job.created_by_name || "ไม่ระบุชื่อ"}
                        </div>
                        {job.created_by_phone && (
                          <div className="mt-2">
                            <div className="text-sm text-gray-500">
                              📞 เบอร์ติดต่อ
                            </div>
                            <div className="font-medium text-blue-600">
                              {job.created_by_phone}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="bg-white p-5 rounded-xl shadow-sm">
                        <div className="text-sm text-gray-500 mb-2">
                          📅 รายละเอียดงาน
                        </div>
                        <div className="font-medium text-gray-900">
                          {job.title}
                        </div>
                        <div className="mt-2 text-sm">
                          <div className="text-gray-500">⏰ เวลานัดหมาย:</div>
                          <div className="font-medium">
                            {new Date(job.datetime).toLocaleString("th-TH", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Chat Column */}
      <div className="lg:col-span-1 h-[600px] flex flex-col">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center">
              <User size={18} className="mr-2" />
              {t("detail.chat_with")}{" "}
              {isOwner
                ? job.accepted_by_name || "Provider"
                : job.created_by_name || "Owner"}
            </h3>
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50"
            ref={chatContainerRef}
          >
            {messages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm mt-10">
                {t("detail.no_msg")}
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${
                    msg.is_me ? "justify-end" : "justify-start"
                  }`}
                >
                  {!msg.is_me && (
                    <img
                      src={otherAvatar}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full object-cover border border-pink-200 shadow-sm mb-1"
                    />
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      msg.is_me
                        ? "bg-emerald-600 text-white rounded-br-none"
                        : "bg-pink-50 text-gray-800 border border-pink-100 rounded-bl-none"
                    }`}
                  >
                    {msg.type === MessageType.IMAGE ? (
                      <div className="space-y-2">
                        <div
                          className="relative group cursor-pointer"
                          onClick={() =>
                            msg.media_url && handleViewProof(msg.media_url)
                          }
                        >
                          <img
                            src={msg.media_url}
                            alt="Attachment"
                            className="rounded-lg max-w-full h-auto border border-white/20"
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <Eye className="text-white" size={24} />
                          </div>
                        </div>
                        <span className="flex items-center text-[10px] opacity-70">
                          <ImageIcon size={10} className="mr-1" /> Image
                          attached
                        </span>
                        {isOwner &&
                          job.status === JobStatus.WAITING_FOR_APPROVAL && (
                            <div className="bg-white/20 p-1 rounded text-[10px] text-center font-bold">
                              Click to verify for approval
                            </div>
                          )}
                      </div>
                    ) : (
                      msg.text
                    )}
                    <span
                      className={`text-[10px] block mt-1 text-right ${
                        msg.is_me ? "text-emerald-200" : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white border-t border-gray-100"
          >
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                title={t("detail.attach")}
              >
                <Paperclip size={18} />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t("detail.type")}
                className="flex-1 py-2 px-4 bg-gray-100 border-transparent focus:bg-white border focus:border-emerald-500 rounded-full text-sm focus:outline-none transition-colors"
              />
              <button
                type="submit"
                className="p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50"
                disabled={!newMessage.trim()}
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
