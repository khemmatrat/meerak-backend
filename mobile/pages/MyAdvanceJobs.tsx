import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Users, ChevronRight, Clock } from "lucide-react";
import { getMyAdvanceJobs, JobServiceError } from "../services/jobService";
import type { MyJobAdvanceAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

const statusLabel: Record<string, string> = {
  draft: "แบบร่าง",
  open: "เปิดรับ",
  pending: "รอเลือก",
  in_progress: "กำลังทำ",
  completed: "เสร็จแล้ว",
  disputed: "มีข้อพิพาท",
};

export const MyAdvanceJobs: React.FC = () => {
  const { token } = useAuth();
  const { notify } = useNotification();
  const { config } = useMobileAppConfig();
  const canPostJob = config.featureFlags.enableJobPosting;
  const [jobs, setJobs] = useState<MyJobAdvanceAPI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getMyAdvanceJobs(token);
        if (!cancelled) setJobs(list);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof JobServiceError ? e.message : "โหลดไม่สำเร็จ";
          notify(msg, "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, notify]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center gap-2">
          <Briefcase size={28} className="text-amber-400" />
          งาน Advance ของฉัน
        </h1>
        {canPostJob ? (
          <Link
            to="/create-job-advance"
            className="btn-gold-black px-5 py-2.5 rounded-xl font-medium inline-flex items-center gap-2"
          >
            โพสต์งานใหม่
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => notify("การโพสต์งานถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
            className="px-5 py-2.5 rounded-xl font-medium inline-flex items-center gap-2 bg-slate-600 text-slate-300 cursor-not-allowed opacity-90"
          >
            โพสต์งานใหม่
          </button>
        )}
      </div>

      {loading ? (
        <div className="luxury-card rounded-2xl p-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin mb-4" />
          <p className="text-slate-400">กำลังโหลด...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="luxury-card rounded-2xl p-12 text-center">
          <Briefcase size={48} className="mx-auto text-slate-500 mb-4" />
          <p className="text-slate-400 mb-2">ยังไม่มีงานที่คุณโพสต์</p>
          {canPostJob ? (
            <Link to="/create-job-advance" className="text-amber-400 hover:underline font-medium">
              โพสต์งาน Advance แรก
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => notify("การโพสต์งานถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
              className="text-slate-500 cursor-not-allowed font-medium"
            >
              โพสต์งาน Advance แรก
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/job-board/${job.id}/manage`}
              className="luxury-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-gold/20 transition-colors block"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-100 text-lg truncate">{job.title}</h3>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-700/50">{statusLabel[job.status] || job.status}</span>
                  <span className="flex items-center gap-1">
                    <Users size={14} /> {job.applicant_count} คนสนใจ
                  </span>
                  {job.hired_user_id && (
                    <span className="text-emerald-400">จ้างแล้ว</span>
                  )}
                  {job.escrow_status === "held" && (
                    <span className="text-amber-400">โอน Escrow แล้ว</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="number-wallet-gold text-amber-400">
                    ฿{job.min_budget?.toLocaleString()} – ฿{job.max_budget?.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock size={14} /> {job.duration_days} วัน
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-amber-400 font-medium shrink-0">
                จัดการ <ChevronRight size={18} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
