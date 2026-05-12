/**
 * My Applications — งานที่ Talent สมัครไว้ พร้อมสถานะ
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Users, ChevronRight, Clock, MessageCircle } from "lucide-react";
import { getMyAdvanceJobApplications, JobServiceError } from "../services/jobService";
import type { MyJobAdvanceApplicationAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

const statusLabel: Record<string, string> = {
  interested: "สนใจ",
  shortlisted: "Shortlist",
  hired: "จ้างแล้ว",
  rejected: "ปฏิเสธ",
};

const statusColor: Record<string, string> = {
  interested: "bg-slate-600 text-slate-300",
  shortlisted: "bg-amber-500/20 text-amber-400",
  hired: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-slate-700 text-slate-500",
};

export const MyApplications: React.FC = () => {
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { config } = useMobileAppConfig();
  const chatEnabled = config.featureFlags.enableChat;
  const [applications, setApplications] = useState<MyJobAdvanceApplicationAPI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getMyAdvanceJobApplications(token);
        if (!cancelled) setApplications(list);
      } catch (e) {
        if (!cancelled) {
          notify(e instanceof JobServiceError ? e.message : "โหลดไม่สำเร็จ", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, notify]);

  const myUserId = user?.id ?? (user as any)?.userId;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center gap-2">
          <Briefcase size={28} className="text-amber-400" />
          งานที่ฉันสมัคร
        </h1>
        <Link
          to="/job-board"
          className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
        >
          ดู Job Board
        </Link>
      </div>

      {loading ? (
        <div className="luxury-card rounded-2xl p-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin mb-4" />
          <p className="text-slate-400">กำลังโหลด...</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="luxury-card rounded-2xl p-12 text-center">
          <Briefcase size={48} className="mx-auto text-slate-500 mb-4" />
          <p className="text-slate-400 mb-2">ยังไม่มีงานที่คุณสมัคร</p>
          <p className="text-slate-500 text-sm mb-6">ไปหาดูงานที่น่าสนใจใน Job Board</p>
          <Link
            to="/job-board"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold hover:bg-amber-400 transition-colors"
          >
            <Briefcase size={20} />
            ไปหาดูงานที่น่าสนใจ
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div
              key={app.id}
              className="luxury-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-100 text-lg truncate">{app.title}</h3>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
                  <span className={`px-2 py-0.5 rounded-lg ${statusColor[app.status] || "bg-slate-700"}`}>
                    {statusLabel[app.status] || app.status}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} /> {app.duration_days} วัน
                  </span>
                  <span className="text-amber-400">
                    ฿{app.min_budget?.toLocaleString()} – ฿{app.max_budget?.toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-500 text-sm mt-1">{app.employer_name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(app.status === "interested" || app.status === "shortlisted") && myUserId && (
                  chatEnabled ? (
                    <Link
                      to={`/job-board/${app.job_id}/chat/${myUserId}`}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 flex items-center gap-2"
                    >
                      <MessageCircle size={18} />
                      แชท
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
                      className="px-4 py-2 rounded-xl bg-slate-600 text-slate-300 font-medium cursor-not-allowed flex items-center gap-2 opacity-80"
                    >
                      <MessageCircle size={18} />
                      แชท
                    </button>
                  )
                )}
                {(app.status === "hired" || app.status === "shortlisted" || app.status === "interested") && (
                  <Link
                    to={app.status === "hired" ? `/job-board/${app.job_id}/manage` : `/job-board/${app.job_id}`}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium hover:bg-amber-500/30 flex items-center gap-2"
                  >
                    {app.status === "hired" ? "Go to Job" : "ดูรายละเอียด"}
                    <ChevronRight size={18} />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
