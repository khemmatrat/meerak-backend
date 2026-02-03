import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import paymentGatewayService, {
  PaymentGateway,
  PaymentStatus as GatewayPaymentStatus,
  PAYMENT_FEE,
  MIN_WITHDRAWAL_THB,
} from "../services/paymentGatewayService";
import {
  getWithdrawalFeeForNet,
  getMaxNetWithdrawable,
} from "../services/paymentFeeConfig";
import type { PaymentChannel } from "../services/paymentFeeConfig";
import { recordPaymentCreated } from "../services/ledgerService";
import {
  UserProfile,
  Transaction,
  Review,
  UserRole,
  BankAccount,
  TrainingModule,
  TrainingStatus,
  JobCategory,
  AvailabilitySlot,
} from "../types";
import {
  Shield,
  Car,
  User,
  Phone,
  Mail,
  Camera,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle,
  Star,
  Rocket,
  Scan,
  BookOpen,
  PlayCircle,
  Lock,
  ShieldCheck,
  ChevronLeft,
  XCircle,
  Trash2,
  CreditCard,
  Briefcase,
  GraduationCap,
  Award,
  Plus,
  Edit2,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// --- TRAINING COMPONENTS ---

const CourseView: React.FC<{
  course: TrainingModule;
  onStartQuiz: (id: string) => void;
  onBack: () => void;
}> = ({ course, onStartQuiz, onBack }) => (
  <div className="space-y-4 animate-in fade-in">
    <div className="flex items-center space-x-2 mb-4">
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ChevronLeft size={20} />
      </button>
      <h2 className="text-2xl font-bold">{course.name}</h2>
    </div>
    <p className="text-gray-600">{course.description}</p>

    <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg relative group">
      {course.videoUrl ? (
        <iframe
          className="w-full h-full"
          src={course.videoUrl}
          title={course.name}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          Video Placeholder
        </div>
      )}
    </div>

    <div className="flex justify-end pt-4">
      <button
        onClick={() => onStartQuiz(course.id)}
        disabled={!course.quiz || course.quiz.length === 0}
        className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <BookOpen size={20} className="mr-2" /> Start Quiz (
        {course.quiz?.length || 0} Qs)
      </button>
    </div>
  </div>
);

const Quiz: React.FC<{
  course: TrainingModule;
  onQuizComplete: (score: number) => void;
  onCancel: () => void;
}> = ({ course, onQuizComplete, onCancel }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: number }>({});
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);

  const question = course.quiz?.[currentQuestionIndex];
  const totalQuestions = course.quiz?.length || 0;

  const handleAnswer = (questionId: string, selectedIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: selectedIndex }));
  };

  const calculateScore = () => {
    let correctCount = 0;
    course.quiz?.forEach((q) => {
      if (answers[q.id] === q.correctAnswerIndex) {
        correctCount++;
      }
    });
    const finalScore = Math.round((correctCount / totalQuestions) * 100);
    setScore(finalScore);
    setShowResult(true);
  };

  if (showResult) {
    const isPassed = score >= (course.passingScore || 80);
    return (
      <div className="bg-white p-8 rounded-xl shadow-lg text-center space-y-6 animate-in zoom-in-95">
        <h2 className="text-3xl font-bold">Quiz Result</h2>
        <div
          className={`p-6 rounded-xl text-lg font-semibold border-2 ${
            isPassed
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <div className="flex justify-center mb-2">
            {isPassed ? <CheckCircle size={48} /> : <XCircle size={48} />}
          </div>
          Your Score: {score}% ({isPassed ? "Passed" : "Failed"})
        </div>
        <p className="text-gray-600">
          Required: {course.passingScore}% | Correct:{" "}
          {Math.round((score / 100) * totalQuestions)}/{totalQuestions}
        </p>
        {isPassed ? (
          <button
            onClick={() => onQuizComplete(score)}
            className="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
          >
            Complete Training & Unlock Skill
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="w-full px-6 py-3 bg-gray-500 text-white font-bold rounded-lg hover:bg-gray-600 transition"
          >
            Try Again Later
          </button>
        )}
      </div>
    );
  }

  if (!question) return <div>No questions available.</div>;

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">{course.name} Quiz</h2>
        <span className="text-sm font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
          Q {currentQuestionIndex + 1} / {totalQuestions}
        </span>
      </div>

      <p className="text-gray-800 text-lg font-medium leading-relaxed">
        {question.question}
      </p>

      <div className="space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleAnswer(question.id, index)}
            className={`w-full text-left p-4 border-2 rounded-xl transition-all ${
              answers[question.id] === index
                ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="font-bold mr-2">
              {String.fromCharCode(65 + index)}.
            </span>{" "}
            {option}
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-6 border-t mt-6">
        <button
          onClick={() =>
            setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
          }
          disabled={currentQuestionIndex === 0}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 disabled:opacity-30 font-medium"
        >
          Previous
        </button>

        {currentQuestionIndex < totalQuestions - 1 ? (
          <button
            onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
            disabled={answers[question.id] === undefined}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Next
          </button>
        ) : (
          <button
            onClick={calculateScore}
            disabled={answers[question.id] === undefined}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-lg shadow-green-200"
          >
            Submit Quiz
          </button>
        )}
      </div>
    </div>
  );
};

// --- MAIN PROFILE COMPONENT ---

export const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<
    "info" | "reviews" | "wallet" | "earnings" | "training" | "calendar"
  >("info");
  const [earningsStats, setEarningsStats] = useState<{
    weekly: number;
    monthly: number;
    yearly: number;
    chartData: any[];
  } | null>(null);

  const { t } = useLanguage();
  const { token, login, user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();

  // บัญชีรับเงินจาก Payment Methods (Settings) — ใช้ user จาก Auth เพื่อให้ตรงกับ Settings เสมอ
  const bankAccounts = user?.bank_accounts ?? profile?.bank_accounts ?? [];

  // Wallet Modal State
  const [activeModal, setActiveModal] = useState<"deposit" | "withdraw" | null>(
    null,
  );
  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [depositMethod, setDepositMethod] = useState<
    "promptpay" | "truemoney" | "bank_transfer" | null
  >(null);
  const [bankTransferRef, setBankTransferRef] = useState<{
    refId: string;
    bill_no: string;
    transaction_no: string;
  } | null>(null);
  const [depositStep, setDepositStep] = useState<"amount" | "qr" | "bank_show">(
    "amount",
  );
  const [depositQrUrl, setDepositQrUrl] = useState<string | null>(null);
  const [depositPaymentId, setDepositPaymentId] = useState<string | null>(null);
  const [depositAutotest, setDepositAutotest] = useState(false);
  const [selectedWithdrawAccount, setSelectedWithdrawAccount] =
    useState<BankAccount | null>(null);
  const [withdrawChannel, setWithdrawChannel] =
    useState<PaymentChannel>("bank_transfer");

  // KYC State
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");

  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [idCardBackImage, setIdCardBackImage] = useState<string | null>(null); // ควรมีแต่ไม่มีในโค้ด
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [drivingLicenseFrontImage, setDrivingLicenseFrontImage] =
    useState(null);
  const [drivingLicenseBackImage, setDrivingLicenseBackImage] = useState(null);

  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [idCardBackPreview, setIdCardBackPreview] = useState<string | null>(
    null,
  );
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [drivingLicenseFrontPreview, setDrivingLicenseFrontPreview] = useState<
    string | null
  >(null);
  const [drivingLicenseBackPreview, setDrivingLicenseBackPreview] = useState<
    string | null
  >(null);
  const [submittingKYC, setSubmittingKYC] = useState(false);

  // ซิงค์บัญชีรับเงินกับ Payment Methods (Settings) — เมื่อ user อัปเดตใน Settings ให้ใช้บัญชีแรก
  useEffect(() => {
    const accounts = user?.bank_accounts ?? profile?.bank_accounts ?? [];
    if (accounts.length > 0) {
      setSelectedWithdrawAccount(accounts[0]);
    } else {
      setSelectedWithdrawAccount(null);
    }
  }, [user?.bank_accounts, profile?.bank_accounts]);

  // State สำหรับรูปภาพ (ทั้ง preview และ base64)
  const [idCardFront, setIdCardFront] = useState({
    preview: "", // สำหรับแสดงผล
    base64: "", // สำหรับส่งไป backend
  });

  const [idCardBack, setIdCardBack] = useState({
    preview: "",
    base64: "",
  });

  const [selfiePhoto, setSelfiePhoto] = useState({
    preview: "",
    base64: "",
  });

  const [drivingLicenseFront, setDrivingLicenseFront] = useState({
    preview: "",
    base64: "",
  });

  const [drivingLicenseBack, setDrivingLicenseBack] = useState({
    preview: "",
    base64: "",
  });

  const idCardInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const idCardBackInputRef = useRef<HTMLInputElement>(null);
  const drivingLicenseFrontInputRef = useRef<HTMLInputElement>(null);
  const drivingLicenseBackInputRef = useRef<HTMLInputElement>(null);
  const [isAvatarAnalyzing, setIsAvatarAnalyzing] = useState(false);

  // Training Center State
  const [courses, setCourses] = useState<TrainingModule[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "learn" | "quiz">("list");
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [newSlot, setNewSlot] = useState({
    date: "",
    startTime: "09:00",
    endTime: "17:00",
  });

  useEffect(() => {
    const fetchData = async () => {
      console.log("🔄 Starting fetchData...");

      try {
        // 1. ดึงข้อมูลผู้ใช้
        const data = await MockApi.getProfile();
        console.log("✅ User data loaded:", {
          name: data.name,
          role: data.role,
          wallet_balance: data.wallet_balance,
          wallet_pending: data.wallet_pending,
        });

        setProfile(data);

        // 2. ดึง transaction พร้อมกรองตาม role
        const txData = await MockApi.getTransactions();
        setTransactions(txData);
        console.log("✅ Transactions loaded:", txData.length);

        // 3. ดึง reviews ถ้ามี user id
        if (data.id) {
          try {
            const reviewData = await MockApi.getReviews(data.id);
            setReviews(reviewData);
            console.log("✅ Reviews loaded:", reviewData.length);
          } catch (reviewError) {
            console.warn("Could not load reviews:", reviewError);
            setReviews([]);
          }

          // ตั้งค่าบัญชีธนาคารสำหรับถอนเงิน — ใช้จาก user (Auth) หรือ data (getProfile) ให้ตรงกับ Payment Methods
          const accounts = user?.bank_accounts ?? data.bank_accounts ?? [];
          if (accounts.length > 0) {
            setSelectedWithdrawAccount(accounts[0]);
          }
        }

        // 4. ดึงคอร์สเรียนและ merge กับ progress
        try {
          const allCourses = await MockApi.getAllCourses();
          const safeCourses = allCourses || [];

          const mergedCourses = safeCourses.map((c) => {
            const userTraining = data.trainings?.find((t) => t.id === c.id);
            return {
              ...c,
              status:
                userTraining?.status ||
                (data.skills?.includes(c.category)
                  ? TrainingStatus.COMPLETED
                  : TrainingStatus.NOT_ENROLLED),
            } as TrainingModule;
          });
          setCourses(mergedCourses);
          console.log("✅ Courses loaded:", mergedCourses.length);
        } catch (courseError) {
          console.warn("Could not load courses:", courseError);
          setCourses([]);
        }

        // 5. ดึงสถิติรายได้
        try {
          const stats = await MockApi.getEarningsStats();
          setEarningsStats(stats);
          console.log("✅ Earnings stats loaded");
        } catch (statsError) {
          console.warn("Could not load earnings stats:", statsError);
          setEarningsStats(null);
        }

        // ✅ สำคัญ: สำหรับ Provider ให้ตรวจสอบและ sync wallet_pending
        if (data.role === UserRole.PROVIDER) {
          // คำนวณยอด pending จาก transaction
          const pendingFromTransactions = txData
            .filter(
              (tx) => tx.status === "pending_release" && tx.type === "income",
            )
            .reduce((sum, tx) => sum + tx.amount, 0);

          console.log("📊 Wallet check:", {
            current_pending: data.wallet_pending || 0,
            from_transactions: pendingFromTransactions,
            difference: pendingFromTransactions - (data.wallet_pending || 0),
          });

          // ถ้ามีความแตกต่างมากกว่า 1 บาท ให้ sync
          const currentPending = data.wallet_pending || 0;
          if (Math.abs(pendingFromTransactions - currentPending) > 1) {
            console.log(
              `🔄 Syncing wallet_pending: ${currentPending} → ${pendingFromTransactions}`,
            );
            try {
              await MockApi.updateProfile({
                wallet_pending: pendingFromTransactions,
              });

              // ดึงข้อมูล user ใหม่
              const updatedUser = await MockApi.getProfile();
              setProfile(updatedUser);
              console.log("✅ Wallet synced successfully");
            } catch (syncError) {
              console.error("Failed to sync wallet:", syncError);
            }
          }
        }

        console.log("✅ All data loaded successfully!");
      } catch (e) {
        console.error("❌ Failed to fetch profile data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // --- Handlers ---

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type:
      | "id"
      | "selfie"
      | "avatar"
      | "id_back"
      | "dl_front"
      | "dl_back"
      | "id_front",
  ) => {
    console.log(`handleFileSelect called for type: ${type}`);
    console.log(`Event target files:`, e.target.files);

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.log(
        `File selected for ${type}:`,
        file.name,
        file.size,
        file.type,
      );

      try {
        const base64 = await convertToBase64(file);
        console.log(
          `Base64 conversion successful for ${type}, length: ${base64.length}`,
        );

        const previewUrl = URL.createObjectURL(file);
        console.log(`Preview URL created for ${type}`);
        // ตรวจสอบและจัดการกับ type ที่ต่างกัน
        let actualType = type;
        if (type === "id") {
          console.warn(
            "Warning: Using deprecated type 'id', should use 'id_front'",
          );
          actualType = "id_front";
        }

        switch (type) {
          case "id_front":
            console.log(`Setting idCardImage and idCardPreview`);
            setIdCardImage(base64);
            setIdCardPreview(previewUrl);
            break;
          case "id_back":
            console.log(`Setting idCardBackImage and idCardBackPreview`);
            setIdCardBackImage(base64);
            setIdCardBackPreview(previewUrl);
            break;
          case "selfie":
            console.log(`Setting selfieImage and selfiePreview`);
            setSelfieImage(base64);
            setSelfiePreview(previewUrl);
            break;
          case "dl_front":
            console.log(
              `Setting drivingLicenseFrontImage and drivingLicenseFrontPreview`,
            );
            setDrivingLicenseFrontImage(base64);
            setDrivingLicenseFrontPreview(previewUrl);
            break;
          case "dl_back":
            console.log(
              `Setting drivingLicenseBackImage and drivingLicenseBackPreview`,
            );
            setDrivingLicenseBackImage(base64);
            setDrivingLicenseBackPreview(previewUrl);
            break;
          case "avatar":
            handleAvatarUpload(file);
            break;
        }

        // ตรวจสอบ state ทันทีหลังเซ็ต
        setTimeout(() => {
          console.log(`After setting ${type}:`, {
            idCardImage: idCardImage ? "set" : "null",
            idCardPreview: idCardPreview ? "set" : "null",
          });
        }, 100);
      } catch (error) {
        console.error(`Error processing file for ${type}:`, error);
      }
    } else {
      console.log(`No file selected for ${type}`);
    }
  };

  // ฟังก์ชันแปลง File เป็น Base64
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };
  const handleAvatarUpload = async (file: File) => {
    setIsAvatarAnalyzing(true);
    try {
      const updatedUser = await MockApi.updateAvatar(file);
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      notify("Profile picture updated", "success");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsAvatarAnalyzing(false);
    }
  };

  // const handleSubmitKYC = async () => {
  //   if (!idCardImage || !selfieImage ) {
  //    notify("Please upload both documents", "error");
  //     return;
  //   }
  //   setSubmittingKYC(true);
  //   try {
  //     const updatedUser = await MockApi.submitKYC({
  //       front: idCardImage,
  //       selfie: selfieImage,
  //     });
  //     setProfile(updatedUser);
  //     if (token) login(updatedUser, token);
  //     notify("KYC submitted successfully", "success");
  //     setIdCardPreview(null);
  //      setSelfiePreview(null);
  //      setIdCardImage(null);
  //     setSelfieImage(null);
  //   } catch (e: any) {
  //     notify(e.message, "error");
  //   } finally {
  //     setSubmittingKYC(false);
  //   }
  // };
  const handleSubmitKYC = async () => {
    console.log("handleSubmitKYC called");
    console.log("FullName:", fullName);
    //console.log("ID Card Preview:", idCardPreview ? "Exists" : "Null");
    // console.log("ID Card Back Preview:", idCardBackPreview ? "Exists" : "Null");
    // console.log("DL Front Preview:",drivingLicenseFrontPreview ? "Exists" : "Null");
    // console.log("DL Back Preview:",drivingLicenseBackPreview ? "Exists" : "Null");
    console.log("2. BirthDate:", birthDate);
    console.log("3. ID Card Number:", idCardNumber);
    console.log(
      "4. idCardImage:",
      idCardImage ? `Base64 (${idCardImage.length} chars)` : "NULL",
    );
    console.log(
      "5. selfieImage:",
      selfieImage ? `Base64 (${selfieImage.length} chars)` : "NULL",
    );
    console.log("6. idCardPreview:", idCardPreview || "NULL");
    console.log("7. selfiePreview:", selfiePreview || "NULL");

    if (!fullName || !birthDate || !idCardNumber) {
      notify("กรุณากรอกข้อมูลพื้นฐาน (ชื่อ, วันเกิด, เลขบัตรประชาชน)", "error");
      return;
    }

    // ตรวจสอบ Base64
    if (!idCardImage) {
      console.error("idCardImage is null - front ID card not uploaded");
      notify("กรุณาอัปโหลดบัตรประชาชนหน้า", "error");
      return;
    }

    if (!selfieImage) {
      console.error("selfieImage is null - selfie not uploaded");
      notify("กรุณาอัปโหลดรูปเซลฟี่", "error");
      return;
    }

    // ตรวจสอบว่าเป็น Base64 จริง
    if (!idCardImage.startsWith("data:image/")) {
      console.error(
        "idCardImage is not valid Base64:",
        idCardImage.substring(0, 50),
      );
      notify("รูปบัตรประชาชนไม่ถูกต้อง กรุณาอัปโหลดใหม่", "error");
      return;
    }

    console.log("All checks passed, submitting KYC...");
    setSubmittingKYC(true);
    try {
      // ใช้ enhanced KYC (7 steps)
      const result = await MockApi.submitEnhancedKYC({
        fullName,
        birthDate,
        idCardNumber,
        idCardFront: idCardPreview,
        idCardBack: idCardBackPreview || "",
        selfiePhoto: selfiePreview,
        drivingLicenseFront: drivingLicenseFrontPreview || "",
        drivingLicenseBack: drivingLicenseBackPreview || "",
        // เพิ่มใบขับขี่ถ้ามี
      });

      notify(result.message || "ส่งข้อมูลยืนยันตัวตนสำเร็จ", "success");

      // อัพเดทโปรไฟล์
      const updatedUser = await MockApi.getProfile();
      setProfile(updatedUser);
      setFullName("");
      setBirthDate("");
      setIdCardNumber("");
      setIdCardPreview(null);
      setIdCardBackPreview(null);
      setSelfiePreview(null);
      setDrivingLicenseFrontPreview(null);
      setDrivingLicenseBackPreview(null);
    } catch (e: any) {
      notify(e.message || "ส่งข้อมูลไม่สำเร็จ", "error");
    } finally {
      setSubmittingKYC(false);
    }
  };
  // ฟังก์ชันรีเซ็ตฟอร์ม
  const resetForm = () => {
    console.log("resetForm called!");
    // ลบ Blob URLs เพื่อปล่อย memory
    if (idCardPreview) URL.revokeObjectURL(idCardPreview);
    if (idCardBackPreview) URL.revokeObjectURL(idCardBackPreview);
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    if (drivingLicenseFrontPreview)
      URL.revokeObjectURL(drivingLicenseFrontPreview);
    if (drivingLicenseBackPreview)
      URL.revokeObjectURL(drivingLicenseBackPreview);

    // รีเซ็ต state
    setFullName("");
    setBirthDate("");
    setIdCardNumber("");

    // รีเซ็ต Base64
    setIdCardImage(null);
    setIdCardBackImage(null);
    setSelfieImage(null);
    setDrivingLicenseFrontImage(null);
    setDrivingLicenseBackImage(null);

    // รีเซ็ต Preview URLs
    setIdCardPreview(null);
    setIdCardBackPreview(null);
    setSelfiePreview(null);
    setDrivingLicenseFrontPreview(null);
    setDrivingLicenseBackPreview(null);

    // รีเซ็ต input files
    if (idCardInputRef.current) idCardInputRef.current.value = "";
    if (idCardBackInputRef.current) idCardBackInputRef.current.value = "";
    if (selfieInputRef.current) selfieInputRef.current.value = "";
    if (drivingLicenseFrontInputRef.current)
      drivingLicenseFrontInputRef.current.value = "";
    if (drivingLicenseBackInputRef.current)
      drivingLicenseBackInputRef.current.value = "";
  };

  const handleEnrollCourse = async (courseId: string) => {
    try {
      const updatedUser = await MockApi.enrollTraining(courseId);
      setProfile(updatedUser);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, status: TrainingStatus.IN_PROGRESS } : c,
        ),
      );
      notify("Enrolled successfully!", "success");
      setActiveCourseId(courseId);
      setViewMode("learn");
    } catch (e) {
      notify("Enrollment failed", "error");
    }
  };

  const handleContinueCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    setViewMode("learn");
  };

  const handleQuizComplete = async (score: number) => {
    if (!activeCourseId) return;
    try {
      const updatedUser = await MockApi.completeTraining(activeCourseId, score);
      setProfile(updatedUser);
      if (token) login(updatedUser, token);

      setCourses((prev) =>
        prev.map((c) =>
          c.id === activeCourseId
            ? { ...c, status: TrainingStatus.COMPLETED }
            : c,
        ),
      );

      notify("Course Completed! Skill Unlocked.", "success");
      setViewMode("list");
      setActiveCourseId(null);
    } catch (e) {
      notify("Failed to update progress", "error");
    }
  };

  const handleDeposit = async () => {
    if (!amount || isNaN(Number(amount))) return;
    setProcessing(true);
    try {
      const updatedUser = await MockApi.walletTopUp(Number(amount));
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      notify("Deposit successful", "success");
      setActiveModal(null);
      setAmount("");
      setDepositStep("amount");
      setDepositQrUrl(null);
      setDepositPaymentId(null);
    } catch (e) {
      notify("Deposit failed", "error");
    }
    setProcessing(false);
  };

  const handleDepositWithPromptPay = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    const amt = Number(amount);
    setProcessing(true);
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    const refIdLocal = `topup_${user.id}_${Date.now()}`;
    try {
      let paymentResult: {
        success: boolean;
        payment_id: string;
        bill_no: string;
        transaction_no: string;
        qr_code_url?: string;
      };
      if (depositAutotest) {
        paymentResult = paymentGatewayService.createPromptPayPaymentTest(
          amt,
          refIdLocal,
          { user_id: user.id },
        );
      } else {
        paymentResult = await paymentGatewayService.createPayment({
          job_id: refIdLocal,
          amount: amt,
          gateway: PaymentGateway.PROMPTPAY,
          metadata: {
            user_id: user.id,
            user_name: user.name || user.email,
            job_title: "Wallet top-up",
          },
        });
      }
      if (!paymentResult.success || !paymentResult.qr_code_url) {
        notify("Could not generate QR", "error");
        setProcessing(false);
        return;
      }
      try {
        await recordPaymentCreated({
          payment_id: paymentResult.payment_id,
          gateway: "promptpay",
          job_id: refIdLocal,
          amount: amt,
          currency: "THB",
          bill_no: paymentResult.bill_no,
          transaction_no: paymentResult.transaction_no,
          user_id: user.id,
          metadata: { source: "wallet_topup" },
        });
      } catch (ledgerErr) {
        console.warn(
          "Ledger recordPaymentCreated failed (non-blocking):",
          ledgerErr,
        );
      }
      setDepositQrUrl(paymentResult.qr_code_url);
      setDepositPaymentId(paymentResult.payment_id);
      setDepositStep("qr");
      const ctx = {
        gateway: "promptpay" as const,
        payment_id: paymentResult.payment_id,
        job_id: refIdLocal,
        bill_no: paymentResult.bill_no,
        transaction_no: paymentResult.transaction_no,
      };
      if (depositAutotest && paymentResult.payment_id.startsWith("pp_test_")) {
        setTimeout(async () => {
          const updatedUser = await MockApi.walletTopUp(amt, ctx);
          setProfile(updatedUser);
          if (token) login(updatedUser, token);
          try {
            const txData = await MockApi.getTransactions(true);
            setTransactions(txData);
          } catch (_) {}
          notify("Deposit successful (Auto Test)", "success");
          setActiveModal(null);
          setAmount("");
          setDepositStep("amount");
          setDepositQrUrl(null);
          setDepositPaymentId(null);
          setProcessing(false);
        }, 2500);
        return;
      }
      const status = await paymentGatewayService.pollPaymentStatus(
        paymentResult.payment_id,
        PaymentGateway.PROMPTPAY,
        60,
        5000,
      );
      if (status === GatewayPaymentStatus.COMPLETED) {
        const updatedUser = await MockApi.walletTopUp(amt, ctx);
        setProfile(updatedUser);
        if (token) login(updatedUser, token);
        try {
          const txData = await MockApi.getTransactions(true);
          setTransactions(txData);
        } catch (_) {}
        notify("Deposit successful", "success");
        setActiveModal(null);
        setAmount("");
      } else {
        notify("Payment " + status, "error");
      }
      setDepositStep("amount");
      setDepositQrUrl(null);
      setDepositPaymentId(null);
    } catch (e: any) {
      notify(e.message || "Deposit failed", "error");
      setDepositStep("amount");
      setDepositQrUrl(null);
      setDepositPaymentId(null);
    }
    setProcessing(false);
  };

  const handleDepositTrueMoney = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    const amt = Number(amount);
    setProcessing(true);
    const refIdLocal = `topup_${user.id}_${Date.now()}`;
    try {
      const paymentResult = await paymentGatewayService.createPayment({
        job_id: refIdLocal,
        amount: amt,
        gateway: PaymentGateway.TRUEMONEY,
        metadata: {
          user_id: user.id,
          user_name: user.name || user.email,
          job_title: "Wallet top-up",
        },
      });
      if (!paymentResult.success) {
        notify(
          paymentResult.error || "Could not create TrueMoney payment",
          "error",
        );
        setProcessing(false);
        return;
      }
      try {
        await recordPaymentCreated({
          payment_id: paymentResult.payment_id,
          gateway: "truemoney",
          job_id: refIdLocal,
          amount: amt,
          currency: "THB",
          bill_no: paymentResult.bill_no,
          transaction_no: paymentResult.transaction_no,
          user_id: user.id,
          metadata: { source: "wallet_topup" },
        });
      } catch (ledgerErr) {
        console.warn(
          "Ledger recordPaymentCreated failed (non-blocking):",
          ledgerErr,
        );
      }
      if (paymentResult.deep_link) {
        paymentGatewayService.openTrueMoneyDeepLink(paymentResult.deep_link);
      }
      notify(
        "เปิดแอป TrueMoney เพื่อชำระ — เมื่อชำระเสร็จระบบจะอัปเดตอัตโนมัติ",
        "success",
      );
      setActiveModal(null);
      setAmount("");
      setDepositMethod(null);
    } catch (e: any) {
      notify(e.message || "TrueMoney failed", "error");
    }
    setProcessing(false);
  };

  const handleDepositBankTransfer = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    if (!bankAccounts.length) {
      notify(
        "กรุณาเพิ่มบัญชีใน Settings → Payment Methods ก่อนเติมเงินผ่านโอนธนาคาร",
        "error",
      );
      return;
    }
    const amt = Number(amount);
    const refIdLocal = `topup_${user.id}_${Date.now()}`;
    const billNo = `BL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const txNo = `TX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    setBankTransferRef({
      refId: refIdLocal,
      bill_no: billNo,
      transaction_no: txNo,
    });
    try {
      await recordPaymentCreated({
        payment_id: refIdLocal,
        gateway: "bank_transfer",
        job_id: refIdLocal,
        amount: amt,
        currency: "THB",
        bill_no: billNo,
        transaction_no: txNo,
        user_id: user.id,
        metadata: { source: "wallet_topup" },
      });
    } catch (e) {
      console.warn("Ledger recordPaymentCreated failed:", e);
    }
    setDepositStep("bank_show");
  };

  const handleConfirmBankTransferDone = async () => {
    if (!user || !amount || isNaN(Number(amount)) || !bankTransferRef) return;
    const amt = Number(amount);
    setProcessing(true);
    try {
      const updatedUser = await MockApi.walletTopUp(amt, {
        gateway: "bank_transfer",
        payment_id: bankTransferRef.refId,
        job_id: bankTransferRef.refId,
        bill_no: bankTransferRef.bill_no,
        transaction_no: bankTransferRef.transaction_no,
      });
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      try {
        const txData = await MockApi.getTransactions(true);
        setTransactions(txData);
      } catch (_) {}
      notify(
        "ยืนยันการโอนแล้ว — ยอดจะเข้าภายใน 24 ชม. (หรือเมื่อตรวจสอบแล้ว)",
        "success",
      );
      setActiveModal(null);
      setAmount("");
      setBankTransferRef(null);
      setDepositStep("amount");
      setDepositMethod(null);
    } catch (e: any) {
      notify(e.message || "Failed", "error");
    }
    setProcessing(false);
  };

  const handleWithdraw = async () => {
    if (!amount || isNaN(Number(amount))) return;
    const amt = Number(amount);
    if (amt < MIN_WITHDRAWAL_THB) {
      notify(`ขั้นต่ำถอน ${MIN_WITHDRAWAL_THB} บาท`, "error");
      return;
    }
    const maxNet = getMaxNetWithdrawable(
      profile?.wallet_balance ?? 0,
      withdrawChannel,
    );
    if (amt > maxNet) {
      notify(
        `จำนวนที่รับได้สูงสุดสำหรับช่องทางนี้คือ ${maxNet.toLocaleString()} บาท`,
        "error",
      );
      return;
    }
    const account = selectedWithdrawAccount ?? bankAccounts[0];
    if (withdrawChannel === "bank_transfer" && !account) {
      notify(
        "กรุณาเพิ่มบัญชีรับเงินใน Settings → Payment Methods ก่อนถอนเงิน",
        "error",
      );
      return;
    }
    setProcessing(true);
    try {
      const bankInfoStr =
        withdrawChannel === "bank_transfer" && account
          ? `${account.provider_name} - ${account.account_number}`
          : withdrawChannel === "promptpay"
            ? "PromptPay"
            : "TrueMoney Wallet";
      const updatedUser = await MockApi.walletWithdraw(
        amt,
        bankInfoStr,
        withdrawChannel,
      );
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      try {
        const txData = await MockApi.getTransactions(true);
        setTransactions(txData);
      } catch (_) {}
      notify("Withdrawal requested", "success");
      setActiveModal(null);
      setAmount("");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const slot: AvailabilitySlot = { id: Date.now(), ...newSlot };
    const updatedAvail = [...(profile?.availability || []), slot];
    const updatedUser = await MockApi.updateProfile({
      availability: updatedAvail,
    });
    setProfile(updatedUser);
    if (token) login(updatedUser, token);
    notify("Slot added", "success");
  };

  const handleDeleteSlot = async (id: number) => {
    const updatedAvail = profile?.availability?.filter((s) => s.id !== id);
    const updatedUser = await MockApi.updateProfile({
      availability: updatedAvail,
    });
    setProfile(updatedUser);
    if (token) login(updatedUser, token);
    notify("Slot removed", "success");
  };

  if (!profile)
    return <div className="p-8 text-center">{t("common.loading")}</div>;

  const activeCourse = courses.find((c) => c.id === activeCourseId);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Profile Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden">
        <div className="relative group">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-emerald-50 shadow-md">
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="w-full h-full object-cover"
            />
            {isAvatarAnalyzing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white text-xs">
                <Scan className="animate-pulse mb-1" size={20} /> Analyzing...
              </div>
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow border border-gray-200 text-gray-500 hover:text-emerald-600"
          >
            <Camera size={14} />
          </button>
          <input
            type="file"
            ref={avatarInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => handleFileSelect(e, "avatar")}
          />
        </div>

        <div className="flex-1 text-center md:text-left">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center md:justify-start gap-2">
            {profile.name}
            {profile.kyc_level === "level_2" && (
              <ShieldCheck className="text-emerald-500" size={20} />
            )}
          </h1>
          <p className="text-gray-500 text-sm mb-3">
            {profile.email || profile.phone}
          </p>
          <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                profile.role === UserRole.PROVIDER
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {profile.role}
            </span>
            {profile.is_boosted && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-700 flex items-center">
                <Rocket size={12} className="mr-1" /> Boosted
              </span>
            )}
          </div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 min-w-[200px] text-center md:text-right">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">
            {t("profile.wallet_title")}
          </p>
          <p className="text-2xl font-bold text-emerald-900">
            {profile.wallet_balance?.toLocaleString()} ฿
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-4 overflow-x-auto no-scrollbar">
        {["info", "training", "reviews", "wallet"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === "training") {
                // ✅ Navigate ke TrainingDashboard bukannya setActiveTab
                navigate("/training/dashboard");
              } else {
                setActiveTab(tab as any);
              }
            }}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap capitalize ${
              activeTab === tab
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "training" ? "Training Center" : t(`profile.tab_${tab}`)}
          </button>
        ))}
        {profile.role === UserRole.PROVIDER && (
          <>
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "calendar"
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setActiveTab("earnings")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "earnings"
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("profile.tab_earnings")}
            </button>
          </>
        )}
      </div>

      {/* --- CONTENT --- */}

      {activeTab === "info" && (
        <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 p-6 animate-in fade-in space-y-6">
          {/* 🛡️ Identity Verification Section */}
          <div className="border-2 border-blue-200 rounded-xl p-6 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                  <ShieldCheck className="text-white" size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    Identity Verification (KYC)
                    {profile.kyc_level === "level_2" && (
                      <span className="px-2 py-1 bg-emerald-500 text-white text-xs rounded-full">
                        ✓ Verified
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {profile.kyc_level === "level_2"
                      ? "บัญชีของคุณได้รับการยืนยันตัวตนแล้ว"
                      : "ยืนยันตัวตนเพื่อเพิ่มความน่าเชื่อถือและปลดล็อกฟีเจอร์พิเศษ"}
                  </p>
                </div>
              </div>

              {profile.kyc_level !== "level_2" && (
                <button
                  onClick={() => navigate("/kyc")}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg flex items-center gap-2 font-semibold"
                >
                  <ShieldCheck size={20} />
                  ยืนยันตัวตน
                </button>
              )}
            </div>

            {profile.kyc_level !== "level_2" && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div className="flex flex-col items-center">
                    <CheckCircle className="text-blue-600 mb-1" size={20} />
                    <span className="text-gray-700 font-medium">
                      เพิ่มความน่าเชื่อถือ
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <CheckCircle className="text-purple-600 mb-1" size={20} />
                    <span className="text-gray-700 font-medium">
                      รับงานได้มากขึ้น
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <CheckCircle className="text-pink-600 mb-1" size={20} />
                    <span className="text-gray-700 font-medium">
                      ปลอดภัยยิ่งขึ้น
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 🎯 RESUME/CV Section - LinkedIn Style */}

          {/* About/Summary */}
          <div className="border border-gray-100 rounded-xl p-6 bg-gradient-to-br from-blue-50 to-purple-50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <User className="mr-2 text-blue-600" size={24} />
              About
            </h2>
            <p className="text-gray-700 leading-relaxed">
              {profile.bio ||
                "เพิ่มข้อมูลเกี่ยวกับตัวคุณ ประสบการณ์ และความเชี่ยวชาญ..."}
            </p>
            <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
              <Edit2 size={14} className="mr-1" />
              แก้ไข
            </button>
          </div>

          {/* Skills Section */}
          <div className="border border-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Star className="mr-2 text-amber-500" size={24} />
                Skills & Expertise
              </div>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
                <Plus size={16} className="mr-1" />
                เพิ่มทักษะ
              </button>
            </h2>

            {profile.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {profile.skills.map((skill, index) => {
                  const isTrainingCompleted = profile.trainings?.some(
                    (t) =>
                      t.status === TrainingStatus.COMPLETED &&
                      t.category === skill,
                  );

                  return (
                    <div
                      key={index}
                      className="group relative px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-full hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">
                          {skill}
                        </span>
                        {isTrainingCompleted && (
                          <CheckCircle size={16} className="text-emerald-600" />
                        )}
                      </div>
                      {isTrainingCompleted && (
                        <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                          Certified
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                  <Star className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 font-medium mb-2">ยังไม่มีทักษะ</p>
                <p className="text-sm text-gray-400 mb-4">
                  เพิ่มทักษะเพื่อเพิ่มโอกาสในการหางาน
                </p>
                <button
                  onClick={() => navigate("/training/dashboard")}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                >
                  ไปที่ Training Center
                </button>
              </div>
            )}

            {profile.skills && profile.skills.length > 0 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {profile.skills.length}
                  </p>
                  <p className="text-xs text-gray-500">ทักษะทั้งหมด</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {profile.trainings?.filter(
                      (t) => t.status === TrainingStatus.COMPLETED,
                    ).length || 0}
                  </p>
                  <p className="text-xs text-gray-500">ผ่านการอบรม</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {profile.rating || 0}/5
                  </p>
                  <p className="text-xs text-gray-500">คะแนนรีวิว</p>
                </div>
              </div>
            )}
          </div>

          {/* Experience Section */}
          <div className="border border-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Briefcase className="mr-2 text-purple-600" size={24} />
                Experience
              </div>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
                <Plus size={16} className="mr-1" />
                เพิ่มประสบการณ์
              </button>
            </h2>

            <div className="space-y-6">
              {/* Example Experience Item */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    {profile.name?.[0] || "M"}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">Service Provider</h3>
                  <p className="text-sm text-gray-600">Meerak Platform</p>
                  <p className="text-xs text-gray-500 mt-1">
                    2024 - Present · 6 months
                  </p>
                  <p className="text-sm text-gray-700 mt-2">
                    ให้บริการงานช่างและงานต่างๆ ผ่านแพลตฟอร์ม Meerak
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {profile.skills?.slice(0, 3).map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-center py-4 border-t border-gray-100">
                <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                  ดูประสบการณ์ทั้งหมด →
                </button>
              </div>
            </div>
          </div>

          {/* Education Section */}
          <div className="border border-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <GraduationCap className="mr-2 text-green-600" size={24} />
                Education
              </div>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
                <Plus size={16} className="mr-1" />
                เพิ่มการศึกษา
              </button>
            </h2>

            <div className="text-center py-8">
              <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                <GraduationCap className="text-gray-400" size={32} />
              </div>
              <p className="text-gray-500 font-medium mb-2">
                ยังไม่มีข้อมูลการศึกษา
              </p>
              <p className="text-sm text-gray-400">
                เพิ่มประวัติการศึกษาเพื่อเพิ่มความน่าเชื่อถือ
              </p>
            </div>
          </div>

          {/* Certifications Section */}
          <div className="border border-gray-100 rounded-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Award className="mr-2 text-amber-600" size={24} />
                Licenses & Certifications
              </div>
            </h2>

            {profile.trainings && profile.trainings.length > 0 ? (
              <div className="space-y-4">
                {profile.trainings
                  .filter((t) => t.status === TrainingStatus.COMPLETED)
                  .map((training, index) => (
                    <div
                      key={index}
                      className="flex gap-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200"
                    >
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center">
                          <Award className="text-white" size={24} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">
                          {training.category}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Meerak Training Center
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Completed on{" "}
                          {new Date(
                            training.completed_at || "",
                          ).toLocaleDateString("th-TH")}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <CheckCircle size={14} className="text-emerald-600" />
                          <span className="text-xs text-emerald-600 font-medium">
                            Verified Certificate
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                  <Award className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 font-medium mb-2">
                  ยังไม่มีใบรับรอง
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  เข้ารับการอบรมเพื่อรับใบรับรองและเพิ่มความน่าเชื่อถือ
                </p>
                <button
                  onClick={() => navigate("/training/dashboard")}
                  className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                >
                  ดูคอร์สอบรม
                </button>
              </div>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center">
              <Phone size={16} className="mr-3" /> {profile.phone}
            </div>
            <div className="flex items-center">
              <Mail size={16} className="mr-3" /> {profile.email}
            </div>
            <div className="flex items-center">
              <User size={16} className="mr-3" /> {profile.bio || "No bio"}
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR */}
      {activeTab === "calendar" && (
        <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 p-8 animate-in fade-in">
          <h2 className="text-xl font-bold mb-6">Manage Availability</h2>
          <form onSubmit={handleAddSlot} className="flex gap-4 mb-6 items-end">
            <div>
              <label className="text-xs uppercase font-bold text-gray-500 block mb-1">
                Date
              </label>
              <input
                type="date"
                className="p-2 border rounded"
                value={newSlot.date}
                onChange={(e) =>
                  setNewSlot({ ...newSlot, date: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-gray-500 block mb-1">
                Start
              </label>
              <input
                type="time"
                className="p-2 border rounded"
                value={newSlot.startTime}
                onChange={(e) =>
                  setNewSlot({ ...newSlot, startTime: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-gray-500 block mb-1">
                End
              </label>
              <input
                type="time"
                className="p-2 border rounded"
                value={newSlot.endTime}
                onChange={(e) =>
                  setNewSlot({ ...newSlot, endTime: e.target.value })
                }
                required
              />
            </div>
            <button
              type="submit"
              className="bg-emerald-600 text-white px-4 py-2 rounded font-bold"
            >
              Add
            </button>
          </form>
          <div className="space-y-2">
            {profile.availability?.map((s) => (
              <div
                key={s.id}
                className="flex justify-between p-3 border rounded items-center"
              >
                <span>
                  {s.date} : {s.startTime} - {s.endTime}
                </span>
                <button
                  onClick={() => handleDeleteSlot(s.id)}
                  className="text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {(!profile.availability || profile.availability.length === 0) && (
              <p className="text-gray-400 text-sm">No slots added.</p>
            )}
          </div>
        </div>
      )}

      {/* WALLET */}
      {activeTab === "wallet" && (
        <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 p-8 animate-in fade-in">
          {/* ✅ เพิ่มส่วนแสดงยอดเงิน (เฉพาะ Provider) */}
          {user?.role === UserRole.PROVIDER && (
            <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl">
              <h3 className="font-bold text-lg mb-4 text-gray-800">
                💰 ยอดเงินของคุณ
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* ยอดเงินถอนได้ทันที */}
                <div className="p-4 bg-white border border-emerald-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">ถอนได้ทันที</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {(user.wallet_balance || 0).toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">สามารถถอนได้เลย</p>
                </div>

                {/* เงินรอการปล่อย */}
                <div className="p-4 bg-white border border-blue-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">รอการปล่อย</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {(user.wallet_pending || 0).toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    พร้อมถอนใน 24 ชม. ⏳
                  </p>
                </div>

                {/* ยอดรวมทั้งหมด */}
                <div className="p-4 bg-white border border-purple-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">รวมทั้งหมด</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {(
                      (user.wallet_balance || 0) + (user.wallet_pending || 0)
                    ).toLocaleString()}{" "}
                    บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">รายได้ทั้งหมด</p>
                </div>
              </div>

              {/* แสดงเวลาปล่อยเงินล่าสุด (ถ้ามี) */}
              {(user.wallet_pending || 0) > 0 && (
                <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  ⏳ คุณมีเงินรอการปล่อย{" "}
                  {(user.wallet_pending || 0).toLocaleString()} บาท
                  ที่จะพร้อมถอนใน 24 ชั่วโมงทำการ
                </div>
              )}
            </div>
          )}

          {/* ✅ สำหรับ Client แสดงแค่ยอดคงเหลือ */}
          {user?.role === UserRole.USER && (
            <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100 rounded-xl">
              <h3 className="font-bold text-lg mb-2 text-gray-800">
                💰 ยอดเงินคงเหลือ
              </h3>
              <p className="text-3xl font-bold text-emerald-600 mb-2">
                {(user.wallet_balance || 0).toLocaleString()} บาท
              </p>
              <p className="text-sm text-gray-600">
                ยอดเงินที่สามารถใช้จ่ายได้ทันที
              </p>
            </div>
          )}

          {/* ปุ่ม Deposit/Withdraw */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              onClick={() => setActiveModal("deposit")}
              className="p-6 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 flex flex-col items-center justify-center hover:bg-emerald-100 transition"
            >
              <ArrowDownCircle size={32} className="mb-2" />
              <span className="font-bold">เติมเงิน</span>
            </button>
            <button
              onClick={() => setActiveModal("withdraw")}
              className="p-6 bg-orange-50 border border-orange-100 rounded-xl text-orange-700 flex flex-col items-center justify-center hover:bg-orange-100 transition"
              disabled={
                user?.role === UserRole.PROVIDER &&
                (user.wallet_balance || 0) <= 0
              }
            >
              <ArrowUpCircle size={32} className="mb-2" />
              <span className="font-bold">
                {user?.role === UserRole.PROVIDER ? "ถอนเงิน" : "Withdraw"}
              </span>
              {user?.role === UserRole.PROVIDER &&
                (user.wallet_balance || 0) <= 0 && (
                  <span className="text-xs text-orange-500 mt-1">
                    ไม่มีเงินถอนได้
                  </span>
                )}
            </button>
          </div>

          <h3 className="font-bold mb-1">ประวัติการเคลื่อนไหวกระเป๋า</h3>
          <p className="text-xs text-gray-500 mb-4">
            เติมเงินเข้า · ถอนเงินออก · รายได้ · ชำระงาน
          </p>
          <div className="space-y-0 rounded-xl border border-gray-200 overflow-hidden">
            {transactions.length === 0 ? (
              <div className="p-8 text-center bg-gray-50">
                <Wallet className="mx-auto mb-2 w-10 h-10 text-gray-300" />
                <p className="text-gray-500 font-medium">
                  ยังไม่มีประวัติการเคลื่อนไหว
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  เมื่อมีการเติมเงิน ถอนเงิน หรือรายได้จากงาน จะแสดงที่นี่
                </p>
              </div>
            ) : (
              transactions.map((tx) => {
                const isIn =
                  tx.type === "deposit" ||
                  tx.type === "income" ||
                  tx.type === "tip";
                const typeLabel =
                  tx.type === "deposit"
                    ? "เติมเงินเข้า"
                    : tx.type === "withdrawal"
                      ? "ถอนเงินออก"
                      : tx.type === "income"
                        ? "รายได้จากงาน"
                        : tx.type === "payment" || tx.type === "payment_out"
                          ? "ชำระงาน"
                          : tx.type === "tip"
                            ? "ทิป"
                            : tx.description;
                const statusLabel =
                  tx.status === "completed"
                    ? "สำเร็จ"
                    : tx.status === "pending_release"
                      ? "รอถอนใน 24 ชม."
                      : tx.status === "pending"
                        ? "รอดำเนินการ"
                        : tx.status === "failed"
                          ? "ไม่สำเร็จ"
                          : tx.status === "waiting_admin"
                            ? "รอตรวจสอบ"
                            : null;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 p-4 border-b border-gray-100 last:border-0 bg-white hover:bg-gray-50/80 transition"
                  >
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        isIn
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {isIn ? (
                        <ArrowDownCircle size={20} />
                      ) : (
                        <ArrowUpCircle size={20} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">
                        {typeLabel}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(tx.date).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {statusLabel && (
                        <span
                          className={`inline-flex mt-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                            tx.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : tx.status === "pending_release"
                                ? "bg-blue-100 text-blue-800"
                                : tx.status === "pending"
                                  ? "bg-amber-100 text-amber-800"
                                  : tx.status === "failed"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span
                        className={`font-bold tabular-nums ${
                          isIn ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {isIn ? "+" : "-"}
                        {tx.amount.toLocaleString()} ฿
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* EARNINGS */}
      {activeTab === "earnings" && earningsStats && (
        <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 p-8 animate-in fade-in h-96">
          <h3 className="font-bold mb-6">Income Overview</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={earningsStats.chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* REVIEWS SECTION */}
      {activeTab === "reviews" && (
        <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 p-6 animate-in fade-in">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">รีวิวทั้งหมด</h3>
              <div className="flex items-center mt-1">
                <div className="flex text-yellow-400 mr-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      fill={i < (user?.rating || 0) ? "currentColor" : "none"}
                      className={i < (user?.rating || 0) ? "" : "text-gray-300"}
                    />
                  ))}
                </div>
                <span className="text-gray-600 text-sm">
                  {user?.rating?.toFixed(1) || "0.0"} ({reviews.length} รีวิว)
                </span>
              </div>
            </div>

            {user?.role === "provider" && (
              <button
                onClick={() => navigate("/provider/dashboard")}
                className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 text-sm font-medium"
              >
                👷 ดูงานที่รับ
              </button>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <Star className="mx-auto text-gray-300 mb-4" size={48} />
              <p className="text-gray-400">ยังไม่มีรีวิว</p>
              <p className="text-sm text-gray-400 mt-1">
                {user?.role === "provider"
                  ? "เมื่อมีคนรีวิวงานของคุณ จะปรากฏที่นี่"
                  : "รีวิวที่คุณเขียนจะปรากฏที่นี่"}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="p-5 border border-gray-100 rounded-xl hover:border-emerald-100 hover:bg-emerald-50/30 transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center">
                      <img
                        src={
                          review.reviewer_avatar ||
                          `https://ui-avatars.com/api/?name=${review.reviewer_name}&background=random`
                        }
                        alt={review.reviewer_name}
                        className="w-10 h-10 rounded-full mr-3 border-2 border-white shadow-sm"
                      />
                      <div>
                        <p className="font-bold text-gray-900">
                          {review.reviewer_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(review.created_at).toLocaleDateString(
                            "th-TH",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center bg-yellow-50 px-3 py-1 rounded-full">
                      <div className="flex text-yellow-400 mr-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            fill={i < review.rating ? "currentColor" : "none"}
                            className={i < review.rating ? "" : "text-gray-300"}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-yellow-700">
                        {review.rating}.0
                      </span>
                    </div>
                  </div>

                  {review.comment && (
                    <p className="text-gray-700 mb-4 leading-relaxed">
                      {review.comment}
                    </p>
                  )}

                  {review.tags && review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {review.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {review.job_id && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">สำหรับงาน:</p>
                      <button
                        onClick={() => navigate(`/jobs/${review.job_id}`)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ดูงานที่เกี่ยวข้อง →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- MODALS (Deposit / Withdraw) --- */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm animate-in zoom-in-95">
            {activeModal === "deposit" && depositStep === "qr" ? (
              <>
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-gray-800">
                    สแกน PromptPay QR
                  </h3>
                  <p className="text-2xl font-bold text-emerald-600 mt-2">
                    {Number(amount).toLocaleString()} ฿
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ค่าธรรมเนียม ~{PAYMENT_FEE.PROMPTPAY_THB} ฿/รายการ
                  </p>
                </div>
                {depositQrUrl && (
                  <div className="flex justify-center mb-4 p-4 bg-gray-50 rounded-2xl border-2 border-gray-100 shadow-inner">
                    <img
                      src={depositQrUrl}
                      alt="PromptPay QR"
                      className="w-52 h-52 object-contain"
                    />
                  </div>
                )}
                <p className="text-xs text-gray-500 mb-4 text-center">
                  {depositAutotest
                    ? "Auto Test — จะสำเร็จอัตโนมัติใน 2-3 วินาที"
                    : "เปิดแอปธนาคารแล้วสแกน QR เพื่อชำระ"}
                </p>
                <button
                  onClick={() => {
                    setActiveModal(null);
                    setDepositStep("amount");
                    setDepositQrUrl(null);
                    setDepositPaymentId(null);
                    setDepositMethod(null);
                  }}
                  className="w-full py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
              </>
            ) : activeModal === "deposit" &&
              depositStep === "bank_show" &&
              bankTransferRef ? (
              <>
                <h3 className="text-lg font-bold mb-3">โอนเข้าบัญชี</h3>
                <p className="text-sm text-gray-600 mb-4">
                  โอนเงิน <strong>{Number(amount).toLocaleString()} ฿</strong>{" "}
                  ตามรายละเอียดด้านล่าง และใส่เลขอ้างอิงในการโอน
                </p>
                {/* บัญชีที่ลงทะเบียนใน Payment Methods — ใช้โอนจากบัญชีนี้ */}
                {bankAccounts.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 mb-4 text-sm">
                    <p className="text-xs font-bold text-blue-800 uppercase mb-2">
                      บัญชีที่ลงทะเบียน (โอนจากบัญชีนี้)
                    </p>
                    <div className="flex justify-between">
                      <span className="text-gray-600">ธนาคาร</span>
                      <span className="font-semibold text-gray-800">
                        {bankAccounts[0].provider_name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">เลขที่บัญชี</span>
                      <span className="font-mono font-semibold text-gray-800">
                        {bankAccounts[0].account_number}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">ชื่อบัญชี</span>
                      <span className="text-gray-800">
                        {bankAccounts[0].account_name}
                      </span>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      ข้อมูลจาก Settings → Payment Methods
                    </p>
                  </div>
                )}
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                  โอนเข้าบัญชีของ Meerak
                </p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">ธนาคาร</span>
                    <span className="font-semibold">กสิกรไทย (KBANK)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">เลขที่บัญชี</span>
                    <span className="font-mono font-semibold">
                      123-4-56789-0
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ชื่อบัญชี</span>
                    <span>Meerak Co., Ltd.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      เลขอ้างอิง (ใส่ในหมายเหตุ)
                    </span>
                    <span className="font-mono text-emerald-600 font-bold">
                      {bankTransferRef.refId}
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">
                    Bill: {bankTransferRef.bill_no} · TX:{" "}
                    {bankTransferRef.transaction_no}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setDepositStep("amount");
                      setBankTransferRef(null);
                    }}
                    className="flex-1 py-2.5 border rounded-xl font-medium"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    onClick={handleConfirmBankTransferDone}
                    disabled={processing}
                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold"
                  >
                    {processing ? "..." : "โอนแล้ว — ยืนยัน"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-4">
                  {activeModal === "deposit" ? "เติมเงิน" : "ถอนเงิน"}
                </h3>
                {(activeModal !== "withdraw" || bankAccounts.length > 0) && (
                  <input
                    type="number"
                    placeholder={
                      activeModal === "withdraw"
                        ? "จำนวนที่รับได้ (บาท)"
                        : "Amount (฿)"
                    }
                    className="w-full p-3 border rounded mb-4"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={processing}
                  />
                )}
                {activeModal === "withdraw" &&
                  (!bankAccounts.length ? (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-medium text-amber-800 mb-2">
                        กรุณาเพิ่มบัญชีธนาคารก่อนถอนเงิน
                      </p>
                      <p className="text-xs text-amber-700 mb-3">
                        เพื่อความปลอดภัยและป้องกันการทุจริต
                        การถอนเงินจะทำได้เฉพาะเมื่อได้ลงทะเบียนบัญชีรับเงินใน
                        <strong> Settings → Payment Methods </strong>
                        แล้วเท่านั้น
                        และระบบอนุญาตให้ถอนเข้าบัญชีได้เพียงบัญชีเดียว
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null);
                          navigate("/settings");
                        }}
                        className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm"
                      >
                        ไปที่ Settings → Payment Methods
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-2">
                        เลือกช่องทางการถอน
                      </p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {(
                          [
                            {
                              channel: "promptpay" as PaymentChannel,
                              label: "PromptPay QR",
                              feeText: "25 บาท",
                            },
                            {
                              channel: "bank_transfer" as PaymentChannel,
                              label: "โอนธนาคาร",
                              feeText: "25 บาท",
                            },
                            {
                              channel: "truemoney" as PaymentChannel,
                              label: "TrueMoney",
                              feeText: "3.6%",
                            },
                          ] as const
                        ).map(({ channel, label, feeText }) => (
                          <button
                            key={channel}
                            type="button"
                            onClick={() => setWithdrawChannel(channel)}
                            className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition ${
                              withdrawChannel === channel
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 hover:border-gray-300 text-gray-600"
                            }`}
                          >
                            <span className="block font-medium">{label}</span>
                            <span className="block text-xs opacity-80 mt-0.5">
                              ค่าธรรมเนียม {feeText}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        {withdrawChannel === "bank_transfer" && (
                          <>
                            ถอนเข้าบัญชี:{" "}
                            <span className="font-medium text-gray-800">
                              {selectedWithdrawAccount
                                ? `${selectedWithdrawAccount.provider_name} - ${selectedWithdrawAccount.account_number}`
                                : bankAccounts[0]
                                  ? `${bankAccounts[0].provider_name} - ${bankAccounts[0].account_number}`
                                  : ""}
                            </span>{" "}
                            (ถอนได้เพียงบัญชีเดียว)
                          </>
                        )}
                        {withdrawChannel === "promptpay" && (
                          <>ถอนผ่าน PromptPay (ค่าธรรมเนียม 25 บาท/รายการ)</>
                        )}
                        {withdrawChannel === "truemoney" && (
                          <>ถอนเข้า TrueMoney Wallet (ค่าธรรมเนียม 3.6%)</>
                        )}
                      </p>
                      <p className="text-xs text-gray-600 mb-2">
                        ขั้นต่ำถอน {MIN_WITHDRAWAL_THB} บาท · ถอนได้สูงสุด{" "}
                        {getMaxNetWithdrawable(
                          profile?.wallet_balance ?? 0,
                          withdrawChannel,
                        ).toLocaleString()}{" "}
                        บาท (หักค่าธรรมเนียมตามช่องทางแล้ว)
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {([25, 50, 75] as const).map((pct) => {
                          const maxNet = getMaxNetWithdrawable(
                            profile?.wallet_balance ?? 0,
                            withdrawChannel,
                          );
                          const val = Math.floor((pct / 100) * maxNet);
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setAmount(String(val))}
                              disabled={maxNet <= 0 || processing}
                              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              {pct}%
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() =>
                            setAmount(
                              String(
                                getMaxNetWithdrawable(
                                  profile?.wallet_balance ?? 0,
                                  withdrawChannel,
                                ),
                              ),
                            )
                          }
                          disabled={
                            getMaxNetWithdrawable(
                              profile?.wallet_balance ?? 0,
                              withdrawChannel,
                            ) <= 0 || processing
                          }
                          className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-bold disabled:opacity-50"
                        >
                          ถอนเต็ม (Max)
                        </button>
                      </div>
                    </>
                  ))}
                {activeModal === "deposit" && (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      เลือกช่องทางเติมเงิน
                    </p>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => setDepositMethod("promptpay")}
                        className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition ${
                          depositMethod === "promptpay"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <Scan className="mx-auto mb-1 w-5 h-5" />
                        PromptPay QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositMethod("truemoney")}
                        className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition ${
                          depositMethod === "truemoney"
                            ? "border-orange-500 bg-orange-50 text-orange-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <CreditCard className="mx-auto mb-1 w-5 h-5" />
                        TrueMoney
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositMethod("bank_transfer")}
                        className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition ${
                          depositMethod === "bank_transfer"
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <Wallet className="mx-auto mb-1 w-5 h-5" />
                        โอนธนาคาร
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      PromptPay: ~{PAYMENT_FEE.PROMPTPAY_THB} ฿/รายการ ·
                      TrueMoney/โอนธนาคาร: ตามที่ระบุ
                    </p>
                    {(depositMethod === "promptpay" || !depositMethod) && (
                      <label className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                        <input
                          type="checkbox"
                          checked={depositAutotest}
                          onChange={(e) => setDepositAutotest(e.target.checked)}
                          className="rounded border-amber-300"
                        />
                        <span>Auto Test (PromptPay จำลองสำเร็จ)</span>
                      </label>
                    )}
                    <div className="flex flex-col gap-2 mb-4">
                      {depositMethod === "promptpay" && (
                        <button
                          onClick={handleDepositWithPromptPay}
                          disabled={
                            processing || !amount || isNaN(Number(amount))
                          }
                          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm"
                        >
                          {processing ? "..." : "สแกน PromptPay QR"}
                        </button>
                      )}
                      {depositMethod === "truemoney" && (
                        <button
                          onClick={handleDepositTrueMoney}
                          disabled={
                            processing || !amount || isNaN(Number(amount))
                          }
                          className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm"
                        >
                          {processing ? "..." : "เติมด้วย TrueMoney Wallet"}
                        </button>
                      )}
                      {depositMethod === "bank_transfer" &&
                        (bankAccounts.length ? (
                          <button
                            onClick={handleDepositBankTransfer}
                            disabled={!amount || isNaN(Number(amount))}
                            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm"
                          >
                            แสดงเลขบัญชี + เลขอ้างอิง
                          </button>
                        ) : (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-2">
                            <p className="text-sm font-medium text-amber-800 mb-2">
                              กรุณาเพิ่มบัญชีธนาคารก่อนเติมเงินผ่านโอนธนาคาร
                            </p>
                            <p className="text-xs text-amber-700 mb-3">
                              เพื่อยืนยันตัวตนและความถูกต้อง
                              ระบบขอให้ลงทะเบียนบัญชีใน{" "}
                              <strong>Settings → Payment Methods</strong>{" "}
                              ก่อนจึงจะใช้ช่องทางโอนเข้าบัญชีได้
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModal(null);
                                setDepositStep("amount");
                                setDepositMethod(null);
                                navigate("/settings");
                              }}
                              className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm"
                            >
                              ไปที่ Settings → Payment Methods
                            </button>
                          </div>
                        ))}
                      {!depositMethod && (
                        <p className="text-xs text-gray-400 text-center">
                          เลือกช่องทางด้านบนแล้วกดปุ่มเติมเงิน
                        </p>
                      )}
                    </div>
                  </>
                )}
                {activeModal === "withdraw" && bankAccounts.length > 0 && (
                  <p className="text-xs text-orange-600 mb-4 bg-orange-50 p-2 rounded">
                    ค่าธรรมเนียมถอนเงินตามช่องทาง:{" "}
                    {withdrawChannel === "truemoney" ? "3.6%" : "25 บาท/รายการ"}{" "}
                    (หักอัตโนมัติ).
                    {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
                      <>
                        {" "}
                        คุณจะได้รับ{" "}
                        <strong>
                          {Number(amount).toLocaleString()} บาท
                        </strong>{" "}
                        (หักจากกระเป๋า{" "}
                        {(
                          Number(amount) +
                          getWithdrawalFeeForNet(
                            withdrawChannel,
                            Number(amount),
                          )
                        ).toLocaleString()}{" "}
                        บาท)
                      </>
                    )}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      setDepositStep("amount");
                      setDepositQrUrl(null);
                      setDepositMethod(null);
                      setBankTransferRef(null);
                    }}
                    className="flex-1 py-2 border rounded"
                  >
                    Cancel
                  </button>
                  {activeModal === "withdraw" && bankAccounts.length > 0 && (
                    <button
                      onClick={handleWithdraw}
                      disabled={
                        processing ||
                        !amount ||
                        isNaN(Number(amount)) ||
                        Number(amount) < MIN_WITHDRAWAL_THB ||
                        Number(amount) >
                          getMaxNetWithdrawable(
                            profile?.wallet_balance ?? 0,
                            withdrawChannel,
                          )
                      }
                      className="flex-1 py-2 bg-emerald-600 text-white rounded font-bold disabled:opacity-50"
                    >
                      {processing ? "กำลังดำเนินการ..." : "ถอนเงิน"}
                    </button>
                  )}
                  {activeModal === "withdraw" && bankAccounts.length === 0 && (
                    <div className="flex-1 py-2 text-center text-sm text-gray-500">
                      เพิ่มบัญชีใน Settings ก่อน
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
