import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import { api } from "../services/api";
import { getModule2PassedCategories, type Module2PassedCategory } from "../services/nexusExamService";
import paymentGatewayService, {
  PaymentGateway,
  PaymentStatus as GatewayPaymentStatus,
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
import type {
  WalletDepositCreateResponse,
  WalletDepositManualCreateResponse,
  WalletDepositM1Step,
  WalletDepositPreviewResponse,
} from "../types/walletDepositContract";
import {
  buildWalletDepositPreviewRows,
  formatDepositAmountThb,
} from "../utils/walletDepositPreviewLabels";
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
  Loader2,
  FileText,
  X,
  Network,
  Copy,
  MapPin,
  QrCode,
  Eye,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { WorkerGradeBadge } from "../components/WorkerGradeBadge";
import { WalletGuideModal } from "../components/WalletGuideModal";
import { ProfileCalendarEmbed } from "../components/ProfileCalendarEmbed";
import VideoStoryGrid from "../components/VideoStoryGrid";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;
/** QR พร้อมเพย์นิ่งสำหรับเติมเงินแบบแนบสลิป (วางไฟล์จริงที่ public/deposit/) */
const WALLET_MANUAL_KTB_QR = "/deposit/ktb-promptpay-manual-qr.png";
import { VideoUploader } from "../components/VideoUploader";
import { PortfolioImageUploader } from "../components/PortfolioImageUploader";
import { videoService } from "../services/videoService";
import FirebaseApi from "../services/firebase";
import { gradeService, type GradeData, type ReviewStats } from "../services/gradeService";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { VIPBadge } from "../components/VIPBadge";
import { UserDisplayBadge } from "../components/UserDisplayBadge";
import {
  BrandAdviserBadge,
  BrandAdviserSuspendBanner,
  BrandAdviserProgramOffNotice,
  BrandAdviserReputationHint,
} from "../components/BrandAdviserBadge";
import { formatDateThaiShort } from "../utils/dateFormat";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  initCardTokenSdk,
  createCardToken,
  formatCardNumber,
  formatExpiry,
  parseExpiry,
} from "../services/cardTokenization";

