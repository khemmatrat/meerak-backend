import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
} from "lucide-react";
import { Unsubscribe } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";


export const MyJobs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "posted" | "working" | "recommended" | "history"
  >("posted");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [recCount, setRecCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const backendJobsRef = useRef<Job[]>([]);
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();

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
          if (activeTab === "posted") {
            const activeStatuses = ["open", "accepted", "in_progress", "waiting_for_approval", "waiting_for_payment", "dispute"];
            const uidStr = String(userId ?? "");
            filtered = allMyJobs.filter(
              (j) => {
                const createdBy = String(j.created_by ?? "");
                const statusNorm = normStatus(j.status);
                const isOpenNoProvider = statusNorm === "open" && !j.accepted_by;
                const isMine = createdBy === uidStr || norm(createdBy) === norm(uidStr) || isOpenNoProvider;
                const isActive = activeStatuses.some((s) => statusNorm === s);
                return isMine && isActive;
              }
            );
          } else if (activeTab === "working") {
            const workStatuses = ["accepted", "in_progress", "waiting_for_approval", "waiting_for_payment", "dispute"];
            filtered = allMyJobs.filter(
              (j) =>
                (j.accepted_by === userId || norm(j.accepted_by ?? "") === norm(userId ?? "")) &&
                workStatuses.includes(normStatus(j.status))
            );
          } else if (activeTab === "history") {
            const doneStatuses = ["completed", "cancelled"];
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

        MockApi.getYourJobs(userId).then((backendJobs) => {
          mergeAndSet(backendJobs || [], []);
          setLoading(false);
          if ((backendJobs || []).length > 0) {
            console.log(`📦 Hired/My jobs: ${(backendJobs || []).length} from backend for tab "${activeTab}"`);
          }
        }).catch(() => setLoading(false));

        unsubscribe = MockApi.subscribeToMyJobs(userId, async (firestoreJobs) => {
          const backend = await MockApi.getYourJobs(userId).catch(() => []);
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
}, [activeTab, user?.id, refreshTrigger]);



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
    if (activeTab === "working") return t("myjobs.working_desc");
    if (activeTab === "history") return t("myjobs.history_desc");
    return t("myjobs.recommended_desc");
  };

  const getNoJobsMessage = () => {
    if (activeTab === "posted") return t("myjobs.no_posted");
    if (activeTab === "working") return t("myjobs.no_working");
    if (activeTab === "history") return t("myjobs.no_history");
    return t("myjobs.no_recommended");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t("myjobs.title")}</h1>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab("posted")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
            activeTab === "posted"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          {t("myjobs.hired")}
        </button>
        <button
          onClick={() => setActiveTab("working")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
            activeTab === "working"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          {t("myjobs.working")}
        </button>
        <button
          onClick={() => setActiveTab("recommended")}
          className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center whitespace-nowrap relative ${
            activeTab === "recommended"
              ? "bg-emerald-100 text-emerald-800 shadow-sm"
              : "text-gray-500 hover:bg-gray-50"
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
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Archive size={14} className="mr-1.5 hidden sm:inline" />
          {t("myjobs.history")}
        </button>
      </div>

      {/* Description */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-start">
        <Briefcase className="text-emerald-600 mt-0.5 mr-3" size={20} />
        <div>
          <p className="text-sm text-emerald-900 font-medium">
            {getDescription()}
          </p>
        </div>
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
          {jobs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="text-gray-300" size={32} />
              </div>
              <p className="text-gray-500">{getNoJobsMessage()}</p>
            </div>
          ) : (
            jobs.map((job) => (
              <Link
                to={`/jobs/${String(job.id ?? "")}`}
                key={String(job.id ?? "")}
                className="block bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow group relative overflow-hidden"
              >
                {activeTab === "recommended" && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold uppercase tracking-wider flex items-center">
                    <Sparkles size={10} className="mr-1" /> Match
                  </div>
                )}
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
                        {(job.datetime || job.created_at) ? new Date((job.datetime || job.created_at) as string).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">
                      {job.title}
                    </h3>
                    <div className="flex items-center mt-2 text-sm text-gray-500">
                      <MapPin size={14} className="mr-1" />
                      <span className="truncate max-w-[200px]">
                        {job.location?.lat != null && job.location?.lng != null
                          ? `${Number(job.location.lat).toFixed(3)}, ${Number(job.location.lng).toFixed(3)}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between h-full ml-4 pt-4">
                      <span className="font-bold text-emerald-600 flex items-center">
                      <DollarSign size={16} /> {job.price ?? (job as { budget_amount?: number }).budget_amount ?? "—"}
                    </span>
                    <span className="text-gray-300 group-hover:text-emerald-500 transition-colors mt-4">
                      <ChevronRight size={20} />
                    </span>
                  </div>
                </div>
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
                  <div className="mt-3 pt-3 border-t border-gray-50 space-y-1">
                    <div className="flex items-center text-xs text-gray-600">
                      <span className="font-medium mr-1">สถานะ:</span>
                      {job.status === JobStatus.ACCEPTED && "✅ รับงานแล้ว"}
                      {job.status === JobStatus.IN_PROGRESS && "🚀 กำลังทำงาน"}
                      {job.status === JobStatus.WAITING_FOR_APPROVAL && "⏳ รอการอนุมัติ"}
                      {job.status === JobStatus.WAITING_FOR_PAYMENT && "💰 รอการจ่ายเงิน"}
                      {job.status === JobStatus.DISPUTE && "⚠️ มีข้อโต้แย้ง"}
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                      <span className="mr-1">นายจ้าง:</span>
                      {job.created_by_name || "ไม่ระบุ"}
                    </div>
                  </div>
                )}
                
                {activeTab === "history" && (
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                    <div className="flex items-center text-xs text-gray-500">
                      {job.status === JobStatus.COMPLETED ? (
                        <>
                          <span className="text-green-600 mr-1">✅</span>
                          เสร็จสมบูรณ์
                        </>
                      ) : (
                        <>
                          <span className="text-gray-400 mr-1">❌</span>
                          ยกเลิกแล้ว
                        </>
                      )}
                    </div>
                    {job.completed_at && (
                      <div className="text-xs text-gray-400">
                        {new Date(job.completed_at).toLocaleDateString('th-TH')}
                      </div>
                    )}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
};
