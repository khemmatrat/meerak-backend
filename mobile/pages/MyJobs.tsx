import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import { Job, JobStatus } from "../types";
import { useLanguage } from "../context/LanguageContext";
import {
  Briefcase,
  Calendar,
  MapPin,
  DollarSign,
  ChevronRight,
  UserCheck,
  Sparkles,
  Archive,
  AlertTriangle,
  Star,
} from "lucide-react";
import { Unsubscribe } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { EmergencyReportModal } from "../components/EmergencyReportModal";
import { formatJobReferenceCode } from "../utils/jobDisplayCode";
import { getJobLocationDisplayLines } from "../utils/jobLocationDisplay";
import ReviewService from "../services/reviewService";

/** ป้ายสถานะงานในแท็บ «งานที่ฉันรับทำ» — สไตล์คล้ายแอปเดลิเวอรี่ */
function workingJobStatusPill(
  job: Job,
  t: (key: string) => string
): { label: string; pillClass: string } {
  const raw = job.status as string;
  if (raw === JobStatus.ACCEPTED) {
    return {
      label: t("myjobs.working_status_accepted"),
      pillClass:
        "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70 shadow-sm",
    };
  }
  if (raw === JobStatus.IN_PROGRESS) {
    return {
      label: t("myjobs.working_status_in_progress"),
      pillClass: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/70 shadow-sm",
    };
  }
  if (raw === JobStatus.WAITING_FOR_APPROVAL) {
    return {
      label: t("myjobs.working_status_waiting_approval"),
      pillClass:
        "bg-amber-50 text-amber-900 ring-1 ring-amber-200/70 shadow-sm",
    };
  }
  if (raw === JobStatus.WAITING_FOR_PAYMENT) {
    return {
      label: t("myjobs.working_status_waiting_payment"),
      pillClass:
        "bg-violet-50 text-violet-800 ring-1 ring-violet-200/70 shadow-sm",
    };
  }
  if (raw === JobStatus.DISPUTE) {
    return {
      label: t("myjobs.working_status_dispute"),
      pillClass: "bg-red-50 text-red-800 ring-1 ring-red-200/70 shadow-sm",
    };
  }
  if (raw === "emergency_pending") {
    return {
      label: t("myjobs.working_status_emergency"),
      pillClass:
        "bg-orange-50 text-orange-900 ring-1 ring-orange-200/70 shadow-sm",
    };
  }
  const fallback = String(raw ?? "")
    .replace(/_/g, " ")
    .trim();
  return {
    label: fallback || "—",
    pillClass: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 shadow-sm",
  };
}

function employerNameInitial(name: string | undefined): string {
  const s = (name || "").trim();
  if (!s) return "?";
  return s.charAt(0).toUpperCase();
}

export type MyJobsProps = {
  /** ฝังใน Provider Dashboard — สไตล์และแท็บเริ่มต้นให้สอดคล้องกับโหมดรับงาน */
  embedded?: boolean;
  initialTab?: "posted" | "hire" | "working" | "recommended" | "history";
};

