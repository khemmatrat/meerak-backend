import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Loader2, Sparkles, Share2 } from "lucide-react";
import { ReferralMilestoneTracker } from "../components/growth/ReferralMilestoneTracker";
import {
  fetchGrowthStatus,
  syncReferralMilestones,
  buildReferralShareUrl,
  GROWTH_CAMPAIGNS,
} from "../services/growthEngineService";
import { useNotification } from "../context/NotificationContext";
import { copyPlainTextToClipboard } from "../utils/employerBidAcceptFeedback";

export const TalentReferralDashboard: React.FC = () => {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qualified, setQualified] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchGrowthStatus();
      const m = s.milestones?.[GROWTH_CAMPAIGNS.TALENT_AI];
      setQualified(m?.qualified ?? 0);
      setUnlocked(!!m?.unlocked);
      setReferralCode(s.referralCode || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const s = await syncReferralMilestones();
      const m = s.milestones?.[GROWTH_CAMPAIGNS.TALENT_AI];
      setQualified(m?.qualified ?? 0);
      setUnlocked(!!m?.unlocked);
      notify("อัปเดตความคืบหน้าแล้ว", "success");
    } catch {
      notify("อัปเดตไม่สำเร็จ", "error");
    } finally {
      setSyncing(false);
    }
  };

  const shareUrl = referralCode ? buildReferralShareUrl(referralCode) : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyPlainTextToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      notify("คัดลอกลิงก์แล้ว", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "เข้าร่วม AQOND",
          text: "สมัคร AQOND แล้วเปิด Wallet — ช่วยฉันปลดล็อกวิดีโอ Resume AI",
          url: shareUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      void copyLink();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-violet-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-5 text-white">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles size={22} />
          ปลดล็อกวิดีโอ Resume AI
        </h2>
        <p className="text-sm text-white/90 mt-2 leading-relaxed">
          ชวนเพื่อน 10 คนให้สมัครและเปิด Wallet — รับสิทธิ์สร้างวิดีโอ AI Premium ฟรี 2 คลิป
          เพื่อโพสต์ใน Video Feed Hiring
        </p>
      </div>

      <ReferralMilestoneTracker
        qualified={qualified}
        unlocked={unlocked}
        title="ความคืบหน้าชวนเพื่อน"
      />

      {shareUrl && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            คัดลอก
          </button>
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="px-4 py-3 rounded-xl bg-violet-600 text-white font-semibold flex items-center justify-center gap-2"
          >
            <Share2 size={18} />
            แชร์
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={syncing}
        onClick={() => void handleSync()}
        className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
      >
        {syncing ? "กำลังอัปเดต…" : "รีเฟรชความคืบหน้า"}
      </button>

      {unlocked ? (
        <>
          <Link
            to="/talent/ai-resume"
            className="block w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-center font-bold text-lg shadow-lg"
          >
            สร้างวิดีโอ Resume AI ตอนนี้
          </Link>
          <Link
            to="/talent/incubation"
            className="block w-full py-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 text-indigo-800 text-center font-semibold text-sm"
          >
            Incubation 90 วัน — โจทย์คลิปรายสัปดาห์
          </Link>
        </>
      ) : (
        <p className="text-center text-xs text-slate-500">
          หรือ{" "}
          <Link to="/video-feed" className="text-violet-600 underline">
            อัปโหลดคลิปเอง
          </Link>{" "}
          ใน Video Feed ได้ทันที
        </p>
      )}
    </div>
  );
};

export default TalentReferralDashboard;
