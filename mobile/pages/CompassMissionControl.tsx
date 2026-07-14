import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Compass,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  Map,
} from "lucide-react";
import {
  fetchCompassStatus,
  compassHrefToNavigate,
  type CompassStatus,
} from "../services/compassOnboardingService";
import { navigateToMarketplace } from "../services/marketplaceHandoff";

export const CompassMissionControl: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CompassStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await fetchCompassStatus();
      setStatus(s);
      if (!s.surveyDone) {
        navigate("/onboarding/compass", { replace: true });
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "โหลดสถานะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const goNext = () => {
    if (!status?.nextAction?.href) return;
    const href = status.nextAction.href;
    if (href.startsWith("/storefront?p=")) {
      const path = decodeURIComponent(href.replace("/storefront?p=", ""));
      navigateToMarketplace(navigate, path);
      return;
    }
    if (href.startsWith("/m/")) {
      navigateToMarketplace(navigate, href);
      return;
    }
    navigate(href);
  };

  const explore = () => navigate("/");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50">
        <p className="text-slate-600">กำลังโหลดเส้นทางของคุณ…</p>
      </div>
    );
  }

  const progress = status?.progress || { completed: 0, total: 1 };
  const pct = Math.round((progress.completed / Math.max(progress.total, 1)) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 pb-24">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg mb-3">
            <Compass size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">เข็มทิศรับงาน</h1>
          <p className="text-sm text-slate-600 mt-1">
            ใกล้พร้อมรับงานแล้ว — ทำทีละขั้น ไม่ต้องหลงทาง
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>
              ขั้น {progress.completed}/{progress.total}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {status?.nextAction?.minutes != null && status.nextAction.minutes > 0 && (
            <p className="flex items-center gap-1 text-xs text-emerald-700 mt-2">
              <Clock size={14} />
              ขั้นถัดไป ~{status.nextAction.minutes} นาที
            </p>
          )}
        </div>

        {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

        <div className="space-y-2 mb-6">
          {(status?.steps || []).map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                s.done
                  ? "border-emerald-100 bg-emerald-50/50"
                  : status?.nextAction?.id === s.id
                    ? "border-emerald-400 bg-white shadow-sm"
                    : "border-slate-100 bg-white"
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="text-emerald-600 shrink-0" size={22} />
              ) : (
                <Circle className="text-slate-300 shrink-0" size={22} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400">ขั้น {i + 1}</p>
                <p className="text-sm font-medium text-slate-800 truncate">
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-200 active:scale-[0.98] transition-transform"
        >
          ทำขั้นต่อไป
          <ChevronRight size={22} />
        </button>

        <button
          type="button"
          onClick={explore}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 text-sm text-slate-500"
        >
          <Map size={16} />
          สำรวจทั้งแอป (ไม่บังคับ)
        </button>

        <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
          <Sparkles size={12} />
          ข้อมูลเข้ารหัส · ตรวจโดยทีม AQOND
        </p>
      </div>
    </div>
  );
};

export default CompassMissionControl;
