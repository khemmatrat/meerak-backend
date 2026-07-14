/**
 * My Applications — งานที่ Talent สมัครไว้ พร้อมสถานะ
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ChevronRight, Clock, MessageCircle, Send } from "lucide-react";
import { getMyAdvanceJobApplications, JobServiceError } from "../services/jobService";
import type { MyJobAdvanceApplicationAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { ApplicationTimeline } from "../components/ApplicationTimeline";
import { JobBoardEmptyState } from "../components/JobBoardEmptyState";
import { resolveJobBoardCopy } from "../utils/jobBoardCopy";
import {
  getRoutingPreferredCategories,
  suggestCategoryFromHistory,
} from "../utils/jobBoardSmartMatch";
import { getUnreadAdvanceJobMap } from "../services/jobService";

const statusLabel: Record<string, string> = {
  interested: "สนใจ",
  shortlisted: "คัดเลือกแล้ว",
  hired: "จ้างแล้ว",
  rejected: "ปฏิเสธ",
};

const statusColor: Record<string, string> = {
  interested: "bg-slate-600 text-slate-300",
  shortlisted: "bg-amber-500/20 text-amber-400",
  hired: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-slate-700 text-slate-500",
};

function MyApplicationsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="luxury-card rounded-2xl p-5 space-y-3">
          <div className="h-5 w-2/3 rounded bg-slate-700/60" />
          <div className="flex gap-2">
            <div className="h-6 w-20 rounded-lg bg-slate-700/50" />
            <div className="h-6 w-28 rounded-lg bg-slate-700/50" />
          </div>
          <div className="h-8 rounded-lg bg-slate-700/40" />
        </div>
      ))}
    </div>
  );
}

export const MyApplications: React.FC = () => {
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { config } = useMobileAppConfig();
  const jobBoardCopy = useMemo(
    () => resolveJobBoardCopy(config.remote),
    [config.remote],
  );
  const routingCategories = useMemo(
    () => getRoutingPreferredCategories(config.remote?.routingWeightOverrides),
    [config.remote?.routingWeightOverrides],
  );
  const chatEnabled = config.featureFlags.enableChat;
  const [applications, setApplications] = useState<MyJobAdvanceApplicationAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const filterBrowseHref = useMemo(() => {
    const suggested = suggestCategoryFromHistory(
      applications,
      [],
      routingCategories,
    );
    const params = new URLSearchParams({ openFilter: "1" });
    if (suggested) params.set("category", suggested);
    return `/job-board?${params.toString()}`;
  }, [applications, routingCategories]);

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

  useEffect(() => {
    const tick = async () => {
      try {
        const list = await getMyAdvanceJobApplications(token);
        setApplications(list);
        const unread = await getUnreadAdvanceJobMap(token);
        setUnreadMap(unread);
      } catch (_) { /* silent */ }
    };
    tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, 25000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const myUserId = user?.id ?? (user as any)?.userId;

  return (
    <div className="aqond-trust-theme jobboard-flow-theme space-y-8 pb-12 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center gap-2">
          <Briefcase size={28} className="text-amber-400" />
          งานที่ฉันสมัคร
        </h1>
        <Link
          to="/job-board?tab=my-applications"
          className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
        >
          ไปหน้ารับงาน
        </Link>
      </div>

      {loading ? (
        <MyApplicationsSkeleton />
      ) : applications.length === 0 ? (
        <JobBoardEmptyState
          icon={Send}
          title="ยังไม่มีงานที่คุณสมัคร"
          bullets={jobBoardCopy.emptyApplicationsBullets}
          ctaLabel="ไปหาดูงานที่น่าสนใจ"
          ctaHref="/job-board"
          secondaryCtaLabel="เปิดตัวกรองหมวดงาน"
          secondaryCtaHref={filterBrowseHref}
          analyticsContext="empty_applications_standalone"
          experimentCopy={jobBoardCopy}
        />
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const badges: { label: string; href: string }[] = [];
            const escrowStatus = app.escrow_status || "none";
            if (app.status === "hired" && escrowStatus !== "held" && escrowStatus !== "released") {
              badges.push({ label: "รอโอนเงินค้ำ", href: `/job-board/${app.job_id}/manage?tab=escrow` });
            }
            if (app.review_pending) {
              badges.push({ label: "รอให้คะแนน", href: `/job-board/${app.job_id}/manage?tab=review` });
            }

            return (
              <div
                key={app.id}
                className="luxury-card rounded-2xl p-5 flex flex-col gap-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
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
                    {(() => {
                      const unread = unreadMap[String(app.job_id)] || 0;
                      if (unread > 0) {
                        badges.unshift({
                          label: `มีแชทใหม่ ${unread > 9 ? "9+" : unread}`,
                          href: `/job-board/${app.job_id}/chat/${myUserId}`,
                        });
                      }
                      if (!badges.length) return null;
                      return (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {badges.slice(0, 2).map((b) => (
                            <Link
                              key={b.label}
                              to={b.href}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25"
                            >
                              {b.label}
                            </Link>
                          ))}
                        </div>
                      );
                    })()}
                    {app.status !== "rejected" && (
                      <div className="mt-3">
                        <ApplicationTimeline
                          status={app.status}
                          jobStatus={app.job_status}
                          viewedAt={app.viewed_at}
                          compact
                        />
                      </div>
                    )}
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
                        {app.status === "hired" ? "ไปที่งาน" : "ดูรายละเอียด"}
                        <ChevronRight size={18} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
