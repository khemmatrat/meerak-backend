import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Lock, Clapperboard } from "lucide-react";
import { WeeklyBriefCard } from "../components/growth/WeeklyBriefCard";
import { SubscriptionUpsell799 } from "../components/growth/SubscriptionUpsell799";
import {
  fetchIncubationStatus,
  fetchIncubationBrief,
  type IncubationBrief,
} from "../services/growthEngineService";

export const IncubationDirector: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(true);
  const [weekNo, setWeekNo] = useState(1);
  const [totalWeeks, setTotalWeeks] = useState(13);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [brief, setBrief] = useState<IncubationBrief | null>(null);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const st = await fetchIncubationStatus();
      if (!st.found) {
        setLocked(true);
        return;
      }
      setLocked(!!st.locked || !st.active);
      setActive(!!st.active);
      setWeekNo(st.currentWeek || 1);
      setTotalWeeks(st.totalWeeks || 13);
      setDaysRemaining(st.daysRemaining ?? 0);

      const weekRow = st.weeks?.find((w) => w.week_no === st.currentWeek);
      if (weekRow?.composed_url) setComposedUrl(weekRow.composed_url);

      if (st.active && !st.locked) {
        const b = await fetchIncubationBrief(st.currentWeek);
        setBrief(b.brief);
        if (b.composedUrl) setComposedUrl(b.composedUrl);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCompose = () => {
    navigate("/talent/incubation/compose", {
      state: { brief, weekNo, composedUrl },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/80 via-white to-violet-50/50 pb-24">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg hover:bg-slate-100"
          aria-label="กลับ"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Clapperboard size={20} className="text-indigo-600 shrink-0" />
          <h1 className="font-bold text-slate-900 truncate">Incubation Director</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-5">
        <p className="text-sm text-slate-600 leading-relaxed">
          โปรแกรม 90 วันหลังปลดล็อก AI — ทุกสัปดาห์ Hermes ส่งโจทย์คลิปสั้น
          ถ่าย 15 วินาที ใส่เทมเพลต แล้วโพสต์ใน Video Feed
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-indigo-600" size={36} />
          </div>
        ) : locked ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-4">
            <Lock size={40} className="mx-auto text-amber-600" />
            <p className="font-semibold text-slate-800">ยังไม่เข้าโปรแกรม Incubation</p>
            <p className="text-sm text-slate-600">
              ปลดล็อกวิดีโอ Resume AI (ชวนเพื่อน 10/10) ก่อน — ระบบจะเริ่มนับ 90 วันอัตโนมัติ
            </p>
            <Link
              to="/referral?tab=ai"
              className="inline-block px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold"
            >
              ไปหน้าชวนเพื่อน
            </Link>
          </div>
        ) : !active ? (
          <SubscriptionUpsell799 variant="talent" />
        ) : brief ? (
          <>
            <WeeklyBriefCard
              weekNo={weekNo}
              totalWeeks={totalWeeks}
              brief={brief}
              daysRemaining={daysRemaining}
              composedUrl={composedUrl}
              onStart={startCompose}
            />
            <Link
              to="/video-feed"
              className="block text-center text-sm text-indigo-600 underline"
            >
              ดู Video Feed
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default IncubationDirector;