// --- TAX DOCUMENTS SECTION ---
const TaxDocumentsSection: React.FC<{
  api: { get: (url: string, config?: any) => Promise<{ data: any }>; post: (url: string, body?: any) => Promise<{ data: any }> };
  notify: (msg: string, type: "success" | "error" | "info") => void;
  user: UserProfile | null;
  profile: UserProfile | null;
  onRefresh?: () => Promise<void>;
}> = ({ api, notify, user, profile, onRefresh }) => {
  const [documents, setDocuments] = useState<Array<{ id: string; type: string; amount: number; bill_no?: string; tax_ref_id?: string; created_at: string }>>([]);
  const [statements, setStatements] = useState<Array<{ id: string; period_from: string; period_to: string; fee_amount: number; status: string; qr_verification_code?: string; created_at: string }>>([]);
  const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const loadTaxDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/wallet/tax-documents?month=${month}&year=${year}`);
      setDocuments(data?.documents || []);
      setStatements(data?.statements || []);
    } catch {
      setDocuments([]);
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, [api, month, year]);

  useEffect(() => {
    loadTaxDocs();
  }, [loadTaxDocs]);

    const handleRequestStatement = async () => {
    const from = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    if (!confirm(`ขอใบรับรองรายได้ ${month}/${year} — ค่าธรรมเนียม 50 บาท จะถูกหักจากกระเป๋า ต้องการดำเนินการต่อ?`)) return;
    setRequesting(true);
    try {
      const { data } = await api.post("/wallet/request-certified-statement", { period_from: from, period_to: to });
      notify(data?.message || "ขอใบรับรองสำเร็จ", "success");
      loadTaxDocs();
      await onRefresh?.();
      if (data?.pdf_url) {
        notify("กดดาวน์โหลด PDF ได้จากรายการด้านล่าง", "info");
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || e?.message || "ขอใบรับรองไม่สำเร็จ", "error");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <option key={m} value={String(m).padStart(2, "0")}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
          {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        <button onClick={loadTaxDocs} disabled={loading} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? "โหลด..." : "กรอง"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRequestStatement}
          disabled={requesting || (profile?.wallet_balance ?? 0) < 50}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <QrCode size={16} />
          {requesting ? "กำลังดำเนินการ..." : "ขอใบรับรองรายได้ (50 บาท)"}
        </button>
      </div>
      <p className="text-xs text-amber-600">ค่าธรรมเนียม 25–100 บาท ต่อใบ — หักจากกระเป๋า</p>
      {documents.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">ใบเสร็จ/รายการ</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {documents.map((d) => (
              <div key={d.id} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <span>{d.type} · ฿{d.amount.toLocaleString()}</span>
                <span className="text-xs text-gray-500">{d.tax_ref_id || d.bill_no || d.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {statements.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">ใบรับรองที่ขอแล้ว</p>
          <div className="space-y-1">
            {statements.map((s) => (
              <div key={s.id} className="flex justify-between items-center py-2 px-3 bg-emerald-50 rounded-lg text-sm">
                <span>{s.period_from} – {s.period_to} · ฿{s.fee_amount}</span>
                <div className="flex items-center gap-2">
                  {s.pdf_url && (
                    <button
                      onClick={async () => {
                        try {
                          const { data } = await api.get(`/wallet/certified-statement/${s.id}/pdf`, { responseType: "blob" });
                          const url = URL.createObjectURL(data);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `certified-statement-${s.period_from}-${s.period_to}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (e) {
                          notify("ดาวน์โหลดไม่สำเร็จ", "error");
                        }
                      }}
                      className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      ดาวน์โหลด PDF
                    </button>
                  )}
                  <span className="text-xs text-emerald-600">{s.qr_verification_code ? "มี QR" : s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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

// ── Provider: สวิตซ์รับงาน + ที่อยู่ + ปักหมุด ─────────────────────────────
const ProviderAvailabilityBlock: React.FC<{
  profile: UserProfile | null;
  onUpdate: () => void;
  notify: (msg: string, type: "success" | "error" | "info") => void;
}> = ({ profile, onUpdate, notify }) => {
  const [available, setAvailable] = useState(!!(profile as any)?.provider_available);
  const [residentialAddress, setResidentialAddress] = useState((profile as any)?.residential_address || "");
  const [saving, setSaving] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<{ lat: number; lng: number; address?: string } | null>(() => {
    const loc = (profile as any)?.location;
    if (loc && typeof loc === "object" && loc.lat != null && loc.lng != null) {
      return { lat: loc.lat, lng: loc.lng, address: loc.address };
    }
    return null;
  });
  useEffect(() => {
    const loc = (profile as any)?.location;
    if (loc && typeof loc === "object" && loc.lat != null && loc.lng != null) {
      setPinnedLocation({ lat: loc.lat, lng: loc.lng, address: loc.address });
    }
  }, [profile]);

  const toggleAvailability = async () => {
    setSaving(true);
    try {
      const res = await MockApi.setProviderAvailability(!available);
      if (res.success) {
        setAvailable(!!res.provider_available);
        notify(res.provider_available ? "เปิดรับงานแล้ว" : "ปิดรับงานแล้ว", "success");
        onUpdate();
      } else {
        notify("ไม่สามารถเปลี่ยนสถานะได้", "error");
      }
    } catch (_) {
      notify("เกิดข้อผิดพลาด", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async () => {
    setSaving(true);
    try {
      const res = await MockApi.setResidentialAddress(residentialAddress);
      if (res.success) {
        notify("บันทึกที่อยู่แล้ว", "success");
        onUpdate();
      } else {
        notify("บันทึกไม่สำเร็จ", "error");
      }
    } catch (_) {
      notify("เกิดข้อผิดพลาด", "error");
    } finally {
      setSaving(false);
    }
  };

  const pinCurrentLocation = () => {
    if (!navigator.geolocation) {
      notify("เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง", "error");
      return;
    }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await MockApi.pinProviderLocation(lat, lng);
          if (res.success) {
            setPinnedLocation({ lat, lng });
            notify("ปักหมุดตำแหน่งแล้ว — งานใกล้เคียงจะเห็นคุณ", "success");
            onUpdate();
          } else {
            notify("ปักหมุดไม่สำเร็จ", "error");
          }
        } catch (_) {
          notify("เกิดข้อผิดพลาด", "error");
        } finally {
          setSaving(false);
        }
      },
      () => {
        notify("ไม่สามารถระบุตำแหน่งได้", "error");
        setSaving(false);
      }
    );
  };

  return (
    <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
      <h3 className="text-lg font-bold text-slate-100 mb-4">การรับงาน</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-300">สวิตซ์รับงาน</span>
          <button
            onClick={toggleAvailability}
            disabled={saving}
            data-tour="talent-online-toggle"
            className={`relative w-12 h-6 rounded-full transition-colors ${available ? "bg-emerald-600" : "bg-slate-600"}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${available ? "translate-x-6" : ""}`} />
          </button>
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-2">ปักหมุดตำแหน่ง (รอรับงานใกล้เคียง)</label>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={pinCurrentLocation}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <MapPin size={16} /> {pinnedLocation ? "อัปเดตตำแหน่ง" : "ปักหมุดตำแหน่งปัจจุบัน"}
            </button>
            {pinnedLocation && (
              <span className="text-slate-400 text-sm">
                {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lng.toFixed(4)}
              </span>
            )}
          </div>
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-2">ที่อยู่อาศัยปัจจุบัน (สำหรับติดตามกรณีฉุกเฉิน)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={residentialAddress}
              onChange={(e) => setResidentialAddress(e.target.value)}
              placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด"
              className="flex-1 px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500"
            />
            <button
              onClick={saveAddress}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Connection Tab: UID:Key, Coach-Trainee ─────────────────────────────────
const ConnectionTab: React.FC<{ userId?: string }> = ({ userId }) => {
  const { notify } = useNotification();
  const [keyData, setKeyData] = useState<{ connection_key?: string; uid_key?: string } | null>(null);
  const [connections, setConnections] = useState<{ as_coach: any[]; as_trainee: any[] }>({ as_coach: [], as_trainee: [] });
  const [traineeKey, setTraineeKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [keyRes, listRes] = await Promise.all([
        MockApi.getConnectionKey(),
        MockApi.getConnectionList()
      ]);
      setKeyData(keyRes);
      setConnections(listRes);
    } catch (e) {
      notify("โหลดข้อมูลล้มเหลว", "error");
    } finally {
      setLoading(false);
    }
  }, [userId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const copyKey = () => {
    if (keyData?.uid_key) {
      navigator.clipboard.writeText(keyData.uid_key);
      notify("คัดลอก UID:Key แล้ว", "success");
    }
  };

  const addTrainee = async () => {
    const k = traineeKey.trim().toUpperCase();
    if (!k) {
      notify("กรุณากรอกรหัสศิษย์", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await MockApi.coachAddTrainee(k);
      if (res.success) {
        notify(res.needs_trainee_confirm ? "เพิ่มแล้ว — รอศิษย์กดยืนยัน" : "เชื่อมต่อสำเร็จ", "success");
        setTraineeKey("");
        load();
      } else {
        notify("ไม่พบรหัสหรือไม่สามารถเพิ่มได้", "error");
      }
    } catch (e: any) {
      notify(e.response?.data?.error || "เพิ่มไม่สำเร็จ", "error");
    } finally {
      setAdding(false);
    }
  };

  const confirmConn = async (connId: string, asTrainee: boolean) => {
    try {
      await MockApi.confirmConnection(connId, asTrainee);
      notify("ยืนยันแล้ว", "success");
      load();
    } catch (e: any) {
      notify(e.response?.data?.error || "ยืนยันไม่สำเร็จ", "error");
    }
  };

  if (!userId) return null;
  return (
    <div className="connection-tab luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <Network size={20} /> Connection
      </h3>
      <p className="text-slate-400 text-sm">
        รหัส UID:Key ของคุณ — โค้ชกรอกรหัสศิษย์เพื่อเชื่อมต่อ ต้องทั้งสองฝ่ายกดยืนยัน
      </p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 size={32} className="animate-spin mb-4" />
          <span>กำลังโหลด...</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 p-4 bg-charcoal-800/50 rounded-xl border border-gold/10">
            <span className="text-slate-400">UID:Key ของคุณ:</span>
            <code className="px-4 py-2 bg-slate-900 rounded-lg font-mono text-emerald-400">
              {keyData?.uid_key || keyData?.connection_key || "—"}
            </code>
            <button
              onClick={copyKey}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-900/30 text-emerald-400 border border-emerald-700/40 rounded-lg hover:bg-emerald-800/30"
            >
              <Copy size={16} /> คัดลอก
            </button>
          </div>

          <div className="space-y-6">
            <h4 className="font-semibold text-slate-200">โค้ชกรอกรหัสศิษย์</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={traineeKey}
                onChange={(e) => setTraineeKey(e.target.value.toUpperCase())}
                placeholder="กรอกรหัสศิษย์ (เช่น ABC12345)"
                className="flex-1 px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500"
              />
              <button
                onClick={addTrainee}
                disabled={adding}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {adding ? "กำลังเพิ่ม..." : "เพิ่มศิษย์"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-slate-200 mb-3">ศิษย์ที่คุณเทรนด์</h4>
              {connections.as_coach.length === 0 ? (
                <p className="text-slate-500 text-sm">ยังไม่มีศิษย์</p>
              ) : (
                <ul className="space-y-2">
                  {connections.as_coach.map((c) => (
                    <li key={c.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-200">{c.trainee_name || c.trainee_key}</span>
                      <span className={`text-xs px-2 py-1 rounded ${c.status === 'active' ? 'bg-emerald-900/30 text-emerald-400' : c.status === 'graduated' ? 'bg-amber-900/30 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                        {c.status === 'pending' && c.needs_confirm ? 'รอศิษย์ยืนยัน' : c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-slate-200 mb-3">โค้ชของคุณ</h4>
              {connections.as_trainee.length === 0 ? (
                <p className="text-slate-500 text-sm">ยังไม่มีโค้ช</p>
              ) : (
                <ul className="space-y-2">
                  {connections.as_trainee.map((c) => (
                    <li key={c.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-200">{c.coach_name || c.coach_key}</span>
                      <span className={`text-xs px-2 py-1 rounded ${c.status === 'active' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                        {c.status}
                      </span>
                      {c.needs_confirm && (
                        <button
                          onClick={() => confirmConn(c.id, true)}
                          className="text-xs px-2 py-1 bg-amber-600 text-white rounded"
                        >
                          ยืนยัน
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ช่วงเวลาว่างสำหรับ Advance Booking (Talent ตั้งได้ใน Portfolio tab)
const AvailabilitySlotsBlock: React.FC = () => {
  const { notify } = useNotification();
  const [slots, setSlots] = useState<Array<{ id: string; start_time: string; end_time: string }>>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ slots?: Array<{ id: string; start_time: string; end_time: string }> }>("/availability/me/slots");
      setSlots(data.slots || []);
    } catch (_) {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addSlot = async () => {
    if (!start || !end) {
      notify("กรุณาเลือกเวลาเริ่มและสิ้นสุด", "error");
      return;
    }
    setAdding(true);
    try {
      await api.post("/availability/slots", { start_time: start, end_time: end });
      notify("เพิ่มช่วงเวลาว่างแล้ว", "success");
      setStart("");
      setEnd("");
      load();
    } catch (e: any) {
      notify(e.response?.data?.error || "เพิ่มไม่สำเร็จ", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <span className="text-xs text-slate-500 block mb-1">เริ่ม</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm"
          />
        </div>
        <div>
          <span className="text-xs text-slate-500 block mb-1">สิ้นสุด</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={addSlot}
          disabled={adding}
          className="px-4 py-2 rounded-lg bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50"
        >
          {adding ? "กำลังเพิ่ม..." : "เพิ่มช่วงเวลา"}
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">โหลด...</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-slate-500">ยังไม่มีช่วงเวลาว่าง — เพิ่มด้านบน</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-slate-300">
          {slots.slice(0, 20).map((s) => (
            <li key={s.id}>
              {new Date(s.start_time).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} – {new Date(s.end_time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            </li>
          ))}
          {slots.length > 20 && <li className="text-slate-500">... และอีก {slots.length - 20} ช่วง</li>}
        </ul>
      )}
    </div>
  );
};

// --- MAIN PROFILE COMPONENT ---

export const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [certifiedSkills, setCertifiedSkills] = useState<Module2PassedCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [workerGrade, setWorkerGrade] = useState<GradeData | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  /** รายการจาก Backend (payment_ledger_audit) — แสดง "จากงาน Advance Job ID" + Commission + ค่าประกัน + ทิป */
  const [walletLedgerTransactions, setWalletLedgerTransactions] = useState<Array<{ id: string; amount: number; direction: string; description: string; status?: string; commission_deducted?: number; insurance_amount?: number; tips_amount?: number; created_at: string; event_type?: string; job_id?: string; gross_earnings?: number; handling_fee?: number; commission_fee?: number; commission_percent?: number }>>([]);
  const [feeTooltipId, setFeeTooltipId] = useState<string | null>(null);
  /** Wallet history filter: all | deposit | withdrawal | income — default All */
  const [walletHistoryFilter, setWalletHistoryFilter] = useState<"all" | "deposit" | "withdrawal" | "income">("all");
  /** คำขอถอนเงินจาก Backend (GET /api/payouts/me) */
  const [payoutRequests, setPayoutRequests] = useState<Array<{ id: string; amount: number; bank_details: Record<string, unknown>; status: string; admin_notes?: string; transaction_id?: string; created_at: string; processed_at?: string }>>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<
    "info" | "reviews" | "wallet" | "earnings" | "training" | "calendar" | "portfolio" | "story" | "connection"
  >("info");
  /** ช่วงเวลาที่เลือกดูรายได้: สัปดาห์ / เดือน / ปี */
  const [earningsTimeRange, setEarningsTimeRange] = useState<"week" | "month" | "year">("month");
  const [profileWorkClips, setProfileWorkClips] = useState<{ id: string; url: string; type?: string }[]>([]);
  const [backendWorkClips, setBackendWorkClips] = useState<{ id: string; url: string; title?: string; description?: string }[]>([]);

  const { t } = useLanguage();
  const { token, login, user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "info" ||
      tab === "reviews" ||
      tab === "wallet" ||
      tab === "earnings" ||
      tab === "training" ||
      tab === "calendar" ||
      tab === "portfolio" ||
      tab === "story" ||
      tab === "connection"
    ) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // บัญชีรับเงินจาก Payment Methods (Settings) — ใช้ user จาก Auth เพื่อให้ตรงกับ Settings เสมอ
  const bankAccounts = user?.bank_accounts ?? profile?.bank_accounts ?? [];

  // Wallet Modal State
  const [showWalletGuide, setShowWalletGuide] = useState(false);
  const [activeModal, setActiveModal] = useState<"deposit" | "withdraw" | null>(
    null,
  );
  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [depositMethod, setDepositMethod] = useState<
    "promptpay" | "truemoney" | "mobile_banking" | "bank_transfer" | "card" | null
  >(null);
  const [bankTransferRef, setBankTransferRef] = useState<{
    refId: string;
    bill_no: string;
    transaction_no: string;
  } | null>(null);
  const [depositStep, setDepositStep] = useState<
    "amount" | "qr" | "bank_show" | "manual_static"
  >("amount");
  /** ช่องทางรอง: บัตร / TrueMoney / โอนบริษัท */
  const [depositOtherChannelsOpen, setDepositOtherChannelsOpen] = useState(false);
  /** สลิปสำหรับเส้นทาง QR นิ่ง KTB (แยกจาก slip โอนบริษัท) */
  const [manualStaticSlipFile, setManualStaticSlipFile] = useState<File | null>(null);
  const [manualStaticQrExpanded, setManualStaticQrExpanded] = useState(true);
  const [cardFormData, setCardFormData] = useState({
    number: "",
    name: "",
    expiry: "",
    cvc: "",
  });
  const [depositQrUrl, setDepositQrUrl] = useState<string | null>(null);
  const [depositPaymentId, setDepositPaymentId] = useState<string | null>(null);
  const [showRefundPolicy, setShowRefundPolicy] = useState(false);
  const [refundPolicyContent, setRefundPolicyContent] = useState('');
  const [refundPolicyVersion, setRefundPolicyVersion] = useState<string>('');
  const [refundPolicyUpdated, setRefundPolicyUpdated] = useState<string>('');
  const [selectedWithdrawAccount, setSelectedWithdrawAccount] =
    useState<BankAccount | null>(null);
  const [withdrawChannel, setWithdrawChannel] =
    useState<PaymentChannel>("bank_transfer");
  /** Provider: Batch (35) vs Instant (50) — ใช้กับ /api/payouts/request */
  const [withdrawSpeed, setWithdrawSpeed] = useState<"batch" | "instant">("batch");
  /** Provider: ข้อมูลสิทธิ์ถอนจาก GET /api/payouts/eligibility (10 งาน หรือ 650 บาท) */
  const [payoutEligibility, setPayoutEligibility] = useState<{
    eligible: boolean;
    reason: string | null;
    min_jobs: number;
    completed_jobs: number;
    min_balance_thb: number;
    balance: number;
    pending: number;
    fee_standard_thb: number;
    fee_instant_thb: number;
  } | null>(null);
  
  // Company Bank Accounts for Bank Transfer Deposit
  const [companyBankAccounts, setCompanyBankAccounts] = useState<Array<{ id: string; bank_name: string; account_number: string; account_name: string; branch: string | null }>>([]);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  /** แนบสลิปครบแล้วสำหรับรายการที่มี charge_id (PromptPay / บัตร / TrueMoney) — ใช้ ref ใน poll เพื่อไม่ให้ closure ล้าสมัย */
  const depositSlipUploadedRef = useRef(false);
  /** ค่าจาก API `source_type` (เช่น payso) — ไม่ต้องบังคับสลิปก่อนสำเร็จเมื่อชำระยืนยันฝั่งเกตเวย์แล้ว */
  const walletDepositChargeSourceRef = useRef<string | null>(null);
  const [depositChargeSourceType, setDepositChargeSourceType] = useState<string | null>(null);
  const depositPendingSuccessMessageRef = useRef("เติมเงินสำเร็จ");
  /** ชำระสำเร็จแล้วแต่ยังไม่มีสลิป — แสดงหน้าจอแนบสลิป */
  const [depositSuccessPendingSlip, setDepositSuccessPendingSlip] = useState(false);
  const [truemoneyPhone, setTruemoneyPhone] = useState("");
  const [mobileBankingBankCode, setMobileBankingBankCode] = useState<"bbl" | "bay" | "ktb" | "scb">("scb");
  const [paysoAutoCloseCountdown, setPaysoAutoCloseCountdown] = useState<number | null>(null);
  const paysoAutoCloseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paysoSuccessHandledRef = useRef(false);

  /** M0: fee breakdown จาก GET /wallet/deposit/preview เท่านั้น */
  const [walletDepositPreview, setWalletDepositPreview] = useState<WalletDepositPreviewResponse | null>(null);
  const [walletDepositPreviewError, setWalletDepositPreviewError] = useState<string | null>(null);
  const [walletDepositPreviewLoading, setWalletDepositPreviewLoading] = useState(false);

  /** Phase M1 — deposit modal flow (Manual + gateway auto-credit channels). */
  const [walletDepositM1Step, setWalletDepositM1Step] = useState<WalletDepositM1Step | null>(null);
  const [walletM1Method, setWalletM1Method] = useState<
    "manual_slip" | "payso_promptpay" | "gateway_card" | "gateway_truemoney" | "gateway_mobile_banking" | null
  >(null);
  const [manualDepositSubmitResult, setManualDepositSubmitResult] =
    useState<Pick<WalletDepositManualCreateResponse, "id" | "status" | "amount"> | null>(null);

  /** M1: WalletDashboard → Profile opens deposit modal once. */
  useEffect(() => {
    if (searchParams.get("openDeposit") !== "1") return;
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H1",location:"mobile/pages/Profile.tsx:openDeposit-useEffect",message:"openDeposit query consumed and modal bootstrap started",data:{openDeposit:searchParams.get("openDeposit"),tab:searchParams.get("tab")},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setActiveTab("wallet");
    setActiveModal("deposit");
    setWalletDepositM1Step("choose_method");
    setWalletM1Method(null);
    setManualDepositSubmitResult(null);
    setAmount("");
    setWalletDepositPreview(null);
    setWalletDepositPreviewError(null);
    setWalletDepositPreviewLoading(false);
    setDepositStep("amount");
    setDepositMethod(null);
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    setDepositSuccessPendingSlip(false);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setManualStaticSlipFile(null);
    setDepositOtherChannelsOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("openDeposit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchWalletDepositPreviewOnDemand = useCallback(async () => {
    const amt = Number(amount);
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H2",location:"mobile/pages/Profile.tsx:fetchWalletDepositPreviewOnDemand:start",message:"preview button triggered",data:{amountRaw:amount,amountParsed:amt,walletM1Method},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!Number.isFinite(amt) || amt < 1) {
      notify("กรุณากรอกยอดตั้งแต่ 1 บาทขึ้นไป", "error");
      return;
    }
    const payment_method =
      walletM1Method === "payso_promptpay"
        ? "promptpay"
        : walletM1Method === "gateway_card"
          ? "card"
          : walletM1Method === "gateway_truemoney"
            ? "truemoney"
            : walletM1Method === "gateway_mobile_banking"
              ? "mobile_banking"
              : "manual";
    setWalletDepositPreviewLoading(true);
    setWalletDepositPreviewError(null);
    setWalletDepositPreview(null);
    try {
      const { data } = await api.get<WalletDepositPreviewResponse>(`/wallet/deposit/preview`, {
        params: { amount: amt, payment_method },
      });
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H2",location:"mobile/pages/Profile.tsx:fetchWalletDepositPreviewOnDemand:success",message:"preview response received",data:{payment_method,gross_amount:data?.gross_amount,processing_fee:data?.processing_fee,net_to_wallet:data?.net_to_wallet},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setWalletDepositPreview(data);
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.error ||
        (e instanceof Error ? e.message : String(e));
      setWalletDepositPreview(null);
      setWalletDepositPreviewError(typeof msg === "string" ? msg : "โหลดค่าธรรมเนียมไม่ได้");
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H2",location:"mobile/pages/Profile.tsx:fetchWalletDepositPreviewOnDemand:error",message:"preview request failed",data:{payment_method,error:typeof msg === "string" ? msg : "unknown"},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } finally {
      setWalletDepositPreviewLoading(false);
    }
  }, [amount, walletM1Method, notify]);

  // Receipt Modal State
  const [receiptModal, setReceiptModal] = useState<{
    id: string;
    receipt_no: string;
    transaction_no: string;
    date: string;
    amount: number;
    currency: string;
    payment_method: string;
    description: string;
    company: { name: string; address: string; tax_id: string; phone: string };
    customer: { name: string; email: string };
  } | null>(null);

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
  const [kycNeedsReverify, setKycNeedsReverify] = useState(false);
  const [kycReverifyLoading, setKycReverifyLoading] = useState(false);

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
    const cardPub = import.meta.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY;
    if (cardPub) {
      initCardTokenSdk(cardPub);
    }

    // Fetch company bank accounts for Bank Transfer deposit
    const fetchCompanyBanks = async () => {
      try {
        const { data } = await api.get<{ accounts: Array<{ id: string; bank_name: string; account_number: string; account_name: string; branch: string | null }> }>('/bank-accounts');
        setCompanyBankAccounts(data.accounts || []);
      } catch (e) {
        console.warn('Failed to load company bank accounts:', e);
        setCompanyBankAccounts([]);
      }
    };
    fetchCompanyBanks();

    const fetchData = async () => {
      console.log("🔄 Starting fetchData...");

      try {
        // 1. ดึงข้อมูลผู้ใช้ (refresh=true เพื่อให้ MyWallet ปรับตามหลังส่งทิป/รับทิป)
        const data = await MockApi.getProfile(user?.id, { refresh: true });
        console.log("✅ User data loaded:", {
          name: data.name,
          role: data.role,
          wallet_balance: data.wallet_balance,
          wallet_pending: data.wallet_pending,
        });

        setProfile(data);

        // ซิงค์ wallet ไป AuthContext — เพื่อให้ Mywallet ใน Profile ปรับตามหลังส่งทิป/รับทิป
        if (user && token && data) {
          login({ ...user, wallet_balance: data.wallet_balance, wallet_pending: data.wallet_pending }, token);
        }

        // 1b. ดึง Module 2 certified skills จาก backend
        // ใช้ user.id จาก AuthContext (PostgreSQL UUID จาก login) แทน data.id
        // เพื่อหลีกเลี่ยงกรณี Firestore fallback คืน Firebase UID เป็น id
        const certUserId = user?.id || data.id;
        if (certUserId) {
          getModule2PassedCategories(certUserId)
            .then((cats) => {
              console.log('✅ [Profile] Certified skills loaded:', cats.length, cats);
              setCertifiedSkills(cats);
            })
            .catch((e) => console.warn('[Profile] getModule2PassedCategories failed:', e));
        }

        // 2. ดึง transaction พร้อมกรองตาม role
        const txData = await MockApi.getTransactions();
        setTransactions(txData);
        console.log("✅ Transactions loaded:", txData.length);

        // 2a. ดึงประวัติกระเป๋าจาก Backend (Advance Job + Commission)
        try {
          const { data } = await api.get<{ transactions?: Array<{ id: string; amount: number; direction: string; description: string; status?: string; event_type?: string; commission_deducted?: number; created_at: string }> }>("/wallet/transactions");
          const txs = data.transactions || [];
          setWalletLedgerTransactions(txs);
          // #region agent log
          fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H11",location:"mobile/pages/Profile.tsx:loadProfile:/wallet/transactions",message:"wallet transactions loaded for profile",data:{total:txs.length,pending_count:txs.filter((x)=>String(x?.status||"").toLowerCase()==="pending").length,deposit_count:txs.filter((x)=>String(x?.event_type||"")==="wallet_deposit").length},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        } catch (e) {
          setWalletLedgerTransactions([]);
        }
        // 2a-2. ดึงประวัติคำขอถอน (GET /api/payouts/me)
        try {
          const { data: payoutsData } = await api.get<{ requests?: Array<{ id: string; amount: number; bank_details: Record<string, unknown>; status: string; admin_notes?: string; transaction_id?: string; created_at: string; processed_at?: string }> }>("/payouts/me");
          setPayoutRequests(payoutsData.requests || []);
        } catch (e) {
          setPayoutRequests([]);
        }
        // 2a-3. Provider: ดึงสิทธิ์ถอน (10 งาน หรือ 650 บาท)
        if (data.role === UserRole.PROVIDER || data.role === "provider") {
          try {
            const { data: eligData } = await api.get<{
              eligible: boolean;
              reason: string | null;
              min_jobs: number;
              completed_jobs: number;
              min_balance_thb: number;
              balance: number;
              pending: number;
              fee_standard_thb: number;
              fee_instant_thb: number;
            }>("/payouts/eligibility");
            setPayoutEligibility(eligData);
          } catch {
            setPayoutEligibility(null);
          }
        }

        // 2b. KYC status (สำหรับ Re-Verify banner)
        try {
          const kycStatus = await MockApi.checkKYCStatus();
          setKycNeedsReverify(!!kycStatus?.needsReverify);
        } catch (_) {
          setKycNeedsReverify(false);
        }

        // 2c. ดึง Verified Work Clips จาก Firestore + Backend talent_videos (Provider เท่านั้น)
        if (data.id && (data.role === UserRole.PROVIDER || data.role === "provider")) {
          FirebaseApi.getProviderWorkClips(data.id).then(setProfileWorkClips).catch(() => setProfileWorkClips([]));
          videoService.getMyVideos().then((list) => {
            setBackendWorkClips((list || []).map((v) => ({ id: v.id, url: v.video_url, title: v.title || undefined, description: v.description || undefined })));
          }).catch(() => setBackendWorkClips([]));
        }

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

        // 5. Earnings — ใช้ข้อมูลจาก walletLedgerTransactions (โหลดในข้อ 2a) โดยตรง

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

        // โหลด Worker Grade (เฉพาะ provider)
        const currentUserId = user?.id || data?.id;
        if (currentUserId) {
          gradeService.getWorkerGrade(currentUserId).then((g) => {
            if (g) setWorkerGrade(g);
          });
          gradeService.getWorkerReviews(currentUserId, 5, 0).then((r) => {
            if (r?.stats) setReviewStats(r.stats);
          });
        }
      } catch (e) {
        console.error("❌ Failed to fetch profile data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /** Re-fetch wallet history (transactions + payouts) — call after deposit/withdraw or when wallet tab focused */
  const refreshWalletHistory = useCallback(async () => {
    try {
      const { data } = await api.get<{ transactions?: Array<{ id: string; amount: number; direction: string; description: string; status?: string; commission_deducted?: number; insurance_amount?: number; tips_amount?: number; created_at: string; event_type?: string; job_id?: string; gross_earnings?: number; handling_fee?: number; commission_fee?: number; commission_percent?: number }> }>("/wallet/transactions");
      const txs = data.transactions || [];
      setWalletLedgerTransactions(txs);
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H11",location:"mobile/pages/Profile.tsx:refreshWalletTransactions",message:"wallet transactions refreshed",data:{total:txs.length,pending_count:txs.filter((x)=>String(x?.status||"").toLowerCase()==="pending").length,deposit_count:txs.filter((x)=>String(x?.event_type||"")==="wallet_deposit").length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch {
      setWalletLedgerTransactions([]);
    }
    try {
      const { data: payoutsData } = await api.get<{ requests?: Array<{ id: string; amount: number; bank_details: Record<string, unknown>; status: string; admin_notes?: string; transaction_id?: string; created_at: string; processed_at?: string }> }>("/payouts/me");
      setPayoutRequests(payoutsData?.requests || []);
    } catch {
      setPayoutRequests([]);
    }
  }, []);

  /** Refetch wallet when switching to wallet tab or tab becomes visible */
  useEffect(() => {
    if (activeTab !== "wallet") return;
    refreshWalletHistory();
    const onVisible = () => refreshWalletHistory();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [activeTab, refreshWalletHistory]);

  // โหลด Refund Policy จาก Legal Documents (Admin)
  useEffect(() => {
    api.get<{ policy?: { content: string; version: string; published_at: string } }>('/compliance/refund')
      .then(res => {
        const p = res.data?.policy;
        if (p?.content) {
          setRefundPolicyContent(p.content);
          setRefundPolicyVersion(p.version || '');
          if (p.published_at) {
            const d = new Date(p.published_at);
            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = d.getFullYear() + 543; // พ.ศ.
            setRefundPolicyUpdated(`${day}/${month}/${year}`);
          }
        }
      })
      .catch(err => console.error('Failed to load refund policy:', err));
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

    if (!idCardFrontFile || !selfiePhotoFile) {
      notify(
        "ไม่พบไฟล์รูป — โปรดเลือกอัปโหลดรูปบัตรหน้าและเซลฟี่อีกครั้งแล้วกดส่ง",
        "error",
      );
      return;
    }

    console.log("All checks passed, submitting KYC...");
    setSubmittingKYC(true);
    try {
      const result = await MockApi.submitEnhancedKYC({
        fullName: fullName.trim(),
        birthDate,
        idCardNumber: idCardNumber.trim(),
        idCardFront: idCardFrontFile,
        selfiePhoto: selfiePhotoFile,
        idCardBack: idCardBackFile ?? undefined,
        drivingLicenseFront: drivingLicenseFrontFile ?? undefined,
        drivingLicenseBack: drivingLicenseBackFile ?? undefined,
      });

      notify(result.message || "ส่งข้อมูลยืนยันตัวตนสำเร็จ", "success");

      if (idCardPreview) URL.revokeObjectURL(idCardPreview);
      if (idCardBackPreview) URL.revokeObjectURL(idCardBackPreview);
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
      if (drivingLicenseFrontPreview)
        URL.revokeObjectURL(drivingLicenseFrontPreview);
      if (drivingLicenseBackPreview)
        URL.revokeObjectURL(drivingLicenseBackPreview);

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
      setIdCardFrontFile(null);
      setIdCardBackFile(null);
      setSelfiePhotoFile(null);
      setDrivingLicenseFrontFile(null);
      setDrivingLicenseBackFile(null);
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

  const uploadWalletDepositSlipToServer = async (file: File, chargeId: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("charge_id", chargeId);
    const { data } = await api.post<{ success?: boolean; error?: string; url?: string }>(
      "/wallet/deposit-slip",
      fd
    );
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const isGatewayAutoSourceType = (sourceType: string | null | undefined) => {
    const st = String(sourceType || "").toLowerCase();
    if (!st) return false;
    return ["payso", "ksher", "card", "truemoney", "mobile_banking"].includes(st);
  };

  const clearPaysoAutoCloseCountdown = () => {
    if (paysoAutoCloseTimerRef.current) {
      clearInterval(paysoAutoCloseTimerRef.current);
      paysoAutoCloseTimerRef.current = null;
    }
    setPaysoAutoCloseCountdown(null);
  };

  const startPaysoAutoCloseCountdown = (successMessage = "เติมเงินสำเร็จ") => {
    if (paysoAutoCloseTimerRef.current || paysoAutoCloseCountdown !== null) return;
    setPaysoAutoCloseCountdown(5);
    paysoAutoCloseTimerRef.current = setInterval(() => {
      setPaysoAutoCloseCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (paysoAutoCloseTimerRef.current) {
            clearInterval(paysoAutoCloseTimerRef.current);
            paysoAutoCloseTimerRef.current = null;
          }
          void finishDepositSuccessUi(successMessage);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (paysoAutoCloseTimerRef.current) {
        clearInterval(paysoAutoCloseTimerRef.current);
        paysoAutoCloseTimerRef.current = null;
      }
    };
  }, []);

  const finishDepositSuccessUi = async (successMessage = "เติมเงินสำเร็จ") => {
    clearPaysoAutoCloseCountdown();
    paysoSuccessHandledRef.current = false;
    const updatedUser = await MockApi.getProfile();
    if (updatedUser) {
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
    }
    refreshWalletHistory();
    notify(successMessage, "success");
    setActiveModal(null);
    setAmount("");
    setDepositStep("amount");
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositMethod(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setManualStaticSlipFile(null);
    setDepositOtherChannelsOpen(false);
    setManualStaticQrExpanded(true);
    setCardFormData({ number: "", name: "", expiry: "", cvc: "" });
    setTruemoneyPhone("");
    setMobileBankingBankCode("scb");
    setProcessing(false);
    setWalletDepositM1Step(null);
    setWalletM1Method(null);
    setManualDepositSubmitResult(null);
    setWalletDepositPreview(null);
    setWalletDepositPreviewError(null);
  };

  const handleDeposit = async () => {
    if (!amount || isNaN(Number(amount))) return;
    setProcessing(true);
    try {
      const updatedUser = await MockApi.walletTopUp(Number(amount));
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      refreshWalletHistory();
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
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H4",location:"mobile/pages/Profile.tsx:handleDepositWithPromptPay:start",message:"payso create requested",data:{amount:amt,payment_method:"promptpay"},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setProcessing(true);
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    clearPaysoAutoCloseCountdown();
    paysoSuccessHandledRef.current = false;
    try {
      const returnUri = typeof window !== "undefined" ? `${window.location.origin}/profile` : "";
      const { data } = await api.post<WalletDepositCreateResponse>("/wallet/deposit/payso", {
        amount: amt,
        payment_method: "promptpay",
        return_uri: returnUri,
      });
      if (data?.error) {
        notify(data.error, "error");
        setProcessing(false);
        return;
      }
      const chargeId = data?.charge_id;
      const qrOrUri = data?.qr_code_url || data?.authorization_uri;
      if (!chargeId) {
        notify("ไม่ได้รับ charge_id จากระบบ", "error");
        setProcessing(false);
        return;
      }
      setDepositPaymentId(chargeId);
      const ctype = "payso";
      walletDepositChargeSourceRef.current = ctype;
      setDepositChargeSourceType(ctype);
      setDepositQrUrl(qrOrUri || null);
      setWalletDepositM1Step("payso_qr");
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H4",location:"mobile/pages/Profile.tsx:handleDepositWithPromptPay:created",message:"payso create succeeded and qr state set",data:{chargeId,hasQrCodeUrl:!!data?.qr_code_url,hasAuthorizationUri:!!data?.authorization_uri,qrStateValue:qrOrUri ? "present" : "missing"},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const pollMax = 120;
      let pollCount = 0;
      const pollStatus = async () => {
        if (pollCount >= pollMax) {
          notify("หมดเวลา รอการชำระ กรุณาตรวจสอบภายหลังหรือลองสร้าง QR ใหม่", "error");
          setWalletDepositM1Step("enter_amount");
          setDepositQrUrl(null);
          setDepositPaymentId(null);
          walletDepositChargeSourceRef.current = null;
          setDepositChargeSourceType(null);
          setProcessing(false);
          return;
        }
        pollCount += 1;
        try {
          const st = await api.get<{ status: string }>(`/wallet/deposit/status/${chargeId}`);
          const payStatus = st.data?.status;
          if (pollCount === 1 || payStatus === "success" || payStatus === "failed" || payStatus === "expired") {
            // #region agent log
            fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H5",location:"mobile/pages/Profile.tsx:handleDepositWithPromptPay:poll",message:"payso status poll observed",data:{chargeId,pollCount,payStatus},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
          }
          if (payStatus === "success") {
            if (paysoSuccessHandledRef.current) return;
            paysoSuccessHandledRef.current = true;
            // #region agent log
            fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H6",location:"mobile/pages/Profile.tsx:handleDepositWithPromptPay:success-gate",message:"evaluating slip gate on successful poll",data:{chargeId,depositSlipUploaded:depositSlipUploadedRef.current,sourceTypeRef:walletDepositChargeSourceRef.current,sourceTypeState:depositChargeSourceType},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (
              !depositSlipUploadedRef.current &&
              !isGatewayAutoSourceType(walletDepositChargeSourceRef.current)
            ) {
              depositPendingSuccessMessageRef.current = "เติมเงินสำเร็จ";
              setDepositSuccessPendingSlip(true);
              setProcessing(false);
              return;
            }
            startPaysoAutoCloseCountdown("เติมเงินสำเร็จ");
            return;
          }
          if (payStatus === "failed" || payStatus === "expired") {
            notify(
              payStatus === "expired"
                ? "QR หมดอายุแล้ว — ลองสร้าง QR ใหม่ได้จากขั้นตอนก่อนหน้า"
                : "การชำระไม่สำเร็จ — ลองสร้าง QR ใหม่หรือติดต่อทีมงานหากมีปัญหา",
              "error",
            );
            setWalletDepositM1Step("enter_amount");
            setDepositQrUrl(null);
            setDepositPaymentId(null);
            clearPaysoAutoCloseCountdown();
            paysoSuccessHandledRef.current = false;
            walletDepositChargeSourceRef.current = null;
            setDepositChargeSourceType(null);
            setProcessing(false);
            return;
          }
        } catch (_) {}
        setTimeout(pollStatus, 3000);
      };
      setTimeout(pollStatus, 3000);
    } catch (e: any) {
      notify(e?.response?.data?.error || e?.message || "Deposit failed", "error");
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H4",location:"mobile/pages/Profile.tsx:handleDepositWithPromptPay:error",message:"payso create failed",data:{error:e?.response?.data?.error || e?.message || "Deposit failed"},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setWalletDepositM1Step("enter_amount");
      setDepositQrUrl(null);
      setDepositPaymentId(null);
      clearPaysoAutoCloseCountdown();
      paysoSuccessHandledRef.current = false;
      walletDepositChargeSourceRef.current = null;
      setDepositChargeSourceType(null);
      setProcessing(false);
    }
  };

  const handleDepositWithCard = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    const { number, name, expiry, cvc } = cardFormData;
    if (!number.trim() || !name.trim() || !expiry.trim() || !cvc.trim()) {
      notify("กรุณากรอกข้อมูลบัตรให้ครบถ้วน", "error");
      return;
    }
    const parsed = parseExpiry(expiry);
    if (!parsed) {
      notify("วันหมดอายุไม่ถูกต้อง (ใช้ MM/YY)", "error");
      return;
    }
    const amt = Number(amount);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setProcessing(true);
    try {
      // 1. สร้าง Card Token ฝั่งเบราว์เซอร์ (ไม่ส่งเลขบัตรไปยัง Backend)
      const tokenData = await createCardToken({
        number,
        name,
        expiryMonth: parsed.month,
        expiryYear: parsed.year,
        cvc,
      });
      if (!tokenData?.id) {
        notify("ไม่สามารถสร้าง Card Token ได้", "error");
        setProcessing(false);
        return;
      }
      const cardToken = tokenData.id;

      // 2. ส่ง Token ไปยัง Backend เพื่อสร้าง Charge
      const { data } = await api.post<{ charge_id: string; status: string; error?: string }>("/wallet/deposit", {
        amount: amt,
        payment_method: "card",
        card: cardToken,
      });
      if (data?.error) {
        notify(data.error, "error");
        setProcessing(false);
        return;
      }
      const chargeId = data?.charge_id;
      if (!chargeId) {
        notify("ไม่ได้รับ charge_id จากระบบ", "error");
        setProcessing(false);
        return;
      }

      // 3. Poll สถานะเหมือน PromptPay
      setDepositPaymentId(chargeId);
      {
        const d = data as WalletDepositCreateResponse;
        const ct = String(d?.source_type || "card").toLowerCase();
        walletDepositChargeSourceRef.current = ct;
        setDepositChargeSourceType(ct);
      }
      notify("กำลังตรวจสอบการชำระเงิน...", "info");
      const pollMax = 40; // บัตรเครดิตยืนยันเร็วกว่า PromptPay
      let pollCount = 0;
      const pollStatus = async () => {
        if (pollCount >= pollMax) {
          notify("หมดเวลา รอการชำระ กรุณาตรวจสอบภายหลัง", "error");
          setProcessing(false);
          return;
        }
        pollCount += 1;
        try {
          const st = await api.get<{ status: string }>(`/wallet/deposit/status/${chargeId}`);
          if (st.data?.status === "success") {
            if (
              !depositSlipUploadedRef.current &&
              !isGatewayAutoSourceType(walletDepositChargeSourceRef.current)
            ) {
              depositPendingSuccessMessageRef.current = "เติมเงินด้วยบัตรสำเร็จ";
              setDepositSuccessPendingSlip(true);
              setProcessing(false);
              return;
            }
            await finishDepositSuccessUi("เติมเงินด้วยบัตรสำเร็จ");
            return;
          }
          if (st.data?.status === "failed" || st.data?.status === "expired") {
            notify("การชำระเงินล้มเหลว กรุณาลองอีกครั้ง", "error");
            setProcessing(false);
            return;
          }
        } catch (_) {}
        setTimeout(pollStatus, 2000);
      };
      setTimeout(pollStatus, 2000);
    } catch (e: any) {
      notify(e?.message || "การเติมเงินด้วยบัตรล้มเหลว", "error");
      setProcessing(false);
    }
  };

  const handleDepositTrueMoney = async () => {
    if (!user || !amount || isNaN(Number(amount)) || truemoneyPhone.length !== 10) return;
    const amt = Number(amount);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setProcessing(true);
    try {
      const returnUri = typeof window !== "undefined" ? `${window.location.origin}/profile` : "";
      const { data } = await api.post<WalletDepositCreateResponse>("/wallet/deposit", {
        amount: amt,
        payment_method: "truemoney",
        phone_number: truemoneyPhone,
        return_uri: returnUri,
      });
      if (data?.error) {
        notify(data.error, "error");
        setProcessing(false);
        return;
      }
      const chargeId = data?.charge_id;
      const authUri = data?.authorization_uri;
      if (!chargeId) {
        notify("ไม่ได้รับ charge_id จากระบบ", "error");
        setProcessing(false);
        return;
      }
      setDepositPaymentId(chargeId);
      {
        const ct = String(data?.source_type || "truemoney").toLowerCase();
        walletDepositChargeSourceRef.current = ct;
        setDepositChargeSourceType(ct);
      }
      notify("🔔 กรุณาตรวจสอบและยืนยันการชำระในแอป TrueMoney", "success");

      // Open TrueMoney app authorization
      if (authUri) {
        window.open(authUri, '_blank');
      }
      
      // Poll for payment status
      const pollMax = 120;
      let pollCount = 0;
      const pollStatus = async () => {
        if (pollCount >= pollMax) {
          notify("หมดเวลา รอการชำระ กรุณาตรวจสอบภายหลัง", "error");
          setProcessing(false);
          setActiveModal(null);
          setAmount("");
          setDepositMethod(null);
          setTruemoneyPhone("");
          return;
        }
        pollCount += 1;
        try {
          const st = await api.get<{ status: string }>(`/wallet/deposit/status/${chargeId}`);
          if (st.data?.status === "success") {
            if (
              !depositSlipUploadedRef.current &&
              !isGatewayAutoSourceType(walletDepositChargeSourceRef.current)
            ) {
              depositPendingSuccessMessageRef.current = "เติมเงินสำเร็จ! ✓";
              setDepositSuccessPendingSlip(true);
              setProcessing(false);
              return;
            }
            await finishDepositSuccessUi("เติมเงินสำเร็จ! ✓");
            return;
          }
        } catch (_) {}
        setTimeout(pollStatus, 3000);
      };
      setTimeout(pollStatus, 3000);
    } catch (e: any) {
      notify(e?.response?.data?.error || e?.message || "TrueMoney deposit failed", "error");
      setProcessing(false);
    }
  };

  const handleDepositMobileBanking = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    const amt = Number(amount);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setProcessing(true);
    try {
      const returnUri = typeof window !== "undefined" ? `${window.location.origin}/profile` : "";
      const { data } = await api.post<WalletDepositCreateResponse>("/wallet/deposit", {
        amount: amt,
        payment_method: "mobile_banking",
        bank_code: mobileBankingBankCode,
        return_uri: returnUri,
      });
      if (data?.error) {
        notify(data.error, "error");
        setProcessing(false);
        return;
      }
      const chargeId = data?.charge_id;
      const authUri = data?.authorization_uri;
      if (!chargeId) {
        notify("ไม่ได้รับ charge_id จากระบบ", "error");
        setProcessing(false);
        return;
      }
      setDepositPaymentId(chargeId);
      {
        const ct = String(data?.source_type || "mobile_banking").toLowerCase();
        walletDepositChargeSourceRef.current = ct;
        setDepositChargeSourceType(ct);
      }
      notify("🔔 กรุณายืนยันการชำระเงินในแอปธนาคารของคุณ", "success");
      if (authUri) {
        window.open(authUri, "_blank");
      }

      const pollMax = 120;
      let pollCount = 0;
      const pollStatus = async () => {
        if (pollCount >= pollMax) {
          notify("หมดเวลา รอการชำระ กรุณาตรวจสอบภายหลัง", "error");
          setProcessing(false);
          return;
        }
        pollCount += 1;
        try {
          const st = await api.get<{ status: string }>(`/wallet/deposit/status/${chargeId}`);
          if (st.data?.status === "success") {
            if (
              !depositSlipUploadedRef.current &&
              !isGatewayAutoSourceType(walletDepositChargeSourceRef.current)
            ) {
              depositPendingSuccessMessageRef.current = "เติมเงินผ่าน Mobile Banking สำเร็จ";
              setDepositSuccessPendingSlip(true);
              setProcessing(false);
              return;
            }
            await finishDepositSuccessUi("เติมเงินผ่าน Mobile Banking สำเร็จ");
            return;
          }
          if (st.data?.status === "failed" || st.data?.status === "expired") {
            notify("การชำระเงินล้มเหลว กรุณาลองอีกครั้ง", "error");
            setProcessing(false);
            return;
          }
        } catch (_) {}
        setTimeout(pollStatus, 3000);
      };
      setTimeout(pollStatus, 3000);
    } catch (e: any) {
      notify(e?.response?.data?.error || e?.message || "Mobile banking deposit failed", "error");
      setProcessing(false);
    }
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
    if (!slipFile) {
      notify("กรุณาแนบสลิปการโอนเป็นหลักฐาน", "error");
      return;
    }
    const amt = Number(amount);
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("file", slipFile);
      const { data: up } = await api.post<{ url?: string; success?: boolean }>("/upload/form", fd);
      const slipUrl = up?.url || (up as { secure_url?: string }).secure_url;
      if (!slipUrl) throw new Error("อัปโหลดสลิปไม่สำเร็จ");
      const updatedUser = await MockApi.walletTopUp(amt, {
        gateway: "bank_transfer",
        payment_id: bankTransferRef.refId,
        job_id: bankTransferRef.refId,
        bill_no: bankTransferRef.bill_no,
        transaction_no: bankTransferRef.transaction_no,
        slip_url: slipUrl,
      });
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      refreshWalletHistory();
      notify(
        "ยืนยันการโอนแล้ว — ยอดจะเข้าภายใน 24 ชม. (หรือเมื่อตรวจสอบแล้ว)",
        "success",
      );
      setActiveModal(null);
      setAmount("");
      setBankTransferRef(null);
      setDepositStep("amount");
      setDepositMethod(null);
      setSlipFile(null);
    } catch (e: any) {
      notify(
        e?.response?.data?.error || e?.message || "Failed",
        "error",
      );
    }
    setProcessing(false);
  };

  /** เติมเงินแบบ QR พร้อมเพย์นิ่ง (KTB) + สลิป — คิวรอแอดมิน (ไม่เครดิตทันที / ไม่สร้าง ledger ฝั่ง client) */
  const handleSubmitManualStaticSlip = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    if (!manualStaticSlipFile) {
      notify("กรุณาเลือกไฟล์สลิป", "error");
      return;
    }
    const amt = Number(amount);
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H3",location:"mobile/pages/Profile.tsx:handleSubmitManualStaticSlip:start",message:"manual deposit submit requested",data:{amount:amt,filePresent:!!manualStaticSlipFile,fileName:manualStaticSlipFile?.name || null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("amount", String(amt));
      fd.append("file", manualStaticSlipFile);
      const { data } = await api.post<WalletDepositManualCreateResponse>(
        "/wallet/deposit/manual",
        fd,
      );
      setManualDepositSubmitResult({
        id: data?.id,
        status: data?.status ?? "manual_pending_verification",
        amount: data?.amount,
      });
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H3",location:"mobile/pages/Profile.tsx:handleSubmitManualStaticSlip:success",message:"manual deposit submit succeeded",data:{status:data?.status || null,id:data?.id || null,amount:data?.amount || null,nextStep:"manual_done"},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setWalletDepositM1Step("manual_done");
      setManualStaticSlipFile(null);
      notify("ส่งสลิปแล้ว — รอทีมตรวจสอบ", "success");
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "ล้มเหลว";
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H3",location:"mobile/pages/Profile.tsx:handleSubmitManualStaticSlip:error",message:"manual deposit submit failed",data:{error:msg},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      notify(msg, "error");
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
    const isProvider = user?.role === UserRole.PROVIDER;
    const feeProvider = withdrawSpeed === "instant" ? 50 : 35;
    const maxNet = isProvider
      ? Math.max(0, (profile?.wallet_balance ?? 0) - feeProvider)
      : getMaxNetWithdrawable(profile?.wallet_balance ?? 0, withdrawChannel);
    if (amt > maxNet) {
      notify(
        `จำนวนที่รับได้สูงสุดคือ ${maxNet.toLocaleString()} บาท`,
        "error",
      );
      return;
    }
    const account = selectedWithdrawAccount ?? bankAccounts[0];
    if (isProvider && !account) {
      notify(
        "กรุณาเพิ่มบัญชีรับเงินใน Settings → Payment Methods ก่อนถอนเงิน",
        "error",
      );
      return;
    }
    if (withdrawChannel === "bank_transfer" && !isProvider && !account) {
      notify(
        "กรุณาเพิ่มบัญชีรับเงินใน Settings → Payment Methods ก่อนถอนเงิน",
        "error",
      );
      return;
    }
    setProcessing(true);
    try {
      const bank_details: Record<string, unknown> =
        (isProvider || withdrawChannel === "bank_transfer") && account
          ? {
              provider_name: account.provider_name,
              account_number: account.account_number,
              account_name: account.account_name,
              channel: "bank_transfer",
            }
          : withdrawChannel === "promptpay"
            ? { channel: "promptpay" }
            : { channel: "truemoney" };
      const { data } = await api.post<{ request?: { id: string; amount: number; status: string; created_at: string }; error?: string }>(
        "/payouts/request",
        isProvider ? { amount: amt, bank_details, instant_payout: withdrawSpeed === "instant" } : { amount: amt, bank_details }
      );
      if (data?.error) {
        notify(data.error, "error");
        return;
      }
      const updatedUser = await MockApi.getProfile();
      if (updatedUser) {
        setProfile(updatedUser);
        if (token) login(updatedUser, token);
      }
      refreshWalletHistory();
      if (user?.role === UserRole.PROVIDER) {
        try {
          const { data: eligData } = await api.get<{ eligible: boolean; completed_jobs: number; balance: number; min_jobs: number; min_balance_thb: number; reason: string | null; pending: number; fee_standard_thb: number; fee_instant_thb: number }>("/payouts/eligibility").catch(() => ({ data: null }));
          if (eligData) setPayoutEligibility(eligData);
        } catch (_) {}
      }
      notify("ส่งคำขอถอนแล้ว รอแอดมินอนุมัติ", "success");
      setActiveModal(null);
      setAmount("");
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "เกิดข้อผิดพลาด";
      notify(msg, "error");
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
    return <div className="p-8 text-center text-slate-400">{t("common.loading")}</div>;

  const activeCourse = courses.find((c) => c.id === activeCourseId);
  const isPlatinum = (profile?.vip_tier ?? user?.vip_tier ?? "").toLowerCase() === "platinum";

  return (
    <div className="profile-page max-w-5xl mx-auto space-y-8 pb-20">
      {profile.brand_adviser_suspend_warning && (
        <BrandAdviserSuspendBanner
          show
          daysLeft={profile.days_until_suspend_estimate ?? undefined}
          className="mb-2"
        />
      )}
      {profile.is_brand_adviser && profile.brand_adviser_program_enabled === false && (
        <BrandAdviserProgramOffNotice className="mb-2" />
      )}
      {profile.is_brand_adviser && <BrandAdviserReputationHint className="mb-4 max-w-2xl mx-auto md:mx-0 text-center md:text-left" />}
      {/* Profile Header - Dark Premium / Platinum */}
      <div
        className={
          isPlatinum
            ? "platinum-card-premium rounded-[20px] p-6 sm:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden platinum-glow"
            : "luxury-card rounded-[20px] p-6 sm:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden"
        }
      >
        <div className="relative group">
          <div
            className={
              isPlatinum
                ? "w-24 h-24 rounded-[20px] overflow-hidden border-2 border-gold/30 shadow-gold-badge"
                : "w-24 h-24 rounded-[20px] overflow-hidden border-2 border-gold/10"
            }
          >
            <img
              src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || "U")}&background=6366f1&color=fff`}
              alt={profile.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || "U")}&background=6366f1&color=fff`;
              }}
            />
            {isAvatarAnalyzing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-xs">
                <Scan className="animate-pulse mb-1" size={20} /> Analyzing...
              </div>
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 bg-charcoal-800 p-1.5 rounded-xl shadow border border-gold-subtle text-slate-400 hover:text-white hover:bg-charcoal-700"
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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center justify-center md:justify-start gap-2 flex-wrap font-sans">
            {profile.name}
            <UserDisplayBadge vipTier={profile?.vip_tier ?? user?.vip_tier} isCoach={false} size="md" showLabel />
            <BrandAdviserBadge
              isBrandAdviser={profile.is_brand_adviser}
              adviserStatus={profile.adviser_status}
              tone="dark"
            />
            {profile.kyc_level === "level_2" && (
              <ShieldCheck className="text-emerald-400" size={20} />
            )}
          </h1>
          <p className="text-slate-400 text-sm mb-3">
            {profile.email || profile.phone}
          </p>
          <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide ${
                (profile.role === UserRole.PROVIDER || profile.role === "provider")
                  ? "bg-purple-500/20 text-purple-300"
                  : "bg-slate-600/50 text-slate-300"
              }`}
            >
              {profile.role}
            </span>
            {profile.is_boosted && (
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-amber-500/20 text-amber-300 flex items-center">
                <Rocket size={12} className="mr-1" /> Boosted
              </span>
            )}
            {(profile?.vip_expiry ?? user?.vip_expiry) && (profile?.vip_tier ?? user?.vip_tier) && (profile?.vip_tier ?? user?.vip_tier) !== "none" && (
              <span className="text-xs text-slate-500">
                VIP หมดอายุ: {formatDateThaiShort(profile?.vip_expiry ?? user?.vip_expiry)}
              </span>
            )}
            {typeof (profile?.vip_quota_balance ?? user?.vip_quota_balance) === "number" && (profile?.vip_tier ?? user?.vip_tier) && (profile?.vip_tier ?? user?.vip_tier) !== "none" && (
              <span className="text-xs text-slate-500">
                สิทธิ์ส่วนลดคงเหลือ: {(profile?.vip_quota_balance ?? user?.vip_quota_balance) === 999 ? "ไม่จำกัด" : (profile?.vip_quota_balance ?? user?.vip_quota_balance)} ครั้ง
              </span>
            )}
            <Link to="/vip" className="text-xs text-emerald-500 hover:text-emerald-400 font-medium">
              ดู/อัปเกรด VIP
            </Link>
            {/* Worker Grade Badge */}
            {workerGrade && (
              <WorkerGradeBadge
                userId={user?.id || profile?.id || ''}
                variant="compact"
              />
            )}
            {/* Mutual Assurance Badge: Top Guardian / Verified Secure Payer */}
            {(profile?.assurance_badge ?? user?.assurance_badge) === 'top_guardian' && (
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1" title="Top Guardian — จ่ายประกันสะสมสูง">
                <Shield size={12} /> Top Guardian
              </span>
            )}
            {(profile?.assurance_badge ?? user?.assurance_badge) === 'verified_secure_payer' && (
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-blue-500/20 text-blue-300 border border-blue-400/40 flex items-center gap-1" title="Verified Secure Payer — มีประกันสะสม">
                <Shield size={12} /> Verified Secure Payer
              </span>
            )}
          </div>
        </div>
        <div className="luxury-card p-5 rounded-[20px] min-w-[200px] text-center md:text-right">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 font-wallet-title">
            {t("profile.wallet_title")}
          </p>
          <p className="text-2xl font-bold number-wallet number-wallet-gold">
            {profile.wallet_balance?.toLocaleString()} ฿
            {(profile?.wallet_frozen ?? user?.wallet_frozen) && (
              <span className="ml-2 text-sm font-normal text-amber-500">(ระงับ)</span>
            )}
          </p>
          {(profile?.insurance_credit_balance ?? user?.insurance_credit_balance ?? 0) > 0 && (
            <p className="text-sm font-semibold text-amber-600 mt-2 flex items-center justify-end gap-1">
              <Shield size={14} />
              ยอดคุ้มครองสะสม: {(profile?.insurance_credit_balance ?? user?.insurance_credit_balance ?? 0).toLocaleString()} ฿
            </p>
          )}
        </div>
      </div>

      {/* Tabs - Dark */}
      <div className="flex border-b border-gold/10 bg-charcoal-800/80 rounded-t-[20px] px-4 overflow-x-auto no-scrollbar">
        {["info", "training", "reviews", "wallet", "calendar"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === "training") {
                navigate("/training/dashboard");
              } else {
                setActiveTab(tab as any);
              }
            }}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap capitalize rounded-t-xl ${
              activeTab === tab
                ? "border-slate-400 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "training" ? t('profile.tab_training') : tab === "calendar" ? t('profile.tab_calendar') : t(`profile.tab_${tab}`)}
          </button>
        ))}
        {(profile.role === UserRole.PROVIDER || profile.role === "provider") && (
          <>
            <button
              onClick={() => setActiveTab("earnings")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "earnings"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {t("profile.tab_earnings")}
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "portfolio"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Portfolio / Expert
            </button>
            <button
              onClick={() => setActiveTab("story")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === "story"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <PlayCircle size={16} /> Story
            </button>
            <button
              onClick={() => setActiveTab("connection")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === "connection"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Network size={16} /> Connection
            </button>
          </>
        )}
      </div>

      {/* --- CONTENT --- */}

      {activeTab === "info" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-8">
          {/* Identity Verification */}
          <div
            className={`border rounded-[20px] p-6 bg-charcoal-800/50 ${
              profile.kyc_level === "level_2"
                ? "border-emerald-400/60 bg-emerald-50/30 kyc-card-verified"
                : "border-gold/10"
            }`}
          >
            {kycNeedsReverify && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-2">
                <p className="text-amber-200 font-medium">
                  ต้องยืนยันตัวตนใหม่ (Re-Verify) — ครบกำหนดหรือมีการเปลี่ยนข้อมูลสำคัญ
                </p>
                <button
                  onClick={async () => {
                    setKycReverifyLoading(true);
                    try {
                      const result = await MockApi.reVerifyKYC();
                      if (result.success) {
                        notify("บันทึกการยืนยันตัวตนใหม่แล้ว", "success");
                        setKycNeedsReverify(false);
                        const data = await MockApi.getProfile();
                        setProfile(data);
                      } else {
                        notify(result.message || "ไม่สามารถ Re-Verify ได้", "error");
                      }
                    } finally {
                      setKycReverifyLoading(false);
                    }
                  }}
                  disabled={kycReverifyLoading}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50"
                >
                  {kycReverifyLoading ? "กำลังบันทึก..." : "ยืนยันตัวตนใหม่ (Re-Verify)"}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-600/50 rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="text-slate-200" size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    Identity Verification (KYC)
                    {profile.kyc_level === "level_2" && (
                      <span className="kyc-verified-badge inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                        <ShieldCheck size={16} className="flex-shrink-0" />
                        Verified
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {profile.kyc_level === "level_2"
                      ? "บัญชีของคุณได้รับการยืนยันตัวตนแล้ว"
                      : "ยืนยันตัวตนเพื่อเพิ่มความน่าเชื่อถือและปลดล็อกฟีเจอร์พิเศษ"}
                  </p>
                </div>
              </div>

              {profile.kyc_level !== "level_2" && (
                <button
                  onClick={() => navigate("/kyc")}
                  className="px-6 py-3 bg-slate-600 text-white rounded-2xl hover:bg-slate-500 transition-all flex items-center gap-2 font-semibold"
                >
                  <ShieldCheck size={20} />
                  ยืนยันตัวตน
                </button>
              )}
            </div>

            {profile.kyc_level !== "level_2" && (
              <div className="mt-4 pt-4 border-t border-gold-subtle">
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

          {/* Provider: สวิตซ์รับงาน + ที่อยู่ (สำหรับ Provider) */}
          {(user?.role === "provider" || profile?.role === UserRole.PROVIDER || profile?.role === "provider") && (
            <ProviderAvailabilityBlock
              profile={profile}
              onUpdate={() => MockApi.getProfile().then(setProfile)}
              notify={notify}
            />
          )}

          {/* 🎯 RESUME/CV Section - LinkedIn Style */}

          {/* About/Summary */}
          <div className="border border-gold-transparent rounded-[20px] p-6 bg-charcoal-800/50">
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
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
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

            {certifiedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {certifiedSkills.map((cs) => (
                  <div
                    key={cs.skill_name}
                    className="group relative px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-full hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{cs.skill_name}</span>
                      <CheckCircle size={16} className="text-emerald-600" />
                    </div>
                    <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                      Certified
                    </span>
                  </div>
                ))}
                {/* แสดง skill อื่นที่ไม่มี cert */}
                {(profile.skills || [])
                  .filter((s) => !certifiedSkills.some((cs) => cs.skill_name === s))
                  .map((skill, idx) => (
                    <div
                      key={`other-${idx}`}
                      className="px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-full hover:shadow-md transition-all"
                    >
                      <span className="font-medium text-gray-800">{skill}</span>
                    </div>
                  ))}
              </div>
            ) : profile.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {profile.skills.map((skill, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-full hover:shadow-md transition-all"
                  >
                    <span className="font-medium text-gray-800">{skill}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                  <Star className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 font-medium mb-2">ยังไม่มีทักษะ</p>
                <p className="text-sm text-gray-400 mb-4">
                  {t('training.module2_cert_desc')}
                </p>
                <button
                  onClick={() => navigate("/training/nexus-module2")}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
                >
                  {t('training.go_module2')}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {certifiedSkills.length}
                </p>
                <p className="text-xs text-gray-500">ทักษะที่ผ่านการรับรอง</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {(profile.skills?.length || 0) + certifiedSkills.filter((cs) => !(profile.skills || []).includes(cs.skill_name)).length}
                </p>
                <p className="text-xs text-gray-500">ทักษะทั้งหมด</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {profile.rating || 0}/5
                </p>
                <p className="text-xs text-gray-500">คะแนนรีวิว</p>
              </div>
            </div>
          </div>

          {/* Experience Section */}
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
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
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
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
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Award className="mr-2 text-amber-600" size={24} />
                Licenses & Certifications
              </div>
              {certifiedSkills.length > 0 && (
                <span className="text-sm text-amber-700 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  {certifiedSkills.length} ใบ
                </span>
              )}
            </h2>

            {certifiedSkills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {certifiedSkills.map((cs) => (
                  <div
                    key={cs.skill_name}
                    className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 shadow-sm hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate("/training/certificate-readiness")}
                    title="กดเพื่อดูใบ Certificate"
                  >
                    {/* Certificate header strip */}
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 flex items-center justify-between">
                      <span className="text-white text-xs font-bold uppercase tracking-wider">
                        Nexus Platform
                      </span>
                      <Award className="text-white" size={16} />
                    </div>

                    {/* Certificate body */}
                    <div className="px-4 py-4">
                      <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">
                        Certificate of Skill
                      </p>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {cs.skill_name}
                      </h3>
                      <p className="text-xs text-gray-500 mb-3">
                        {t('training.professional_module2')}
                      </p>

                      {/* Cert ID */}
                      <p className="text-xs text-gray-400 font-mono truncate mb-3">
                        {cs.certification_id}
                      </p>

                      {/* Issued date + verified badge */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {cs.certified_at
                            ? new Date(cs.certified_at).toLocaleDateString("th-TH", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })
                            : ""}
                        </span>
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 rounded-full">
                          <CheckCircle size={12} className="text-emerald-600" />
                          <span className="text-xs text-emerald-700 font-medium">Verified</span>
                        </div>
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
                  {t('training.module2_cert_tip')}
                </p>
                <button
                  onClick={() => navigate("/training/nexus-module2")}
                  className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                >
                  {t('training.go_module2')}
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

      {/* CALENDAR — ปฏิทินรวมงาน จอง เวลาว่าง */}
      {activeTab === "calendar" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-4 sm:p-6 animate-in fade-in">
          <ProfileCalendarEmbed userId={user?.id} navigate={navigate} />
        </div>
      )}

      {/* WALLET */}
      {activeTab === "wallet" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in">
          {/* Platform Safety Authority: แสดงเมื่อวอลเล็ตถูกระงับ */}
          {(profile?.wallet_frozen ?? user?.wallet_frozen) && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <Lock className="flex-shrink-0 w-6 h-6 text-amber-600" />
              <div>
                <p className="font-bold text-amber-800">วอลเล็ตถูกระงับ</p>
                <p className="text-sm text-amber-700 mt-1">
                  บัญชีกระเป๋าของคุณถูกระงับชั่วคราว — ไม่สามารถเติมเงิน ถอนเงิน หรือใช้จ่ายได้ กรุณาติดต่อฝ่ายสนับสนุน
                </p>
              </div>
            </div>
          )}

          {/* ✅ เพิ่มส่วนแสดงยอดเงิน (เฉพาะ Provider) */}
          {user?.role === UserRole.PROVIDER && (
            <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl">
              <h3 className="font-bold text-lg mb-4 text-gray-800">
                💰 ยอดเงินของคุณ
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Available — ถอนได้ทันที */}
                <div className="p-4 bg-white border border-emerald-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Available (ถอนได้ทันที)</p>
                  <p className="text-2xl font-bold text-emerald-600 number-wallet">
                    {(user.wallet_balance || 0).toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">สามารถถอนได้เลย</p>
                </div>

                {/* Pending — เงินรอการปล่อย (Escrow 24-48 ชม.) */}
                <div className="p-4 bg-white border border-blue-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Pending (รอการปล่อย)</p>
                  <p className="text-2xl font-bold text-blue-600 number-wallet">
                    {(user.wallet_pending || 0).toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    พร้อมถอนใน 24-48 ชม. ⏳
                  </p>
                </div>

                {/* ยอดรวมทั้งหมด */}
                <div className="p-4 bg-white border border-purple-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">รวมทั้งหมด</p>
                  <p className="text-2xl font-bold text-purple-600 number-wallet">
                    {(
                      (user.wallet_balance || 0) + (user.wallet_pending || 0)
                    ).toLocaleString()}{" "}
                    บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">รายได้ทั้งหมด</p>
                </div>
              </div>

              {/* ⚠️ ยังไม่สามารถถอนเงินได้ — กติกา 10 งาน หรือ 650 บาท */}
              {payoutEligibility && !payoutEligibility.eligible && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="font-bold text-amber-800 mb-1">⚠️ ยังไม่สามารถถอนเงินได้</p>
                  <p className="text-sm text-amber-700">
                    คุณต้องการอีก {Math.max(0, payoutEligibility.min_jobs - payoutEligibility.completed_jobs)} งาน หรือยอดเงินรวมต้องถึง 650.- เพื่อดำเนินการถอนเงินรอบถัดไป (Batch Payout)
                  </p>
                </div>
              )}

              {/* แสดงเวลาปล่อยเงินล่าสุด (ถ้ามี) */}
              {(user.wallet_pending || 0) > 0 && (
                <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  ⏳ คุณมีเงินรอการปล่อย{" "}
                  {(user.wallet_pending || 0).toLocaleString()} บาท
                  ที่จะพร้อมถอนใน 24-48 ชั่วโมงทำการ
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
              <p className="text-3xl font-bold text-emerald-600 mb-2 number-wallet">
                {(user.wallet_balance || 0).toLocaleString()} บาท
              </p>
              <p className="text-sm text-gray-600">
                ยอดเงินที่สามารถใช้จ่ายได้ทันที
              </p>
            </div>
          )}

          {/* Total Guarantee Credit (ยอดคุ้มครองสะสม) — Virtual Credit from insurance */}
          {(profile?.insurance_credit_balance ?? user?.insurance_credit_balance ?? 0) > 0 && (
            <div className="mb-8 p-6 bg-gradient-to-r from-amber-50 to-amber-100 border-2 border-amber-200 rounded-xl">
              <h3 className="font-bold text-lg mb-2 text-amber-900 flex items-center gap-2">
                <Shield size={20} className="text-amber-600" />
                ยอดคุ้มครองสะสม (Total Guarantee Credit)
              </h3>
              <p className="text-2xl font-bold text-amber-700 number-wallet">
                {(profile?.insurance_credit_balance ?? user?.insurance_credit_balance ?? 0).toLocaleString()} ฿
              </p>
              <p className="text-sm text-amber-700 mt-1">
                เครดิตจากค่าประกันที่จ่ายสะสม — ใช้เป็นส่วนลดได้เมื่อครบเงื่อนไข Maturity Rewards
              </p>
            </div>
          )}

          {/* ปุ่ม Deposit/Withdraw */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              onClick={() => {
                if (profile?.wallet_frozen ?? user?.wallet_frozen) return;
                depositSlipUploadedRef.current = false;
                walletDepositChargeSourceRef.current = null;
                setDepositChargeSourceType(null);
                setDepositSuccessPendingSlip(false);
                setSlipFile(null);
                setWalletDepositM1Step("choose_method");
                setWalletM1Method(null);
                setManualDepositSubmitResult(null);
                setAmount("");
                setWalletDepositPreview(null);
                setWalletDepositPreviewError(null);
                setDepositStep("amount");
                setDepositMethod(null);
                setDepositQrUrl(null);
                setDepositPaymentId(null);
                setManualStaticSlipFile(null);
                setDepositOtherChannelsOpen(false);
                setActiveModal("deposit");
              }}
              disabled={profile?.wallet_frozen ?? user?.wallet_frozen}
              className="p-6 bg-emerald-600 border border-emerald-500 rounded-xl text-white flex flex-col items-center justify-center hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-emerald-600/50"
            >
              <ArrowDownCircle size={32} className="mb-2" />
              <span className="font-bold">เติมเงิน</span>
            </button>
            <button
              onClick={() => !(profile?.wallet_frozen ?? user?.wallet_frozen) && setActiveModal("withdraw")}
              disabled={
                (profile?.wallet_frozen ?? user?.wallet_frozen) ||
                (user?.role === UserRole.PROVIDER && (user.wallet_balance || 0) <= 0) ||
                (user?.role === UserRole.PROVIDER && payoutEligibility && !payoutEligibility.eligible)
              }
              className="p-6 bg-blue-600 border border-blue-500 rounded-xl text-white flex flex-col items-center justify-center hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-blue-600/50"
            >
              <ArrowUpCircle size={32} className="mb-2" />
              <span className="font-bold">
                {user?.role === UserRole.PROVIDER ? "ถอนเงิน" : "Withdraw"}
              </span>
              {(profile?.wallet_frozen ?? user?.wallet_frozen) ? (
                <span className="text-xs text-white/80 mt-1">วอลเล็ตถูกระงับ</span>
              ) : user?.role === UserRole.PROVIDER && (user.wallet_balance || 0) <= 0 ? (
                <span className="text-xs text-white/80 mt-1">ไม่มีเงินถอนได้</span>
              ) : user?.role === UserRole.PROVIDER && payoutEligibility && !payoutEligibility.eligible ? (
                <span className="text-xs text-white/80 mt-1">ยังไม่ถึงเงื่อนไข (10 งาน หรือ 650 บาท)</span>
              ) : null}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowWalletGuide(true)}
            className="mb-6 flex items-center justify-center gap-2 py-2.5 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 transition-colors"
          >
            <BookOpen size={18} />
            {t("wallet_guide.title")}
          </button>

          <h3 className="font-bold mb-1">ประวัติการเคลื่อนไหวกระเป๋า</h3>
          <p className="text-xs text-gray-500 mb-4">
            เติมเงินเข้า · ถอนเงินออก · รายได้ · จากงาน Advance Job (โชว์ Commission)
          </p>
          {/* Filter tabs — default All */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {(["all", "deposit", "withdrawal", "income"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setWalletHistoryFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  walletHistoryFilter === f
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? "แสดงทั้งหมด" : f === "deposit" ? "เติมเงิน" : f === "withdrawal" ? "ถอนเงิน" : "รายได้"}
              </button>
            ))}
          </div>
          <div className="space-y-0 rounded-xl border border-gray-200 overflow-hidden">
            {(() => {
              const ledgerAsList = walletLedgerTransactions.map((t) => {
                const isTip = t.event_type === "wallet_tip" && t.direction === "in";
                const isDeposit = t.event_type === "wallet_deposit";
                const isWithdrawal = t.event_type === "user_payout_withdrawal";
                const type = isTip ? "tip" : isDeposit ? "deposit" : isWithdrawal ? "withdrawal" : (t.direction === "in" ? "income" : "payment_out");
                return {
                  id: t.id,
                  type: type as "income" | "payment_out" | "tip",
                  amount: Math.abs(t.amount),
                  date: t.created_at,
                  description: t.description,
                  status: (t.status as "completed" | "pending" | "failed" | "pending_release" | "waiting_admin") || "completed",
                  commission_deducted: t.commission_deducted,
                  insurance_amount: t.insurance_amount,
                  tips_amount: t.tips_amount,
                  gross_earnings: t.gross_earnings,
                  handling_fee: t.handling_fee,
                  commission_fee: t.commission_fee,
                  commission_percent: t.commission_percent,
                  event_type: t.event_type,
                  job_id: t.job_id,
                  fromLedger: true,
                };
              });
              const payoutAsList = payoutRequests.map((p) => ({
                id: `payout-${p.id}`,
                type: "withdrawal" as const,
                amount: p.amount,
                date: p.processed_at || p.created_at,
                description: "คำขอถอนเงิน",
                status: p.status === "approved" ? "completed" : p.status === "rejected" ? "failed" : "pending",
                fromPayoutRequest: true,
                payoutStatus: p.status,
              }));
              const combined = [...ledgerAsList, ...payoutAsList].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              const filtered = walletHistoryFilter === "all"
                ? combined
                : combined.filter((tx) => {
                    if (walletHistoryFilter === "deposit") return tx.type === "deposit";
                    if (walletHistoryFilter === "withdrawal") return tx.type === "withdrawal";
                    if (walletHistoryFilter === "income") return tx.type === "income" || tx.type === "tip";
                    return true;
                  });
              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center bg-gray-50">
                    <Wallet className="mx-auto mb-2 w-10 h-10" color="#D4AF37" />
                    <p className="text-gray-500 font-medium">
                      {combined.length === 0
                        ? "ยังไม่มีประวัติการเคลื่อนไหว"
                        : "ไม่มีรายการในหมวดนี้"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {combined.length === 0
                        ? "เมื่อมีการเติมเงิน ถอนเงิน หรือรายได้จากงาน จะแสดงที่นี่"
                        : "ลองเปลี่ยนตัวกรองเป็น \"แสดงทั้งหมด\""}
                    </p>
                  </div>
                );
              }
              return filtered.map((tx) => {
                const isIn =
                  tx.type === "deposit" ||
                  tx.type === "income" ||
                  tx.type === "tip";
                const typeLabel =
                  "description" in tx && tx.description
                    ? tx.description
                    : tx.type === "deposit"
                      ? "เติมเงินเข้า"
                      : tx.type === "withdrawal"
                        ? "ถอนเงินออก"
                        : tx.type === "income"
                          ? "รายได้จากงาน"
                          : tx.type === "payment" || tx.type === "payment_out"
                            ? "ชำระงาน"
                            : tx.type === "tip"
                              ? "ทิป"
                              : (tx as Transaction).description;
                const statusLabel =
                  "payoutStatus" in tx && tx.payoutStatus
                    ? tx.payoutStatus === "approved"
                      ? "อนุมัติแล้ว"
                      : tx.payoutStatus === "rejected"
                        ? "ปฏิเสธ"
                        : "รอดำเนินการ"
                    : tx.status === "completed"
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
                const commissionDeducted = "commission_deducted" in tx ? tx.commission_deducted : undefined;
                const hasEarningsBreakdown = tx.type === "income" && "gross_earnings" in tx && tx.gross_earnings != null && tx.gross_earnings > 0;
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
                      {hasEarningsBreakdown && (
                        <div className="text-xs mt-1 space-y-0.5 text-slate-600">
                          <p><span className="text-slate-500">{t("detail.wallet_gross_wage")}:</span> ฿{Number((tx as any).gross_earnings).toLocaleString()}</p>
                          {(tx as any).handling_fee != null && (tx as any).handling_fee > 0 && (
                            <p className="text-amber-700 flex items-center gap-1">
                              {t("detail.wallet_handling_fee")}: -฿{Number((tx as any).handling_fee).toLocaleString()}
                              <button type="button" onClick={(e) => { e.stopPropagation(); setFeeTooltipId(feeTooltipId === `${tx.id}-handling` ? null : `${tx.id}-handling`); }} className="inline-flex text-slate-400 hover:text-blue-600" title={t("detail.fee_tooltip_handling")}>
                                <HelpCircle size={12} />
                              </button>
                            </p>
                          )}
                          {(tx as any).commission_fee != null && (tx as any).commission_fee > 0 && (
                            <p className="text-amber-700 flex items-center gap-1">
                              {t("detail.wallet_platform_commission")} ({(tx as any).commission_percent ?? 24}%): -฿{Number((tx as any).commission_fee).toLocaleString()}
                              <button type="button" onClick={(e) => { e.stopPropagation(); setFeeTooltipId(feeTooltipId === `${tx.id}-commission` ? null : `${tx.id}-commission`); }} className="inline-flex text-slate-400 hover:text-blue-600" title={t("detail.fee_tooltip_commission")}>
                                <HelpCircle size={12} />
                              </button>
                            </p>
                          )}
                          <p className="font-medium text-emerald-700">{t("detail.wallet_net_credited")}: ฿{tx.amount.toLocaleString()}</p>
                          {feeTooltipId === `${tx.id}-handling` && (
                            <p className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mt-0.5">{t("detail.fee_tooltip_handling")}</p>
                          )}
                          {feeTooltipId === `${tx.id}-commission` && (
                            <p className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mt-0.5">{t("detail.fee_tooltip_commission")}</p>
                          )}
                        </div>
                      )}
                      {!hasEarningsBreakdown && commissionDeducted != null && commissionDeducted > 0 && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          หัก Commission ฿{commissionDeducted.toLocaleString()}
                        </p>
                      )}
                      {"insurance_amount" in tx && tx.insurance_amount != null && tx.insurance_amount > 0 && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          ค่าประกัน ฿{Number(tx.insurance_amount).toLocaleString()}
                        </p>
                      )}
                      {"tips_amount" in tx && tx.tips_amount != null && tx.tips_amount > 0 && (
                        <p className="text-xs text-pink-600 mt-0.5">
                          ทิป ฿{Number(tx.tips_amount).toLocaleString()}
                        </p>
                      )}
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
                    <div className="flex-shrink-0 text-right flex flex-col items-end gap-2">
                      <span
                        className={`font-bold tabular-nums ${
                          isIn ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {isIn ? "+" : "-"}
                        {tx.amount.toLocaleString()} ฿
                      </span>
                      {tx.status === "completed" && "fromLedger" in tx && tx.fromLedger && (
                        <button
                          onClick={async () => {
                            try {
                              const { data } = await api.get<{ receipt: any }>(`/wallet/receipt/${tx.id}`);
                              if (data?.receipt) {
                                setFeeTooltipId(null);
                                setReceiptModal(data.receipt);
                              }
                            } catch (e) {
                              notify("ไม่สามารถโหลดใบเสร็จได้", "error");
                            }
                          }}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
                        >
                          📄 ใบเสร็จ
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Tax Documents — Virtual Tax Folder */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="font-bold mb-1 flex items-center gap-2">
              <FileText size={18} className="text-slate-600" />
              เอกสารภาษี
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              ใบเสร็จ · ใบรับรองรายได้ · WHT Certificate
            </p>
            <TaxDocumentsSection api={api} notify={notify} user={user} profile={profile} onRefresh={async () => { try { const { data } = await api.get("/wallet/transactions"); setWalletLedgerTransactions(data?.transactions || []); const uid = user?.id || profile?.id; if (uid) { const { data: p } = await api.get(`/users/profile/${uid}`); if (p) setProfile(p); } } catch (_) {} }} />
          </div>
        </div>
      )}

      {/* PORTFOLIO / EXPERT (Provider only) */}
      {activeTab === "portfolio" && (user?.role === UserRole.PROVIDER || profile?.role === UserRole.PROVIDER || profile?.role === "provider") && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100">Portfolio & Personal Branding</h3>
              <p className="text-sm text-slate-400">Visual Portfolio, Video Greeting, Verified Badge, Signature Service, The Journey</p>
            </div>
            {(profile?.id || user?.id) && (
              <button
                type="button"
                onClick={() => navigate(`/talents/${profile?.id || user?.id}`)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm transition"
              >
                <Eye size={18} />
                {t("profile.view_as_customer")}
              </button>
            )}
          </div>

          {/* คู่มือใช้งาน Portfolio */}
          <details className="group rounded-xl border border-slate-600 bg-slate-800/30 overflow-hidden">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 list-none [&::-webkit-details-marker]:hidden">
              <HelpCircle size={18} className="shrink-0" />
              <span className="font-medium">คู่มือใช้งาน Portfolio</span>
              <ChevronDown size={18} className="shrink-0 ml-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm text-slate-400 space-y-3 border-t border-slate-700">
              <p><strong className="text-slate-300">รูปผลงาน:</strong> อัปโหลดไฟล์ (JPG, PNG, WebP, GIF) หรือใส่ URL — แสดงในโปรไฟล์ลูกค้าแท็บ About</p>
              <p><strong className="text-slate-300">วิดีโอใน Portfolio:</strong> URL ที่ลงท้าย .mp4, .webm, .mov จะไปรวมใน Story ด้วย</p>
              <p><strong className="text-slate-300">คลิป Greeting:</strong> ใส่ URL คลิปสั้นโชว์เทคนิค/แนะนำตัว (เช่น YouTube)</p>
              <p><strong className="text-slate-300">The Journey:</strong> เล่าประวัติหรือแนวคิดในการทำงาน — ช่วยให้ลูกค้าเชื่อมโยงกับคุณ</p>
              <p><strong className="text-slate-300">ช่วงเวลาว่าง:</strong> ตั้งเวลาเปิดจองคิว — ลูกค้าจองได้ทันทีในโปรไฟล์</p>
              <p className="text-slate-500 text-xs">กดปุ่ม "ดูแบบลูกค้า" เพื่อดูโปรไฟล์ในมุมมองลูกค้า</p>
            </div>
          </details>

          {/* Profile Completeness — แถบความสมบูรณ์ + คำแนะนำ */}
          {(() => {
            const items = [
              { key: "expert_category", label: "หมวด Expert", filled: !!(profile?.expert_category || user?.expert_category) },
              { key: "portfolio_urls", label: "รูปผลงาน", filled: !!((profile?.portfolio_urls || user?.portfolio_urls || []).length > 0) },
              { key: "greeting_video_url", label: "คลิป Greeting", filled: !!(profile?.greeting_video_url || user?.greeting_video_url) },
              { key: "verified_badge", label: "Verified Badge", filled: !!(profile?.verified_badge || user?.verified_badge) },
              { key: "signature_service", label: "Signature Service", filled: !!(profile?.signature_service || user?.signature_service) },
              { key: "the_journey", label: "The Journey", filled: !!(profile?.the_journey || user?.the_journey) },
              { key: "social", label: t("profile.add_social_links"), filled: !!(((profile as { instagram_url?: string })?.instagram_url || (user as { instagram_url?: string })?.instagram_url)?.trim() || ((profile as { line_id?: string })?.line_id || (user as { line_id?: string })?.line_id)?.trim()) },
            ];
            const filled = items.filter((i) => i.filled).length;
            const pct = Math.round((filled / items.length) * 100);
            const tips = items.filter((i) => !i.filled).map((i) => i.label);
            return (
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">{t("profile.profile_completeness")}</span>
                  <span className="text-sm font-bold text-emerald-400">{pct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {tips.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {t("profile.profile_complete_tip")}: {tips.slice(0, 3).join(" · ")}
                  </p>
                )}
              </div>
            );
          })()}

          <div className="grid gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Expert Category (สำหรับ Filter หน้า Talents)</label>
              <select
                value={profile?.expert_category || ""}
                onChange={async (e) => {
                  const v = e.target.value || null;
                  if (!profile?.id) return;
                  try {
                    await api.patch(`/users/profile/${profile.id}`, { expert_category: v });
                    setProfile((p) => (p ? { ...p, expert_category: v as any } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (_) {
                    notify("บันทึกไม่สำเร็จ", "error");
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100"
              >
                <option value="">— เลือกหมวด —</option>
                <option value="chef">Gourmet & Chef</option>
                <option value="tailor">Style Masters (Tailor)</option>
                <option value="artist">Entertainment (Artist)</option>
                <option value="barber">Barber</option>
                <option value="wellness">Wellness & Spa</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Portfolio (รูปผลงาน Lookbook)</label>
              <div className="mb-3">
                <PortfolioImageUploader
                  onSuccess={async (url) => {
                    if (!profile?.id) return;
                    const current = profile?.portfolio_urls || [];
                    const urls = [...current, url];
                    try {
                      await api.patch(`/users/profile/${profile.id}`, { portfolio_urls: urls });
                      setProfile((p) => (p ? { ...p, portfolio_urls: urls } : null));
                      notify("อัปโหลดรูปผลงานสำเร็จ", "success");
                    } catch (_) {
                      notify("บันทึกไม่สำเร็จ", "error");
                    }
                  }}
                  onError={(msg) => notify(msg, "error")}
                />
              </div>
              <p className="text-xs text-slate-500 mb-2">หรือใส่ URL ตรงนี้ (คั่นด้วยบรรทัดใหม่):</p>
              <textarea
                value={(profile?.portfolio_urls || []).join("\n")}
                onChange={async (e) => {
                  const urls = e.target.value.split("\n").map((u) => u.trim()).filter(Boolean);
                  if (!profile?.id) return;
                  try {
                    await api.patch(`/users/profile/${profile.id}`, { portfolio_urls: urls });
                    setProfile((p) => (p ? { ...p, portfolio_urls: urls } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (_) {
                    notify("บันทึกไม่สำเร็จ", "error");
                  }
                }}
                placeholder="https://example.com/work1.jpg"
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 backdrop-blur-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Video Masterclass (Greeting) — URL คลิปสั้นโชว์เทคนิค</label>
              <input
                type="url"
                value={profile?.greeting_video_url || ""}
                onChange={async (e) => {
                  const v = e.target.value.trim() || null;
                  if (!profile?.id) return;
                  try {
                    await api.patch(`/users/profile/${profile.id}`, { greeting_video_url: v });
                    setProfile((p) => (p ? { ...p, greeting_video_url: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (_) {
                    notify("บันทึกไม่สำเร็จ", "error");
                  }
                }}
                placeholder="https://youtube.com/..."
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Verified Skills Badge</label>
              <select
                value={profile?.verified_badge || ""}
                onChange={async (e) => {
                  const v = e.target.value || null;
                  if (!profile?.id) return;
                  try {
                    await api.patch(`/users/profile/${profile.id}`, { verified_badge: v });
                    setProfile((p) => (p ? { ...p, verified_badge: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (_) {
                    notify("บันทึกไม่สำเร็จ", "error");
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100"
              >
                <option value="">— ไม่ตั้ง —</option>
                <option value="Master Tailor">Master Tailor</option>
                <option value="Authentic Chef">Authentic Chef</option>
                <option value="Style Master">Style Master</option>
                <option value="Wellness Expert">Wellness Expert</option>
                <option value="Creative Artist">Creative Artist</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Signature Service (เมนู/สไตล์ที่เป็นเอกลักษณ์)</label>
              <textarea
                value={profile?.signature_service || ""}
                onChange={async (e) => {
                  const v = e.target.value.trim().slice(0, 500) || null;
                  if (!profile?.id) return;
                  try {
                    await api.patch(`/users/profile/${profile.id}`, { signature_service: v });
                    setProfile((p) => (p ? { ...p, signature_service: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (_) {
                    notify("บันทึกไม่สำเร็จ", "error");
                  }
                }}
                placeholder="เช่น Signature Menu ของเชฟ หรือสไตล์การตัดสูทที่เป็นเอกลักษณ์"
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 backdrop-blur-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">The Journey — ประวัติ/แนวคิดในการทำงาน (Personal Storytelling)</label>
              <textarea
                value={profile?.the_journey || ""}
                onChange={async (e) => {
                  const v = e.target.value.trim().slice(0, 2000) || null;
                  if (!profile?.id) return;
                  try {
                    await api.patch(`/users/profile/${profile.id}`, { the_journey: v });
                    setProfile((p) => (p ? { ...p, the_journey: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (_) {
                    notify("บันทึกไม่สำเร็จ", "error");
                  }
                }}
                placeholder="เล่าประวัติหรือแนวคิดในการทำงาน เพื่อให้คนจ้างรู้สึก Connect กับตัวคุณ"
                rows={5}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 backdrop-blur-sm"
              />
            </div>

            {/* Social Links — Instagram, Line */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t("profile.instagram")}</label>
                <input
                  type="text"
                  value={profile?.instagram_url || user?.instagram_url || ""}
                  onChange={async (e) => {
                    const v = e.target.value.trim().slice(0, 255) || null;
                    if (!profile?.id) return;
                    try {
                      await api.patch(`/users/profile/${profile.id}`, { instagram_url: v });
                      setProfile((p) => (p ? { ...p, instagram_url: v } : null));
                      notify("บันทึกแล้ว", "success");
                    } catch (_) {
                      notify("บันทึกไม่สำเร็จ", "error");
                    }
                  }}
                  placeholder="username หรือ https://instagram.com/..."
                  className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t("profile.line_id")}</label>
                <input
                  type="text"
                  value={profile?.line_id || user?.line_id || ""}
                  onChange={async (e) => {
                    const v = e.target.value.trim().slice(0, 100) || null;
                    if (!profile?.id) return;
                    try {
                      await api.patch(`/users/profile/${profile.id}`, { line_id: v });
                      setProfile((p) => (p ? { ...p, line_id: v } : null));
                      notify("บันทึกแล้ว", "success");
                    } catch (_) {
                      notify("บันทึกไม่สำเร็จ", "error");
                    }
                  }}
                  placeholder="@username หรือ Line ID"
                  className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">ช่วงเวลาว่าง (Advance Booking) — เปิดให้ลูกค้าจองคิว</label>
              <p className="text-xs text-slate-500 mb-3">เพิ่มช่วงเวลา เช่น ศุกร์–อาทิตย์ มื้อค่ำ</p>
              <AvailabilitySlotsBlock />
            </div>
          </div>
        </div>
      )}

      {/* STORY — Verified Work Clips (Provider only) */}
      {activeTab === "story" && (profile?.role === UserRole.PROVIDER || profile?.role === "provider") && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
          <h3 className="text-lg font-bold text-slate-100">Story — Verified Work Clips</h3>
          <p className="text-sm text-slate-400">คลิปผลงานที่ลูกค้าจะเห็นในโปรไฟล์ของคุณ (จาก Portfolio + Greeting Video + Firestore)</p>

          {/* คู่มือใช้งาน Story */}
          <details className="group rounded-xl border border-slate-600 bg-slate-800/30 overflow-hidden">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 list-none [&::-webkit-details-marker]:hidden">
              <HelpCircle size={18} className="shrink-0" />
              <span className="font-medium">คู่มือใช้งาน Story</span>
              <ChevronDown size={18} className="shrink-0 ml-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm text-slate-400 space-y-3 border-t border-slate-700">
              <p><strong className="text-slate-300">แหล่งที่มาของคลิป:</strong> (1) อัปโหลดด้านล่าง (2) Greeting Video จาก Portfolio (3) วิดีโอ URL ใน Portfolio (.mp4, .webm, .mov)</p>
              <p><strong className="text-slate-300">การแสดงผล:</strong> คลิปแสดงเป็น Grid — ลูกค้าคลิกดูแบบ Full-screen เลื่อนซ้าย/ขวาได้ (TikTok-style)</p>
              <p><strong className="text-slate-300">คลิปที่อัปโหลด:</strong> จะไปแสดงใน Video Feed ด้วย — ระบบติดลายน้ำและฉากคลิปจบอัตโนมัติ (รอ 30 วินาที–2 นาที)</p>
              <p><strong className="text-slate-300">เคล็ดลับ:</strong> อัปโหลดคลิปสั้น 15–60 วินาที โชว์เทคนิคหรือผลงานจริง</p>
            </div>
          </details>

          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <p className="text-sm font-medium text-slate-300 mb-3">อัปโหลดคลิปผลงาน → จะไปแสดงใน Video Feed ทันที</p>
            <VideoUploader
              navigateToFeedOnSuccess={true}
              onSuccess={async () => {
                try {
                  const list = await videoService.getMyVideos();
                  setBackendWorkClips((list || []).map((v) => ({ id: v.id, url: v.video_url, title: v.title || undefined, description: v.description || undefined })));
                } catch (_) {}
              }}
              onError={(msg) => notify(msg, "error")}
            />
          </div>
          <VideoStoryGrid
            clips={(() => {
              const clips: { id: string; url: string; title?: string; description?: string }[] = [];
              const seen = new Set<string>();
              const p = profile;
              if (!p) return clips;
              if (p.greeting_video_url && !seen.has(p.greeting_video_url)) {
                clips.push({ id: "greeting", url: p.greeting_video_url, title: "Greeting" });
                seen.add(p.greeting_video_url);
              }
              backendWorkClips.forEach((c) => {
                if (c.url && !seen.has(c.url)) {
                  clips.push({ id: c.id, url: c.url, title: c.title, description: c.description });
                  seen.add(c.url);
                }
              });
              profileWorkClips.forEach((c) => {
                if (c.url && !seen.has(c.url)) {
                  clips.push({ id: c.id, url: c.url });
                  seen.add(c.url);
                }
              });
              (p.portfolio_urls || []).forEach((url: string, i: number) => {
                if (typeof url === "string" && VIDEO_EXT.test(url) && !seen.has(url)) {
                  clips.push({ id: `portfolio-${i}`, url });
                  seen.add(url);
                }
              });
              return clips;
            })()}
            emptyMessage="ยังไม่มีคลิป — อัปโหลดด้านบน หรือเพิ่ม Greeting Video / Portfolio ในแท็บ Portfolio"
          />
        </div>
      )}

      {/* CONNECTION TAB — UID:Key, Coach-Trainee */}
      {activeTab === "connection" && (
        <ConnectionTab userId={user?.id || profile?.id} />
      )}

      {/* EARNINGS — ข้อมูลจริงจาก Backend (walletLedgerTransactions) */}
      {activeTab === "earnings" && (() => {
        // รายได้จากงาน: direction === 'in' และไม่ใช่ wallet_deposit
        const incomeTxs = walletLedgerTransactions.filter(
          (t) =>
            t.direction === "in" &&
            (t as { event_type?: string }).event_type !== "wallet_deposit" &&
            !(t.description || "").startsWith("เติมเงิน")
        );
        const now = new Date();
        const getWeekStart = (d: Date) => {
          const x = new Date(d);
          const day = x.getDay();
          const diff = x.getDate() - day + (day === 0 ? -6 : 1);
          x.setDate(diff);
          x.setHours(0, 0, 0, 0);
          return x;
        };
        const weekStart = getWeekStart(now);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const sumInRange = (start: Date, end?: Date) =>
          incomeTxs.reduce((s, t) => {
            const tDate = new Date(t.created_at);
            if (tDate >= start && (!end || tDate <= end)) return s + (t.amount || 0);
            return s;
          }, 0);
        const weekly = sumInRange(weekStart);
        const monthly = sumInRange(monthStart);
        const yearly = sumInRange(yearStart);
        const totalCommission = incomeTxs.reduce((s, t) => s + (t.commission_deducted || 0), 0);
        const pending = profile?.wallet_pending ?? user?.wallet_pending ?? 0;

        // กราฟรายเดือน (6 เดือนล่าสุด)
        const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        const chartData = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
          const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
          const amt = sumInRange(d, next);
          return {
            name: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
            amount: amt,
            commission: incomeTxs
              .filter((t) => {
                const tDate = new Date(t.created_at);
                return tDate >= d && tDate <= next;
              })
              .reduce((s, t) => s + (t.commission_deducted || 0), 0),
          };
        });

        const hasAnyIncome = incomeTxs.length > 0 || weekly > 0 || monthly > 0 || yearly > 0;

        return (
          <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
            <h3 className="font-bold text-lg text-slate-100">รายได้</h3>

            {/* Time range selector — เลือกช่วงเวลาที่ต้องการดู */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-400">ดูตามช่วง:</span>
              <div className="flex gap-2">
                {(["week", "month", "year"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setEarningsTimeRange(r)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                      earningsTimeRange === r
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                    }`}
                  >
                    {r === "week" ? t("profile.earnings_period_week") : r === "month" ? t("profile.earnings_period_month") : t("profile.earnings_period_year")}
                  </button>
                ))}
              </div>
              <span className="text-sm font-bold text-emerald-400">
                {earningsTimeRange === "week" ? weekly : earningsTimeRange === "month" ? monthly : yearly} ฿
              </span>
            </div>

            {hasAnyIncome ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">{t("profile.weekly_inc")}</p>
                    <p className="text-xl font-bold text-emerald-400">{weekly.toLocaleString()} ฿</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">{t("profile.monthly_inc")}</p>
                    <p className="text-xl font-bold text-emerald-400">{monthly.toLocaleString()} ฿</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">{t("profile.yearly_inc")}</p>
                    <p className="text-xl font-bold text-emerald-400">{yearly.toLocaleString()} ฿</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">{t("profile.earnings_pending")}</p>
                    <p className="text-xl font-bold text-amber-400">{(pending || 0).toLocaleString()} ฿</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 col-span-2 sm:col-span-4">
                    <p className="text-xs text-slate-400 mb-1">{t("profile.earnings_commission")}</p>
                    <p className="text-lg font-bold text-slate-300">{totalCommission.toLocaleString()} ฿</p>
                  </div>
                </div>

                {/* Chart */}
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-3">{t("profile.earnings_chart")}</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                        formatter={(value: number) => [`${value.toLocaleString()} ฿`, ""]}
                        labelFormatter={(label) => label}
                      />
                      <Bar dataKey="amount" fill="#10B981" radius={[4, 4, 0, 0]} name="รายได้" />
                      <Bar dataKey="commission" fill="#64748b" radius={[4, 4, 0, 0]} name="ค่าคอม" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Recent income list */}
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-3">{t("profile.earnings_recent")}</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {incomeTxs.slice(0, 20).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-800/30 border border-slate-700/50 text-sm"
                      >
                        <div>
                          <p className="text-slate-200 truncate max-w-[200px] sm:max-w-none">{tx.description || "รายได้จากงาน"}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDateThaiShort(tx.created_at)}
                            {(tx as { job_id?: string }).job_id && (
                              <button
                                type="button"
                                onClick={() => navigate(`/jobs/${(tx as { job_id?: string }).job_id}`)}
                                className="ml-2 text-emerald-500 hover:text-emerald-400"
                              >
                                ดูงาน
                              </button>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-400">+{tx.amount.toLocaleString()} ฿</span>
                          {tx.commission_deducted != null && tx.commission_deducted > 0 && (
                            <p className="text-xs text-slate-500">หัก {tx.commission_deducted.toLocaleString()} ฿</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Empty State */
              <div className="py-12 px-6 text-center rounded-xl bg-slate-800/30 border border-slate-700/50">
                <Wallet className="mx-auto mb-4 w-14 h-14 text-slate-500" />
                <p className="text-slate-300 font-medium mb-2">{t("profile.earnings_empty")}</p>
                <div className="flex flex-wrap gap-3 justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => navigate("/jobs")}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition"
                  >
                    {t("profile.view_jobs")}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="px-6 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-medium text-sm transition"
                  >
                    {t("profile.view_home")}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* REVIEWS SECTION */}
      {activeTab === "reviews" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">

          {/* ── Worker Grade Card (full) ── */}
          {(user?.role === "provider" || profile?.role === UserRole.PROVIDER || profile?.role === "provider") && (user?.id || profile?.id) && (
            <WorkerGradeBadge
              userId={user?.id || profile?.id || ''}
              variant="full"
              reviewStats={reviewStats ?? undefined}
            />
          )}

          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-100">รีวิวทั้งหมด</h3>
              <div className="flex items-center mt-1">
                <div className="flex text-yellow-400 mr-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      fill={i < Math.round(workerGrade?.avg_rating || user?.rating || 0) ? "currentColor" : "none"}
                      className={i < Math.round(workerGrade?.avg_rating || user?.rating || 0) ? "" : "text-slate-600"}
                    />
                  ))}
                </div>
                <span className="text-slate-400 text-sm">
                  {(workerGrade?.avg_rating || user?.rating || 0).toFixed(1)} ({workerGrade?.total_reviews ?? reviews.length} รีวิว)
                </span>
              </div>
            </div>

            {user?.role === "provider" && (
              <button
                onClick={() => navigate("/provider/dashboard")}
                data-tour="talent-dashboard-link"
                className="px-4 py-2 bg-blue-600 text-white border border-blue-500 rounded-xl hover:bg-blue-700 text-sm font-medium transition-colors"
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

      {/* คู่มือเติมเงินและถอนเงิน */}
      <WalletGuideModal
        isOpen={showWalletGuide}
        onClose={() => setShowWalletGuide(false)}
      />

      {/* --- MODALS (Deposit / Withdraw) - Portal เพื่อให้แสดงเหนือทุก element --- */}
      {activeModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md my-8 animate-in zoom-in-95">
            {activeModal === "deposit" && depositSuccessPendingSlip && depositPaymentId ? (
              <>
                <div className="text-center mb-4">
                  <CheckCircle className="text-emerald-500 mx-auto mb-2" size={40} />
                  <h3 className="text-xl font-bold text-slate-800">ชำระเงินแล้ว — แนบสลิปเป็นหลักฐาน</h3>
                  <p className="text-sm text-slate-600 mt-2">
                    อัปโหลดรูปหรือ PDF สลิปการชำระ (บังคับทุกรายการ)
                  </p>
                  <p className="text-lg font-bold text-emerald-800 mt-2">
                    ฿{Number(amount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 mb-4">
                  <label className="text-xs font-bold text-slate-600 block mb-2">เลือกไฟล์สลิป</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={uploadingSlip}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f || !depositPaymentId) return;
                      setUploadingSlip(true);
                      try {
                        await uploadWalletDepositSlipToServer(f, depositPaymentId);
                        depositSlipUploadedRef.current = true;
                        await finishDepositSuccessUi(depositPendingSuccessMessageRef.current);
                      } catch (err: any) {
                        notify(
                          err?.response?.data?.error || err?.message || "อัปโหลดล้มเหลว",
                          "error",
                        );
                      } finally {
                        setUploadingSlip(false);
                        e.target.value = "";
                      }
                    }}
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-xs"
                  />
                  {uploadingSlip && (
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                      <Loader2 size={14} className="animate-spin" /> กำลังอัปโหลด...
                    </p>
                  )}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                  ต้องอัปโหลดสลิปเพื่อบันทึกหลักฐานรายการนี้ให้ครบถ้วน
                </p>
              </>
            ) : activeModal === "deposit" && walletDepositM1Step ? (
              <>
                {walletDepositM1Step === "choose_method" && (
                  <>
                    <h3 className="text-xl font-bold text-slate-800 mb-1">เติมเงิน</h3>
                    <p className="text-xs text-slate-600 mb-4">
                      เลือกช่องทาง — ค่าธรรมเนียมดูได้ในขั้นตอนถัดไปเมื่อกด &quot;ดูค่าธรรมเนียม&quot; เท่านั้น
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletM1Method("manual_slip");
                        setWalletDepositM1Step("enter_amount");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full mb-3 py-3 rounded-xl border-2 border-amber-400 bg-amber-50 text-left px-4 hover:bg-amber-100"
                    >
                      <span className="block font-bold text-amber-950">แนบสลิป (Manual)</span>
                      <span className="block text-xs text-slate-600 mt-1">
                        โอนแล้วอัปโหลดสลิป — ยอดเข้าหลังทีมตรวจ
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletM1Method("payso_promptpay");
                        setWalletDepositM1Step("enter_amount");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full mb-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-left px-4 hover:bg-emerald-100"
                    >
                      <span className="block font-bold text-emerald-900">PromptPay QR (PaySo)</span>
                      <span className="block text-xs text-slate-600 mt-1">
                        สร้าง QR จาก PaySo — สแกนจ่ายผ่านแอปธนาคาร
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletM1Method("gateway_card");
                        setWalletDepositM1Step("enter_amount");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full mb-3 py-3 rounded-xl border-2 border-blue-500 bg-blue-50 text-left px-4 hover:bg-blue-100"
                    >
                      <span className="block font-bold text-blue-900">Credit / Debit Card</span>
                      <span className="block text-xs text-slate-600 mt-1">
                        ชำระผ่านเกตเวย์บัตร — ระบบเครดิตอัตโนมัติหลังยืนยันสำเร็จ
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletM1Method("gateway_truemoney");
                        setWalletDepositM1Step("enter_amount");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full mb-3 py-3 rounded-xl border-2 border-orange-500 bg-orange-50 text-left px-4 hover:bg-orange-100"
                    >
                      <span className="block font-bold text-orange-900">TrueMoney Wallet</span>
                      <span className="block text-xs text-slate-600 mt-1">
                        ยืนยันในแอป TrueMoney — ระบบเครดิตอัตโนมัติ
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletM1Method("gateway_mobile_banking");
                        setWalletDepositM1Step("enter_amount");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full mb-4 py-3 rounded-xl border-2 border-purple-500 bg-purple-50 text-left px-4 hover:bg-purple-100"
                    >
                      <span className="block font-bold text-purple-900">Mobile Banking</span>
                      <span className="block text-xs text-slate-600 mt-1">
                        ยืนยันการชำระผ่านธนาคารที่รองรับ — เครดิตอัตโนมัติ
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        setWalletDepositM1Step(null);
                        setWalletM1Method(null);
                        setManualDepositSubmitResult(null);
                        setAmount("");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                        setManualStaticSlipFile(null);
                      }}
                      className="w-full py-2.5 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                  </>
                )}
                {walletDepositM1Step === "enter_amount" && walletM1Method && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletDepositM1Step("choose_method");
                        setWalletM1Method(null);
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full mb-3 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl font-medium text-left px-3"
                    >
                      ← เลือกช่องทางใหม่
                    </button>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">
                      {walletM1Method === "manual_slip"
                        ? "แนบสลิป (Manual)"
                        : walletM1Method === "payso_promptpay"
                          ? "PromptPay QR (PaySo)"
                          : walletM1Method === "gateway_card"
                            ? "Credit / Debit Card"
                            : walletM1Method === "gateway_truemoney"
                              ? "TrueMoney Wallet"
                              : "Mobile Banking"}
                    </h3>
                    <label className="text-xs font-bold text-slate-600">ยอดเติม (บาท)</label>
                    <input
                      type="number"
                      className="w-full p-3 border rounded-lg mb-3 font-mono"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      disabled={processing}
                      placeholder="เช่น 500"
                    />
                    {walletM1Method === "gateway_truemoney" && (
                      <>
                        <label className="text-xs font-bold text-slate-600">เบอร์ TrueMoney (10 หลัก)</label>
                        <input
                          type="tel"
                          className="w-full p-3 border rounded-lg mb-3 font-mono"
                          value={truemoneyPhone}
                          onChange={(e) => setTruemoneyPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          disabled={processing}
                          placeholder="08xxxxxxxx"
                        />
                      </>
                    )}
                    {walletM1Method === "gateway_mobile_banking" && (
                      <>
                        <label className="text-xs font-bold text-slate-600">ธนาคาร</label>
                        <select
                          className="w-full p-3 border rounded-lg mb-3"
                          value={mobileBankingBankCode}
                          onChange={(e) => setMobileBankingBankCode((e.target.value || "scb") as any)}
                          disabled={processing}
                        >
                          <option value="scb">SCB</option>
                          <option value="ktb">KTB</option>
                          <option value="bbl">BBL</option>
                          <option value="bay">BAY</option>
                        </select>
                      </>
                    )}
                    {walletM1Method === "gateway_card" && (
                      <>
                        <label className="text-xs font-bold text-slate-600">เลขบัตร</label>
                        <input
                          type="text"
                          className="w-full p-3 border rounded-lg mb-2 font-mono"
                          value={cardFormData.number}
                          onChange={(e) =>
                            setCardFormData((prev) => ({ ...prev, number: formatCardNumber(e.target.value) }))
                          }
                          disabled={processing}
                          placeholder="4242 4242 4242 4242"
                        />
                        <label className="text-xs font-bold text-slate-600">ชื่อบนบัตร</label>
                        <input
                          type="text"
                          className="w-full p-3 border rounded-lg mb-2"
                          value={cardFormData.name}
                          onChange={(e) =>
                            setCardFormData((prev) => ({ ...prev, name: e.target.value }))
                          }
                          disabled={processing}
                          placeholder="NAME SURNAME"
                        />
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className="text-xs font-bold text-slate-600">Expiry</label>
                            <input
                              type="text"
                              className="w-full p-3 border rounded-lg font-mono"
                              value={cardFormData.expiry}
                              onChange={(e) =>
                                setCardFormData((prev) => ({ ...prev, expiry: formatExpiry(e.target.value) }))
                              }
                              disabled={processing}
                              placeholder="MM/YY"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-600">CVC</label>
                            <input
                              type="password"
                              className="w-full p-3 border rounded-lg font-mono"
                              value={cardFormData.cvc}
                              onChange={(e) =>
                                setCardFormData((prev) => ({
                                  ...prev,
                                  cvc: e.target.value.replace(/\D/g, "").slice(0, 4),
                                }))
                              }
                              disabled={processing}
                              placeholder="123"
                            />
                          </div>
                        </div>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void fetchWalletDepositPreviewOnDemand()}
                      disabled={walletDepositPreviewLoading || processing}
                      className="w-full py-2.5 mb-3 bg-slate-100 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-50"
                    >
                      {walletDepositPreviewLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 size={16} className="animate-spin" /> กำลังโหลด...
                        </span>
                      ) : (
                        "ดูค่าธรรมเนียม"
                      )}
                    </button>
                    {walletDepositPreviewError && (
                      <p className="text-xs text-rose-600 mb-2">{walletDepositPreviewError}</p>
                    )}
                    {(() => {
                      const rows = buildWalletDepositPreviewRows(walletDepositPreview);
                      if (!rows) return null;
                      return (
                        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 space-y-1">
                          <p className="font-bold text-slate-800 text-sm">สรุปจากระบบ</p>
                          {rows.map((r) => (
                            <p key={r.key}>
                              <span className="text-slate-500">{r.labelTh}:</span>{" "}
                              <span className="font-mono font-semibold">฿{r.valueDisplay}</span>
                            </p>
                          ))}
                          {walletDepositPreview?.tip ? (
                            <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1">
                              {walletDepositPreview.tip}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                    {walletM1Method === "payso_promptpay" ? (
                      <button
                        type="button"
                        onClick={() => void handleDepositWithPromptPay()}
                        disabled={
                          processing ||
                          !amount ||
                          isNaN(Number(amount)) ||
                          Number(amount) < 1
                        }
                        className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50 mb-3"
                      >
                        {processing ? "กำลังสร้าง QR..." : "สร้าง QR รับเงิน (PaySo)"}
                      </button>
                    ) : walletM1Method === "manual_slip" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const amt = Number(amount);
                          if (!Number.isFinite(amt) || amt < 1) {
                            notify("กรุณากรอกยอดตั้งแต่ 1 บาทขึ้นไป", "error");
                            return;
                          }
                          setWalletDepositM1Step("manual_slip");
                        }}
                        disabled={
                          processing ||
                          !amount ||
                          isNaN(Number(amount)) ||
                          Number(amount) < 1
                        }
                        className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold disabled:opacity-50 mb-3"
                      >
                        ถัดไป — แนบสลิป
                      </button>
                    ) : walletM1Method === "gateway_card" ? (
                      <button
                        type="button"
                        onClick={() => void handleDepositWithCard()}
                        disabled={
                          processing ||
                          !amount ||
                          isNaN(Number(amount)) ||
                          Number(amount) < 1 ||
                          !cardFormData.number.trim() ||
                          !cardFormData.name.trim() ||
                          !cardFormData.expiry.trim() ||
                          !cardFormData.cvc.trim()
                        }
                        className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50 mb-3"
                      >
                        {processing ? "กำลังชำระเงิน..." : "ชำระด้วยบัตร"}
                      </button>
                    ) : walletM1Method === "gateway_truemoney" ? (
                      <button
                        type="button"
                        onClick={() => void handleDepositTrueMoney()}
                        disabled={
                          processing ||
                          !amount ||
                          isNaN(Number(amount)) ||
                          Number(amount) < 1 ||
                          truemoneyPhone.length !== 10
                        }
                        className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold disabled:opacity-50 mb-3"
                      >
                        {processing ? "กำลังเปิดแอป..." : "ยืนยันผ่าน TrueMoney"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleDepositMobileBanking()}
                        disabled={
                          processing ||
                          !amount ||
                          isNaN(Number(amount)) ||
                          Number(amount) < 1
                        }
                        className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold disabled:opacity-50 mb-3"
                      >
                        {processing ? "กำลังเปิดธนาคาร..." : "ยืนยันผ่าน Mobile Banking"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        setWalletDepositM1Step(null);
                        setWalletM1Method(null);
                        setManualDepositSubmitResult(null);
                        setAmount("");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                        setManualStaticSlipFile(null);
                      }}
                      className="w-full py-2.5 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                    <div className="mt-3 text-center text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => setShowRefundPolicy(true)}
                        className="text-emerald-600 hover:underline"
                      >
                        นโยบายการคืนเงิน
                      </button>
                    </div>
                  </>
                )}
                {walletDepositM1Step === "manual_slip" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletDepositM1Step("enter_amount");
                        setManualStaticSlipFile(null);
                      }}
                      className="w-full mb-3 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl font-medium text-left px-3"
                    >
                      ← กลับไปแก้ยอด
                    </button>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">แนบสลิป</h3>
                    <p className="text-xs text-slate-600 mb-2">
                      ยอดคำขอ:{" "}
                      <span className="font-mono font-bold">
                        ฿{formatDepositAmountThb(Number(amount) || 0)}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setManualStaticQrExpanded((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-sm font-medium text-slate-800 py-2 px-2 border rounded-lg mb-2"
                    >
                      <span className="text-left">QR พร้อมเพย์นิ่ง (อ้างอิงโอน — ไม่บังคับ)</span>
                      <ChevronDown
                        className={`w-5 h-5 shrink-0 transition-transform ${manualStaticQrExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {manualStaticQrExpanded && (
                      <div className="mb-3 p-3 border rounded-xl bg-slate-50">
                        <div className="flex justify-center mb-3 bg-white p-2 rounded-lg">
                          <img
                            src={WALLET_MANUAL_KTB_QR}
                            alt="PromptPay QR Static"
                            className="max-w-[240px] w-full object-contain"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = WALLET_MANUAL_KTB_QR;
                            a.download = "ktb-promptpay-qr.png";
                            a.rel = "noopener";
                            a.click();
                            notify("บันทึก QR ลงเครื่อง", "success");
                          }}
                          className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold"
                        >
                          บันทึก QR ลงเครื่อง
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={processing}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setManualStaticSlipFile(f || null);
                      }}
                      className="w-full text-sm text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:bg-emerald-600 file:text-white mb-3"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSubmitManualStaticSlip()}
                      disabled={
                        processing ||
                        !amount ||
                        isNaN(Number(amount)) ||
                        Number(amount) <= 0 ||
                        !manualStaticSlipFile
                      }
                      className="w-full py-3 bg-sky-500 text-white rounded-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed mb-3"
                    >
                      {processing ? "กำลังส่ง..." : "ส่งสลิปเพื่อตรวจสอบ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        setWalletDepositM1Step(null);
                        setWalletM1Method(null);
                        setManualDepositSubmitResult(null);
                        setAmount("");
                        setManualStaticSlipFile(null);
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full py-2.5 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                  </>
                )}
                {walletDepositM1Step === "manual_done" && manualDepositSubmitResult && (
                  <>
                    <div className="text-center mb-4">
                      <Clock className="text-amber-500 mx-auto mb-2" size={40} />
                      <h3 className="text-xl font-bold text-slate-800">รอตรวจสอบ</h3>
                      <p className="text-sm text-slate-600 mt-2">
                        สถานะจากระบบ:{" "}
                        <span className="font-mono font-semibold text-slate-800">
                          {manualDepositSubmitResult.status}
                        </span>
                      </p>
                      {manualDepositSubmitResult.id ? (
                        <p className="text-xs text-slate-500 mt-2">
                          เลขอ้างอิงคำขอ:{" "}
                          <span className="font-mono">{manualDepositSubmitResult.id}</span>
                        </p>
                      ) : null}
                      {manualDepositSubmitResult.amount != null ? (
                        <p className="text-sm text-slate-700 mt-2">
                          ยอด: ฿{formatDepositAmountThb(Number(manualDepositSubmitResult.amount))}
                        </p>
                      ) : null}
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-3">
                        ยอดวอลเล็ตจะอัปเดตหลังทีมอนุมัติ — ไม่เครดิตทันที
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await refreshWalletHistory();
                        setActiveModal(null);
                        setWalletDepositM1Step(null);
                        setWalletM1Method(null);
                        setManualDepositSubmitResult(null);
                        setAmount("");
                        setManualStaticSlipFile(null);
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold"
                    >
                      ปิด
                    </button>
                  </>
                )}
                {walletDepositM1Step === "payso_qr" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletDepositM1Step("enter_amount");
                        setDepositQrUrl(null);
                        setDepositPaymentId(null);
                        clearPaysoAutoCloseCountdown();
                        paysoSuccessHandledRef.current = false;
                        walletDepositChargeSourceRef.current = null;
                        setDepositChargeSourceType(null);
                        setProcessing(false);
                        setDepositSuccessPendingSlip(false);
                        depositSlipUploadedRef.current = false;
                      }}
                      className="w-full mb-3 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl font-medium text-left px-3"
                    >
                      ← กลับไปแก้ยอด / สร้าง QR ใหม่
                    </button>
                    <div className="text-center mb-4">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Scan className="text-emerald-600" size={24} />
                        <h3 className="text-xl font-bold text-slate-800">PromptPay QR (PaySo)</h3>
                      </div>
                      <p className="text-xs text-slate-600 px-1 mb-3">
                        QR นี้ออกโดย Pay Solutions (PaySo) — สแกนจ่ายผ่านแอปธนาคาร
                      </p>
                      <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-3 mb-3">
                        <p className="text-sm text-emerald-700 mb-1">ยอดที่ต้องชำระ</p>
                        <p className="text-3xl font-bold text-emerald-900">
                          ฿{Number(amount || 0).toLocaleString()}
                        </p>
                        {(() => {
                          const rows = buildWalletDepositPreviewRows(walletDepositPreview);
                          if (!rows?.length) {
                            return (
                              <p className="text-xs text-emerald-600 mt-1">
                                กด &quot;ดูค่าธรรมเนียม&quot; ในขั้นตอนก่อนหน้าเพื่อดูยอดหักล่วงหน้า
                              </p>
                            );
                          }
                          return (
                            <div className="text-xs text-emerald-800 mt-2 space-y-0.5 text-left">
                              {rows.map((r) => (
                                <p key={r.key}>
                                  {r.labelTh}: ฿{r.valueDisplay}
                                </p>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {depositQrUrl && (
                      <div className="flex justify-center mb-4 p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border-2 border-slate-200 shadow-lg">
                        <img
                          src={depositQrUrl}
                          alt="PromptPay QR Code"
                          className="w-56 h-56 object-contain"
                          id="promptpay-qr-image"
                        />
                      </div>
                    )}
                    {processing && (
                      <div className="flex items-center justify-center gap-2 mb-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Loader2 size={18} className="animate-spin text-blue-600" />
                        <span className="text-sm font-medium text-blue-700">
                          กำลังรอการชำระเงิน...
                        </span>
                      </div>
                    )}
                    {paysoAutoCloseCountdown !== null && (
                      <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center">
                        <p className="text-sm font-bold text-emerald-900">เติมเงินสำเร็จแล้ว</p>
                        <p className="text-xs text-emerald-800 mt-1">
                          ระบบจะอัปเดตเครดิตและปิดหน้าต่างอัตโนมัติใน {paysoAutoCloseCountdown} วินาที
                        </p>
                      </div>
                    )}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="font-bold text-emerald-600">1.</span>
                        <span>บันทึกหรือแคปหน้าจอ QR Code</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="font-bold text-emerald-600">2.</span>
                        <span>เปิดแอปธนาคารหรือ Mobile Banking</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="font-bold text-emerald-600">3.</span>
                        <span>สแกน QR Code เพื่อชำระเงิน</span>
                      </div>
                    </div>
                    <div className="border-2 border-dashed border-emerald-300 rounded-xl p-3 mb-3 bg-emerald-50/60">
                      <p className="text-sm font-bold text-emerald-900 mb-1">ไม่ต้องแนบสลิปสำหรับ PaySo</p>
                      <p className="text-xs text-emerald-800/90 leading-relaxed">
                        ระบบจะยืนยันผลจาก payment gateway/webhook อัตโนมัติ เมื่อยืนยันสำเร็จยอดจะเข้าวอลเล็ตทันที
                      </p>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          const amt = Number(amount).toFixed(2);
                          navigator.clipboard?.writeText(amt);
                          notify("คัดลอกยอดเงินแล้ว", "success");
                        }}
                        className="flex-1 py-2.5 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 border border-blue-200"
                      >
                        <span className="flex items-center justify-center gap-1">Copy Amount</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!depositQrUrl) return;
                          const link = document.createElement("a");
                          link.href = depositQrUrl;
                          link.download = `promptpay-qr-${Date.now()}.png`;
                          link.click();
                          notify("บันทึก QR Code แล้ว", "success");
                        }}
                        className="flex-1 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-100 border border-emerald-200"
                      >
                        <span className="flex items-center justify-center gap-1">Save QR</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        setWalletDepositM1Step(null);
                        setWalletM1Method(null);
                        setManualDepositSubmitResult(null);
                        setDepositStep("amount");
                        setDepositQrUrl(null);
                        setDepositPaymentId(null);
                        walletDepositChargeSourceRef.current = null;
                        setDepositChargeSourceType(null);
                        setDepositMethod(null);
                        setDepositSuccessPendingSlip(false);
                        depositSlipUploadedRef.current = false;
                        setManualStaticSlipFile(null);
                        setDepositOtherChannelsOpen(false);
                        setAmount("");
                        setWalletDepositPreview(null);
                        setWalletDepositPreviewError(null);
                      }}
                      className="w-full py-2.5 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                    <div className="mt-3 text-center text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => setShowRefundPolicy(true)}
                        className="text-emerald-600 hover:underline"
                      >
                        นโยบายการคืนเงิน
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : activeModal === "withdraw" ? (
              <>
                <h3 className="text-lg font-bold mb-4">
                  ถอนเงิน
                </h3>
                {bankAccounts.length > 0 && (
                  <input
                    type="number"
                    placeholder="จำนวนที่รับได้ (บาท)"
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
                      {user?.role === UserRole.PROVIDER ? (
                        /* Partner: Batch (35) vs Instant (50) ตามกติกาชัย */
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setWithdrawSpeed("batch")}
                            className={`py-3 px-3 rounded-xl border-2 text-center text-sm font-medium transition ${
                              withdrawSpeed === "batch"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 hover:border-gray-300 text-gray-600"
                            }`}
                          >
                            <span className="block font-medium">📅 รอบปกติ (Batch)</span>
                            <span className="block text-xs opacity-80 mt-0.5">
                              ค่าธรรมเนียม 35.- (เงินเข้าภายใน 24 ชม.)
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setWithdrawSpeed("instant")}
                            className={`py-3 px-3 rounded-xl border-2 text-center text-sm font-medium transition ${
                              withdrawSpeed === "instant"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 hover:border-gray-300 text-gray-600"
                            }`}
                          >
                            <span className="block font-medium">⚡ โอนด่วน (Instant)</span>
                            <span className="block text-xs opacity-80 mt-0.5">
                              ค่าธรรมเนียม 50.- (เงินเข้าทันที)
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {(
                            [
                              { channel: "promptpay" as PaymentChannel, label: "PromptPay QR", feeText: "25 บาท" },
                              { channel: "bank_transfer" as PaymentChannel, label: "โอนธนาคาร", feeText: "25 บาท" },
                              { channel: "truemoney" as PaymentChannel, label: "TrueMoney", feeText: "3.6%" },
                            ] as const
                          ).map(({ channel, label, feeText }) => (
                            <button
                              key={channel}
                              type="button"
                              onClick={() => setWithdrawChannel(channel)}
                              className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition ${
                                withdrawChannel === channel ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 hover:border-gray-300 text-gray-600"
                              }`}
                            >
                              <span className="block font-medium">{label}</span>
                              <span className="block text-xs opacity-80 mt-0.5">ค่าธรรมเนียม {feeText}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mb-2">
                        {(user?.role === UserRole.PROVIDER || withdrawChannel === "bank_transfer") && (
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
                        {user?.role !== UserRole.PROVIDER && withdrawChannel === "promptpay" && (
                          <>ถอนผ่าน PromptPay (ค่าธรรมเนียม 25 บาท/รายการ)</>
                        )}
                        {user?.role !== UserRole.PROVIDER && withdrawChannel === "truemoney" && (
                          <>ถอนเข้า TrueMoney Wallet (ค่าธรรมเนียม 3.6%)</>
                        )}
                      </p>
                      <p className="text-xs text-gray-600 mb-2">
                        {user?.role === UserRole.PROVIDER
                          ? `ขั้นต่ำถอน ${MIN_WITHDRAWAL_THB} บาท · ถอนได้สูงสุด ${Math.max(0, (profile?.wallet_balance ?? 0) - (withdrawSpeed === "instant" ? 50 : 35)).toLocaleString()} บาท (หักค่าธรรมเนียม ${withdrawSpeed === "instant" ? 50 : 35} บาทแล้ว)`
                          : `ขั้นต่ำถอน ${MIN_WITHDRAWAL_THB} บาท · ถอนได้สูงสุด ${getMaxNetWithdrawable(profile?.wallet_balance ?? 0, withdrawChannel).toLocaleString()} บาท (หักค่าธรรมเนียมตามช่องทางแล้ว)`}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {([25, 50, 75] as const).map((pct) => {
                          const maxNet = user?.role === UserRole.PROVIDER
                            ? Math.max(0, (profile?.wallet_balance ?? 0) - (withdrawSpeed === "instant" ? 50 : 35))
                            : getMaxNetWithdrawable(profile?.wallet_balance ?? 0, withdrawChannel);
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
                                user?.role === UserRole.PROVIDER
                                  ? Math.max(0, (profile?.wallet_balance ?? 0) - (withdrawSpeed === "instant" ? 50 : 35))
                                  : getMaxNetWithdrawable(profile?.wallet_balance ?? 0, withdrawChannel),
                              ),
                            )
                          }
                          disabled={
                            (user?.role === UserRole.PROVIDER
                              ? Math.max(0, (profile?.wallet_balance ?? 0) - (withdrawSpeed === "instant" ? 50 : 35))
                              : getMaxNetWithdrawable(profile?.wallet_balance ?? 0, withdrawChannel)
                            ) <= 0 || processing
                          }
                          className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-bold disabled:opacity-50"
                        >
                          ถอนเต็ม (Max)
                        </button>
                      </div>
                    </>
                  ))}
                {activeModal === "withdraw" && bankAccounts.length > 0 && (
                  <p className="text-xs text-orange-600 mb-4 bg-orange-50 p-2 rounded">
                    {user?.role === UserRole.PROVIDER
                      ? `ค่าธรรมเนียม: ${withdrawSpeed === "instant" ? 50 : 35} บาท (${withdrawSpeed === "instant" ? "โอนด่วน" : "รอบปกติ"})`
                      : `ค่าธรรมเนียมถอนเงินตามช่องทาง: ${withdrawChannel === "truemoney" ? "3.6%" : "25 บาท/รายการ"}`}{" "}
                    (หักอัตโนมัติ).
                    {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
                      <>
                        {" "}
                        คุณจะได้รับ{" "}
                        <strong>{Number(amount).toLocaleString()} บาท</strong>
                        {user?.role === UserRole.PROVIDER
                          ? ` (หักจากกระเป๋า ${(Number(amount) + (withdrawSpeed === "instant" ? 50 : 35)).toLocaleString()} บาท)`
                          : ` (หักจากกระเป๋า ${(Number(amount) + getWithdrawalFeeForNet(withdrawChannel, Number(amount))).toLocaleString()} บาท)`}
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
                      setDepositPaymentId(null);
                      setDepositMethod(null);
                      setBankTransferRef(null);
                      setDepositSuccessPendingSlip(false);
                      depositSlipUploadedRef.current = false;
                      walletDepositChargeSourceRef.current = null;
                      setDepositChargeSourceType(null);
                      setSlipFile(null);
                      setManualStaticSlipFile(null);
                      setDepositOtherChannelsOpen(false);
                      setWalletDepositM1Step(null);
                      setWalletM1Method(null);
                      setManualDepositSubmitResult(null);
                      setWalletDepositPreview(null);
                      setWalletDepositPreviewError(null);
                      setAmount("");
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
                          (user?.role === UserRole.PROVIDER
                            ? Math.max(0, (profile?.wallet_balance ?? 0) - (withdrawSpeed === "instant" ? 50 : 35))
                            : getMaxNetWithdrawable(profile?.wallet_balance ?? 0, withdrawChannel))
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
            ) : null}
          </div>
        </div>,
        document.body
      )}
      
      {/* Receipt Modal - Portal */}
      {receiptModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95">
            {/* Company Header */}
            <div className="text-center border-b-2 border-slate-200 pb-6 mb-6">
              <h2 className="text-2xl font-bold text-slate-800 mb-1">
                {receiptModal.company.name}
              </h2>
              <p className="text-xs text-slate-500">{receiptModal.company.address}</p>
              <p className="text-xs text-slate-500">โทร: {receiptModal.company.phone}</p>
              <p className="text-xs text-slate-500">Tax ID: {receiptModal.company.tax_id}</p>
            </div>
            
            {/* Receipt Title */}
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 mb-2">ใบเสร็จรับเงิน / Receipt</h3>
              <p className="text-xs text-slate-600">เลขที่: {receiptModal.receipt_no}</p>
              <p className="text-xs text-slate-500">
                วันที่: {new Date(receiptModal.date).toLocaleDateString("th-TH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            </div>
            
            {/* Customer Info */}
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <p className="text-xs font-bold text-slate-600 mb-2">ลูกค้า / Customer</p>
              <p className="text-sm font-medium text-slate-800">{receiptModal.customer.name}</p>
              <p className="text-xs text-slate-600">{receiptModal.customer.email}</p>
            </div>
            
            {/* Transaction Details */}
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                <span className="text-sm text-slate-600">รายการ</span>
                <span className="text-sm font-medium text-slate-800">{receiptModal.description}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                <span className="text-sm text-slate-600">ช่องทางชำระ</span>
                <span className="text-sm font-medium text-slate-800 uppercase">{receiptModal.payment_method}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                <span className="text-sm text-slate-600">เลขอ้างอิง / Tax Ref</span>
                <span className="text-xs font-mono text-slate-700">{receiptModal.tax_ref_id || receiptModal.transaction_no}</span>
              </div>
              {/* Earnings Breakdown (Talent/Provider — Match Job) */}
              {(receiptModal as any).gross_earnings != null && (receiptModal as any).gross_earnings > 0 && (
                <div className="mt-4 p-4 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-2">
                  <p className="text-xs font-bold text-slate-600 mb-2">{t("detail.income_breakdown")}</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t("detail.wallet_gross_wage")}</span>
                    <span className="font-medium text-slate-800 tabular-nums">฿{Number((receiptModal as any).gross_earnings).toLocaleString()}</span>
                  </div>
                  {(receiptModal as any).handling_fee != null && (receiptModal as any).handling_fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t("detail.wallet_handling_fee")}</span>
                      <span className="font-medium text-amber-700 tabular-nums">-฿{Number((receiptModal as any).handling_fee).toLocaleString()}</span>
                    </div>
                  )}
                  {(receiptModal as any).commission_fee != null && (receiptModal as any).commission_fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t("detail.wallet_platform_commission")} ({(receiptModal as any).commission_percent ?? 24}%)</span>
                      <span className="font-medium text-amber-700 tabular-nums">-฿{Number((receiptModal as any).commission_fee).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-emerald-200">
                    <span className="text-emerald-800">{t("detail.wallet_net_credited")}</span>
                    <span className="text-emerald-900 tabular-nums">฿{receiptModal.amount.toLocaleString()}</span>
                  </div>
                </div>
              )}
              {/* รายละเอียดค่าใช้จ่าย-ผลตอบแทนบริษัท-รายได้ผู้รับงาน (ชัดเจนตรงไปตรงมา) */}
              {!((receiptModal as any).gross_earnings != null && (receiptModal as any).gross_earnings > 0) && (receiptModal.employer_expense != null || receiptModal.provider_income != null || receiptModal.company_fee != null || receiptModal.insurance_amount != null) && (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-slate-600 mb-2">รายละเอียดตามบิล</p>
                  {receiptModal.employer_expense != null && receiptModal.employer_expense > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">ค่าใช้จ่ายผู้จ้าง</span>
                      <span className="font-medium text-slate-800">฿{Number(receiptModal.employer_expense).toLocaleString()}</span>
                    </div>
                  )}
                  {receiptModal.insurance_amount != null && receiptModal.insurance_amount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">ค่าประกันงาน</span>
                      <span className="font-medium text-emerald-700">฿{Number(receiptModal.insurance_amount).toLocaleString()}</span>
                    </div>
                  )}
                  {receiptModal.provider_income != null && receiptModal.provider_income > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">รายได้ผู้รับงาน</span>
                      <span className="font-medium text-slate-800">฿{Number(receiptModal.provider_income).toLocaleString()}</span>
                    </div>
                  )}
                  {receiptModal.company_fee != null && receiptModal.company_fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">ผลตอบแทนบริษัท (ค่าธรรมเนียม)</span>
                      <span className="font-medium text-slate-800">฿{Number(receiptModal.company_fee).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Total Amount */}
            <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-emerald-800">ยอดเงิน / Amount</span>
                <span className="text-2xl font-bold text-emerald-900">
                  ฿{receiptModal.amount.toLocaleString()} {receiptModal.currency}
                </span>
              </div>
            </div>
            
            {/* Footer */}
            <div className="text-center mb-4">
              <p className="text-xs text-slate-400">
                ใบเสร็จนี้สร้างโดยระบบอัตโนมัติ · ไม่ต้องลงนาม
              </p>
              <p className="text-xs text-slate-400 mt-1">
                This is a computer-generated receipt
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
              >
                🖨️ พิมพ์
              </button>
              <button
                onClick={() => setReceiptModal(null)}
                className="flex-1 py-2.5 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Refund Policy Modal - Portal เพื่อให้แสดงเหนือทุก element */}
      {showRefundPolicy && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <FileText size={20} className="text-emerald-600" />
                  {`Refund Policy v${refundPolicyVersion || "2.1"}`}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  อัปเดต: {refundPolicyUpdated || "25/2/2569"}
                </p>
              </div>
              <button onClick={() => setShowRefundPolicy(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              <div 
                className="prose prose-slate max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: refundPolicyContent || '<p className="text-slate-500 text-center">กำลังปรับปรุงนโยบาย</p>' }}
              />
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowRefundPolicy(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