export const MyJobs: React.FC<MyJobsProps> = ({
  embedded = false,
  initialTab,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "posted" | "hire" | "working" | "recommended" | "history"
  >(() => initialTab ?? (embedded ? "working" : "posted"));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [recCount, setRecCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const backendJobsRef = useRef<Job[]>([]);
  const [showExpired, setShowExpired] = useState(false);
  /** กรองตามหมวดในแท็บประวัติ (สไตล์ Lineman) */
  const [historyCategory, setHistoryCategory] = useState<string>("all");
  /** job_id ที่ API ยืนยันแล้วว่าผู้จ้างรีวิวแล้ว — null = ยังไม่โหลดหรือโหลดไม่สำเร็จ (ใช้ fallback จากลิสต์) */
  const [employerReviewedJobIds, setEmployerReviewedJobIds] = useState<
    Set<string> | null
  >(null);
  // Emergency Report modal state
  const [emergencyJob, setEmergencyJob] = useState<{ id: string; title: string } | null>(null);
  const { t } = useLanguage();
  const { user } = useAuth();
  const { notify } = useNotification();
  const { config: mobileAppConfig } = useMobileAppConfig();
  const canPostJob = mobileAppConfig.featureFlags.enableJobPosting;
  const location = useLocation();
  const justCreatedJobRef = useRef<Job | null>(null);
  // รับงานที่สร้างใหม่จาก location.state หรือ sessionStorage (หลัง CreateJob) — อ่านก่อน fetch
  if (!justCreatedJobRef.current) {
    const fromState = (location.state as any)?.justCreatedJob;
    if (fromState) justCreatedJobRef.current = fromState;
    else {
      try {
        const raw = sessionStorage.getItem("meerak_justCreatedJob");
        if (raw) {
          const parsed = JSON.parse(raw) as Job;
          if (parsed?.id) {
            justCreatedJobRef.current = parsed;
            sessionStorage.removeItem("meerak_justCreatedJob");
          }
        }
      } catch (_) {}
    }
  }

  // Pre-fetch recommended count for badge inside tab
  useEffect(() => {
    MockApi.getRecommendedJobs().then((res) => setRecCount(res.length));
  }, []);

  // โหลดข้อมูลใหม่เมื่อกลับมาแท็บหรือกลับมาหน้า My Jobs (หลังโพสต์งาน)
  useEffect(() => {
    const onVisible = () => {
      if (location.pathname === "/my-jobs" && user?.id) setRefreshTrigger((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [location.pathname, user?.id]);

  /** งาน completed ที่ user เป็นนายจ้าง — ใช้เป็น key เรียก batch รีวิว */
  const historyEmployerCompletedIdsKey = useMemo(() => {
    if (activeTab !== "history" || !user?.id) return "";
    const uid = String(user.id);
    const norm = (s: string) => (s || "").toLowerCase().trim();
    const ids = jobs
      .filter((j) => {
        if (norm(String(j.status)) !== "completed") return false;
        if (!j.accepted_by) return false;
        return !!(j.created_by && String(j.created_by) === uid);
      })
      .map((j) => String(j.id))
      .filter(Boolean)
      .sort();
    return ids.join(",");
  }, [activeTab, jobs, user?.id]);

  useEffect(() => {
    if (activeTab !== "history" || !user?.id) {
      setEmployerReviewedJobIds(null);
      return;
    }
    const ids = historyEmployerCompletedIdsKey
      ? historyEmployerCompletedIdsKey.split(",").filter(Boolean)
      : [];
    if (!ids.length) {
      setEmployerReviewedJobIds(new Set());
      return;
    }
    let cancelled = false;
    ReviewService.fetchEmployerReviewedJobIds(ids).then((list) => {
      if (cancelled) return;
      if (list === null) setEmployerReviewedJobIds(null);
      else setEmployerReviewedJobIds(new Set(list));
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    user?.id,
    historyEmployerCompletedIdsKey,
    refreshTrigger,
    location.key,
  ]);

 useEffect(() => {
  let unsubscribe: Unsubscribe | undefined;

  const fetchJobs = () => {
    if (!user?.id) {
      console.log('❌ No user ID found');
      return;
    }

    setLoading(true);
    console.log(`📋 Fetching jobs for tab: ${activeTab}, user: ${user.id}`);

    try {
      if (activeTab === "recommended") {
        // Real-time subscription - Recommended jobs
        unsubscribe = MockApi.subscribeToRecommendedJobs((data) => {
          console.log(`📬 Recommended jobs raw: ${data.length} jobs`);
          
          // ✅ กรองงานที่ตัวเองสร้างออก และงานที่ตัวเองรับแล้ว
          const filtered = data.filter((j) => 
            j.created_by !== user.id && 
            (!j.accepted_by || j.accepted_by !== user.id)
          );
          console.log(`✅ After filtering (not created/accepted by me): ${filtered.length} jobs`);
          
          setJobs(filtered);
          setRecCount(filtered.length);
          setLoading(false);
        });
      } else {
        const userId = user.id;
        const norm = (s: string) => (s || "").toLowerCase().trim();
        const normStatus = (s: any) => norm(String(s || "")).replace(/\s+/g, "_");
        const applyFilter = (allMyJobs: Job[]) => {
          let filtered: Job[] = [];
          
          // ✅ ฟังก์ชันเช็คงานหมดอายุ — โพสต์ใหม่ 36 ชม. ไม่ expired, โพสต์เกิน 2 วัน = expired
          const isExpired = (job: Job) => {
            const created = job.created_at ? new Date(job.created_at).getTime() : 0;
            const thirtySixHoursAgo = Date.now() - 36 * 60 * 60 * 1000;
            const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
            if (created > thirtySixHoursAgo) return false; // งานใหม่ 36 ชม. — ไม่ expired
            if (created <= twoDaysAgo) return true; // โพสต์เกิน 2 วัน — expired
            if (!job.datetime) return false; // ระหว่าง 36ชม.-2วัน ใช้ datetime
            try {
              return new Date(job.datetime) < new Date();
            } catch {
              return false;
            }
          };
          
          if (activeTab === "posted") {
            const activeStatuses = ["open", "accepted", "in_progress", "waiting_for_approval", "waiting_for_payment", "dispute"];
            const uidStr = String(userId ?? "").trim();
            const uidNorm = norm(uidStr);
            filtered = allMyJobs.filter(
              (j) => {
                const createdBy = String(j.created_by ?? "").trim();
                const clientId = String((j as any).client_id ?? (j as any).clientId ?? "").trim();
                const statusNorm = normStatus(j.status);
                const isOpenNoProvider = statusNorm === "open" && !j.accepted_by;
                const isMine = createdBy === uidStr || norm(createdBy) === uidNorm ||
                  (clientId && (clientId === uidStr || norm(clientId) === uidNorm)) || isOpenNoProvider;
                const isActive = activeStatuses.some((s) => statusNorm === s);
                
                // ✅ กรองงานเน่า: expired status หรือหมดอายุแล้ว (โพสต์เกิน 2 วัน หรือ datetime ผ่าน)
                const isGoodJob = statusNorm !== 'expired' && statusNorm !== 'deleted' && !isExpired(j);
                
                return isMine && isActive && (showExpired || isGoodJob);
              }
            );
          } else if (activeTab === "hire") {
            // ✅ Hire Jobs — งานที่จ้าง Talent ไป (มีผู้รับงานแล้ว) ทั้งกำลังดำเนินการและเสร็จแล้ว
            const uidStr = String(userId ?? "");
            filtered = allMyJobs.filter(
              (j) => {
                const createdBy = String(j.created_by ?? "");
                const isMine = createdBy === uidStr || norm(createdBy) === norm(uidStr);
                const hasProvider = !!j.accepted_by;
                const statusNorm = normStatus(j.status);
                const isGoodJob = statusNorm !== 'expired' && statusNorm !== 'deleted' && !isExpired(j);
                return isMine && hasProvider && (showExpired || isGoodJob);
              }
            );
          } else if (activeTab === "working") {
            const workStatuses = ["accepted", "in_progress", "waiting_for_approval", "waiting_for_payment", "dispute"];
            filtered = allMyJobs.filter(
              (j) => {
                const statusNorm = normStatus(j.status);
                const isMyWork = (j.accepted_by === userId || norm(j.accepted_by ?? "") === norm(userId ?? ""));
                const isWorkingStatus = workStatuses.includes(statusNorm);
                
                // ✅ กรองงานเน่า
                const isGoodJob = statusNorm !== 'expired' && statusNorm !== 'deleted' && !isExpired(j);
                
                return isMyWork && isWorkingStatus && (showExpired || isGoodJob);
              }
            );
          } else if (activeTab === "history") {
            const doneStatuses = ["completed", "cancelled", "expired"]; // ✅ เพิ่ม expired ในประวัติ
            filtered = allMyJobs.filter((j) => {
              const uid = userId ?? "";
              const isMyJob = j.created_by === userId || j.accepted_by === userId || norm(j.created_by ?? "") === norm(uid) || norm(j.accepted_by ?? "") === norm(uid);
              return isMyJob && doneStatuses.includes(normStatus(j.status));
            });
          }
          return filtered.sort(
            (a, b) => new Date(b.datetime || b.created_at || 0).getTime() - new Date(a.datetime || a.created_at || 0).getTime()
          );
        };

        const mergeAndSet = (backendList: Job[], firestoreList: Job[]) => {
          const byId = new Map<string, Job>();
          const justCreated = justCreatedJobRef.current;
          if (justCreated?.id) byId.set(String(justCreated.id), justCreated);
          // Firestore ก่อน แล้ว Backend ทับ — ให้ Backend ชนะ (งานที่โพสต์ใหม่อยู่ที่ Backend)
          (firestoreList || []).forEach((j) => byId.set(String(j.id), j));
          (backendList || []).forEach((j) => byId.set(String(j.id), j));
          backendJobsRef.current = Array.from(byId.values());
          const filtered = applyFilter(backendJobsRef.current);
          if (activeTab === "posted") {
            const openFromBackend = (backendList || []).filter((j) => normStatus(j.status) === "open");
            console.log(
              `📦 MyJobs(posted) counts: backend=${backendList?.length ?? 0}, backendOpen=${openFromBackend.length}, merged=${backendJobsRef.current.length}, filtered=${filtered.length}`
            );
            if ((backendList?.length ?? 0) > 0) {
              const sample = (backendList || []).slice(0, 3).map((j) => ({
                id: j.id,
                created_by: j.created_by,
                accepted_by: j.accepted_by,
                status: j.status,
              }));
              console.log("📦 MyJobs(posted) backend sample:", sample);
            }
          }
          setJobs(filtered);
        };

        const includeHistory = activeTab === "history";
        MockApi.getYourJobs(userId, { includeExpired: includeHistory }).then((backendJobs) => {
          mergeAndSet(backendJobs || [], []);
          setLoading(false);
          if ((backendJobs || []).length > 0) {
            console.log(`📦 Hired/My jobs: ${(backendJobs || []).length} from backend for tab "${activeTab}"`);
          }
        }).catch(() => setLoading(false));

        unsubscribe = MockApi.subscribeToMyJobs(userId, async (firestoreJobs) => {
          const backend = await MockApi.getYourJobs(userId, { includeExpired: includeHistory }).catch(() => []);
          mergeAndSet(backend || [], firestoreJobs || []);
          setLoading(false);
        });
      }
    } catch (err) {
      console.error('❌ Error fetching jobs:', err);
      setLoading(false);
    }
  };

  fetchJobs();
  return () => {
    if (unsubscribe) unsubscribe();
  };
}, [activeTab, user?.id, refreshTrigger, showExpired]); // ✅ เพิ่ม showExpired

  useEffect(() => {
    if (activeTab !== "history") setHistoryCategory("all");
  }, [activeTab]);

  const historyCategories = useMemo(() => {
    if (activeTab !== "history") return [];
    const s = new Set<string>();
    jobs.forEach((j) => {
      if (j.category) s.add(j.category);
    });
    return Array.from(s).sort();
  }, [jobs, activeTab]);

  const listJobs = useMemo(() => {
    if (activeTab !== "history" || historyCategory === "all") return jobs;
    return jobs.filter((j) => j.category === historyCategory);
  }, [jobs, activeTab, historyCategory]);

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case JobStatus.OPEN:
        return "bg-blue-50 text-blue-700 border-blue-100";
      case JobStatus.ACCEPTED:
        return "bg-purple-50 text-purple-700 border-purple-100";
      case JobStatus.IN_PROGRESS:
        return "bg-amber-50 text-amber-700 border-amber-100";
      case JobStatus.WAITING_FOR_PAYMENT:
        return "bg-orange-50 text-orange-700 border-orange-100";
      case JobStatus.COMPLETED:
        return "bg-green-50 text-green-700 border-green-100";
      case JobStatus.CANCELLED:
        return "bg-gray-50 text-gray-500 border-gray-100 line-through";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getDescription = () => {
    if (activeTab === "posted") return t("myjobs.posted_desc");
    if (activeTab === "hire") return t("myjobs.hire_desc");
    if (activeTab === "working") return t("myjobs.working_desc");
    if (activeTab === "history") return t("myjobs.history_desc");
    return t("myjobs.recommended_desc");
  };

  const getNoJobsMessage = () => {
    if (activeTab === "posted") return t("myjobs.no_posted");
    if (activeTab === "hire") return t("myjobs.no_hire");
    if (activeTab === "working") return t("myjobs.no_working");
    if (activeTab === "history") return t("myjobs.no_history");
    return t("myjobs.no_recommended");
  };

  return (
    <div className={embedded ? "space-y-5" : "space-y-6"}>
      {!embedded && (
        <h1 className="text-2xl font-bold text-gray-900">{t("myjobs.title")}</h1>
      )}
      {embedded && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            {t("myjobs.working")}
          </p>
          <p className="text-sm text-white/95 mt-0.5 leading-snug">
            {t("myjobs.working_desc")}
          </p>
        </div>
      )}

      {/* Tabs - พื้นขาว แท็บไม่เลือก = สีขาว ขอบเทา */}
      <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab("posted")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
            activeTab === "posted"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          {t("myjobs.posted")}
        </button>
        <button
          onClick={() => setActiveTab("hire")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex items-center justify-center ${
            activeTab === "hire"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <UserCheck size={14} className="mr-1.5 hidden sm:inline" />
          {t("myjobs.hired")}
        </button>
        <button
          onClick={() => setActiveTab("working")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
            activeTab === "working"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          {t("myjobs.working")}
        </button>
        <button
          onClick={() => setActiveTab("recommended")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center whitespace-nowrap relative ${
            activeTab === "recommended"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <Sparkles size={14} className="mr-1.5 hidden sm:inline" />
          {t("myjobs.recommended")}
          {recCount > 0 && (
            <span
              className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === "recommended"
                  ? "bg-emerald-200 text-emerald-800"
                  : "bg-red-500 text-white"
              }`}
            >
              {recCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center whitespace-nowrap ${
            activeTab === "history"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <Archive size={14} className="mr-1.5 hidden sm:inline" />
          {t("myjobs.history")}
        </button>
      </div>

      {/* ชิปหมวดหมู่ — เฉพาะแท็บประวัติ */}
      {activeTab === "history" && historyCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHistoryCategory("all")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              historyCategory === "all"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t("myjobs.filter_all")}
          </button>
          {historyCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setHistoryCategory(cat)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors max-w-[10rem] truncate ${
                historyCategory === cat
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
              title={t(`cat.${cat}`) || cat}
            >
              {t(`cat.${cat}`) || cat}
            </button>
          ))}
        </div>
      )}

      {/* Description + Toggle Expired Jobs */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-start justify-between gap-4">
        <div className="flex items-start flex-1">
          <Briefcase className="text-emerald-600 mt-0.5 mr-3" size={20} />
          <div>
            <p className="text-sm text-emerald-900 font-medium">
              {getDescription()}
            </p>
          </div>
        </div>
        
        {/* ✅ ปุ่ม Toggle แสดงงานหมดอายุ */}
        {(activeTab === "posted" || activeTab === "hire" || activeTab === "working") && (
          <button
            onClick={() => setShowExpired(!showExpired)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              showExpired
                ? "bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
            }`}
            title={showExpired ? "ซ่อนงานหมดอายุ" : "แสดงงานหมดอายุ (สำหรับดูประวัติ)"}
          >
            <Archive size={14} />
            {showExpired ? "ซ่อนงานเก่า" : "แสดงงานเก่า"}
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-100 rounded-xl animate-pulse"
            ></div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {listJobs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="text-gray-300" size={32} />
              </div>
              <p className="text-gray-500">
                {activeTab === "history" &&
                historyCategory !== "all" &&
                jobs.length > 0
                  ? t("myjobs.no_match_category")
                  : getNoJobsMessage()}
              </p>
            </div>
          ) : (
            listJobs.map((job) => {
              // ✅ เช็คงานหมดอายุ — โพสต์ใหม่ 36 ชม. ไม่ expired, โพสต์เกิน 2 วัน = expired
              const isJobExpired = (() => {
                const created = job.created_at ? new Date(job.created_at).getTime() : 0;
                const thirtySixHoursAgo = Date.now() - 36 * 60 * 60 * 1000;
                const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
                if (created > thirtySixHoursAgo) return false; // งานใหม่ 36 ชม. — ไม่ expired
                if (created <= twoDaysAgo) return true; // โพสต์เกิน 2 วัน — expired
                if (!job.datetime) return false;
                try {
                  return new Date(job.datetime) < new Date();
                } catch {
                  return false;
                }
              })();
              const isExpiredStatus = (job.status || '').toLowerCase() === 'expired';
              const isExpiredJob = isJobExpired || isExpiredStatus;
              const locLines = getJobLocationDisplayLines(job);

              return (
                <Link
                to={`/jobs/${String(job.id ?? "")}`}
                key={String(job.id ?? "")}
                className={`block bg-white border rounded-xl p-4 hover:shadow-md transition-shadow group relative overflow-hidden ${
                  isExpiredJob 
                    ? "opacity-60 border-gray-300 bg-gray-50" 
                    : "border-gray-100"
                }`}
              >
                {/* ✅ แสดง Badge "Expired" สำหรับงานหมดอายุ */}
                {isExpiredJob && (
                  <div className="absolute top-0 right-0 bg-gray-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold uppercase tracking-wider flex items-center">
                    <Archive size={10} className="mr-1" /> Expired
                  </div>
                )}
                
                {activeTab === "recommended" && !isExpiredJob && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold uppercase tracking-wider flex items-center">
                    <Sparkles size={10} className="mr-1" /> Match
                  </div>
                )}
                {activeTab === "history" ? (
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold uppercase text-white shadow-sm">
                      {(job.category || "G").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-slate-500">
                          {(job.datetime || job.created_at)
                            ? new Date(
                                (job.datetime || job.created_at) as string
                              ).toLocaleString("th-TH", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </p>
                        <p className="shrink-0 text-base font-bold text-slate-900 tabular-nums">
                          ฿
                          {Number(
                            job.price ??
                              (job as { budget_amount?: number }).budget_amount ??
                              0
                          ).toLocaleString("th-TH", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {formatJobReferenceCode(job)}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-base font-bold text-slate-900 transition-colors group-hover:text-emerald-600">
                        {job.title}
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex gap-2">
                          <MapPin
                            className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
                            strokeWidth={2.5}
                          />
                          <span className="line-clamp-2 text-sm leading-snug text-slate-700">
                            <span className="text-slate-400">
                              {t(`myjobs.${locLines.line1LabelKey}`)}{" "}
                            </span>
                            {locLines.line1}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <MapPin
                            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                            strokeWidth={2.5}
                          />
                          <span className="line-clamp-2 text-sm leading-snug text-slate-700">
                            <span className="text-slate-400">
                              {t(`myjobs.${locLines.line2LabelKey}`)}{" "}
                            </span>
                            {locLines.line2}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <span
                          className={`text-sm font-semibold ${
                            String(job.status || "").toLowerCase() === "completed"
                              ? "text-emerald-600"
                              : "text-slate-500"
                          }`}
                        >
                          {(() => {
                            const st = String(job.status || "").toLowerCase();
                            if (st === "completed") return t("myjobs.status_completed_ok");
                            if (st === "expired") return t("myjobs.status_expired_short");
                            return t("myjobs.status_cancelled_short");
                          })()}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {(() => {
                            const st = String(job.status || "").toLowerCase();
                            const isEmployer =
                              user?.id &&
                              job.created_by &&
                              String(job.created_by) === String(user.id);
                            const localReviewed =
                              typeof window !== "undefined" &&
                              localStorage.getItem(`job_reviewed_${job.id}`) ===
                                "true";
                            const reviewedFromBatch =
                              employerReviewedJobIds !== null &&
                              employerReviewedJobIds.has(String(job.id));
                            const reviewedFallback =
                              !!job.has_reviewed || localReviewed;
                            const hasReviewed =
                              employerReviewedJobIds !== null
                                ? reviewedFromBatch
                                : reviewedFallback;
                            const showRate =
                              st === "completed" &&
                              !!job.accepted_by &&
                              isEmployer &&
                              !hasReviewed;
                            return showRate ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigate(`/jobs/${String(job.id ?? "")}`);
                                }}
                                className="inline-flex items-center gap-0.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                              >
                                <Star
                                  className="h-3.5 w-3.5"
                                  fill="currentColor"
                                  strokeWidth={2}
                                />
                                {t("myjobs.rate_provider_short")}
                              </button>
                            ) : null;
                          })()}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!canPostJob) {
                                notify("การโพสต์งานถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
                                return;
                              }
                              navigate("/create-job", {
                                state: { rebookFromJob: job },
                              });
                            }}
                            className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            {t("myjobs.rebook")}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider mr-2 ${getStatusBadge(
                            job.status
                          )}`}
                        >
                          {(job.status ?? "open").toString().replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center">
                          <Calendar size={12} className="mr-1" />
                          {(job.datetime || job.created_at)
                            ? new Date(
                                (job.datetime || job.created_at) as string
                              ).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 transition-colors group-hover:text-emerald-600">
                        {job.title}
                      </h3>
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <MapPin size={14} className="mr-1 shrink-0" />
                        <span className="truncate max-w-[240px]">
                          {locLines.line2 && locLines.line2 !== "—"
                            ? locLines.line2
                            : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4 flex h-full flex-col items-end justify-between pt-4">
                      <span className="flex items-center font-bold text-emerald-600">
                        <DollarSign size={16} />{" "}
                        {job.price ??
                          (job as { budget_amount?: number }).budget_amount ??
                          "—"}
                      </span>
                      <span className="mt-4 text-gray-300 transition-colors group-hover:text-emerald-500">
                        <ChevronRight size={20} />
                      </span>
                    </div>
                  </div>
                )}
                {/* แสดงข้อมูลเพิ่มเติมตามแท็บ */}
                {activeTab === "posted" && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    {job.accepted_by ? (
                      <div className="flex items-center text-xs text-emerald-600 font-medium">
                        <UserCheck size={14} className="mr-1" />
                        ✅ มีผู้รับงานแล้ว
                      </div>
                    ) : (
                      <div className="flex items-center text-xs text-gray-500">
                        <Briefcase size={14} className="mr-1" />
                        🔍 กำลังหาผู้รับงาน...
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === "working" && (
                  <div className="mt-3 space-y-3 border-t border-slate-100/90 pt-3">
                    {(() => {
                      const statusUi = workingJobStatusPill(job, t);
                      const employerName =
                        job.created_by_name?.trim() || t("myjobs.employer_unspecified");
                      return (
                        <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50/95 to-slate-50/80 px-3.5 py-3 ring-1 ring-slate-200/60">
                          <div className="space-y-3">
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                {t("myjobs.working_card_status")}
                              </p>
                              <span
                                className={`inline-flex max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold leading-tight ${statusUi.pillClass}`}
                              >
                                <span className="truncate">{statusUi.label}</span>
                              </span>
                            </div>
                            <div className="h-px bg-slate-200/70" aria-hidden />
                            <div>
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                {t("myjobs.working_card_employer")}
                              </p>
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 text-sm font-bold text-emerald-900 shadow-inner ring-2 ring-white"
                                  aria-hidden
                                >
                                  {employerNameInitial(job.created_by_name)}
                                </div>
                                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800">
                                  {employerName}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Emergency button — เฉพาะงานที่ยังทำอยู่ */}
                    {(job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_PROGRESS) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEmergencyJob({ id: String(job.id), title: job.title || 'งานนี้' });
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-red-50 border border-red-300 text-red-700 font-bold text-xs rounded-xl hover:bg-red-100 active:bg-red-200 transition-colors"
                      >
                        <AlertTriangle size={13} fill="currentColor" />
                        รายงานเหตุฉุกเฉิน
                      </button>
                    )}
                  </div>
                )}
              </Link>
              );
            })
          )}
        </div>
      )}

      {/* Emergency Report Modal */}
      {emergencyJob && (
        <EmergencyReportModal
          jobId={emergencyJob.id}
          jobTitle={emergencyJob.title}
          onClose={() => setEmergencyJob(null)}
          onSuccess={(_incidentId, _couponCode) => {
            setEmergencyJob(null);
            // รีโหลด jobs เพื่อแสดงสถานะ emergency_pending
            setRefreshTrigger((k) => k + 1);
          }}
        />
      )}
    </div>
  );
};
