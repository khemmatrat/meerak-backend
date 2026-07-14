/**
 * Saved Jobs — งานที่ Talent บันทึกไว้ดูภายหลัง
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Bookmark, WifiOff } from "lucide-react";
import { getSavedAdvanceJobs, getSavedAdvanceJobIds, JobServiceError } from "../services/jobService";
import { JobCard } from "./JobBoard";
import type { JobAdvanceAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { gradeService, type GradeData } from "../services/gradeService";

export const SavedJobs: React.FC = () => {
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const [jobs, setJobs] = useState<JobAdvanceAPI[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [workerGrade, setWorkerGrade] = useState<GradeData | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, ids] = await Promise.all([
        getSavedAdvanceJobs(token),
        getSavedAdvanceJobIds(token),
      ]);
      setJobs(list);
      setSavedIds(new Set(ids));
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (user?.id) {
      gradeService.getWorkerGrade(user.id).then((g) => setWorkerGrade(g));
    }
  }, [user?.id]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const handleSaveChange = (jobId: string, saved: boolean) => {
    if (!saved) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  if (!token) {
    return (
      <div className="luxury-card rounded-2xl p-12 text-center">
        <p className="text-slate-400 mb-4">กรุณาเข้าสู่ระบบเพื่อดูงานที่บันทึก</p>
        <Link to="/job-board" className="text-amber-400 hover:underline">
          ไป Job Board
        </Link>
      </div>
    );
  }

  return (
    <div className="aqond-trust-theme jobboard-flow-theme space-y-8 pb-12 min-h-screen">
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm">
          <WifiOff size={18} />
          คุณอยู่ในโหมดออฟไลน์ — ข้อมูลอาจไม่เป็นปัจจุบัน
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center gap-2">
          <Bookmark size={28} className="text-amber-400" />
          งานที่บันทึก
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
      ) : jobs.length === 0 ? (
        <div className="luxury-card rounded-2xl p-12 text-center">
          <Bookmark size={48} className="mx-auto text-slate-500 mb-4" />
          <p className="text-slate-400 mb-2">ยังไม่มีงานที่บันทึก</p>
          <p className="text-slate-500 text-sm mb-6">กดปุ่ม Bookmark บน Job Board เพื่อบันทึกงานที่สนใจ</p>
          <Link
            to="/job-board"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold hover:bg-amber-400 transition-colors"
          >
            <Briefcase size={20} />
            ไปหาดูงาน
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job as any}
              workerGrade={workerGrade}
              savedIds={savedIds}
              token={token}
              onSaveChange={handleSaveChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};
