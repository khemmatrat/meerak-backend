import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, ChevronRight, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  submitCompassSurvey,
  type AcquisitionChannel,
  type CompassGoal,
  compassHrefToNavigate,
} from "../services/compassOnboardingService";

const CHANNELS: { id: AcquisitionChannel; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "line", label: "LINE" },
  { id: "tiktok", label: "TikTok" },
  { id: "friend", label: "เพื่อนแนะนำ" },
  { id: "google", label: "Google" },
  { id: "ads", label: "โฆษณา" },
  { id: "other", label: "อื่นๆ" },
];

const GOALS: { id: CompassGoal; label: string; emoji: string }[] = [
  { id: "use_services", label: "ใช้บริการ / จ้างงาน", emoji: "🛎️" },
  { id: "shop", label: "สั่งซื้อสินค้า", emoji: "🛍️" },
  { id: "food", label: "สั่งอาหาร", emoji: "🍜" },
  { id: "open_shop", label: "เปิดร้าน / ขายของ", emoji: "🏪" },
  { id: "provider_service", label: "ผู้รับงานบริการ", emoji: "🧹" },
  { id: "rider_delivery", label: "Rider ส่งของ", emoji: "🏍️" },
  { id: "ai_assist", label: "ใช้ AI ช่วยสั่ง", emoji: "✨" },
];

export const OnboardingCompassSurvey: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [channel, setChannel] = useState<AcquisitionChannel | "">("");
  const [goals, setGoals] = useState<CompassGoal[]>([]);
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toggleGoal = (g: CompassGoal) => {
    setGoals((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  };

  const finish = async () => {
    if (!channel || goals.length === 0) {
      setErr("กรุณาเลือกช่องทางและเป้าหมายอย่างน้อย 1 ข้อ");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const status = await submitCompassSurvey({
        acquisition_channel: channel,
        user_goals: goals,
        referral_code: channel === "friend" && referralCode ? referralCode : undefined,
      });
      if (status.compassMode) {
        navigate("/compass", { replace: true });
        return;
      }
      const dest = status.marketplaceHref || "/";
      if (dest.startsWith("/m/")) {
        navigate(compassHrefToNavigate(dest), { replace: true });
      } else {
        navigate(dest, { replace: true });
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 text-white mb-4 shadow-lg">
            <Compass size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">เส้นทางของคุณ</h1>
          <p className="text-slate-600 mt-2 text-sm">
            ตอบสั้นๆ 2 คำถาม — เราจะพาคุณไปถูกที่ ไม่หลงในหน้ากว้างๆ
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            ขั้น {step}/2 · ใช้เวลาประมาณ 1 นาที
          </p>
        </div>

        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900 mb-1">
              รู้จัก AQOND จากช่องทางไหน?
            </h2>
            <p className="text-xs text-slate-500 mb-4">เลือก 1 ข้อ</p>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border transition-all ${
                    channel === c.id
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-700 hover:border-emerald-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {channel === "friend" && (
              <input
                className="mt-4 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm"
                placeholder="รหัสแนะนำ (ถ้ามี)"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
              />
            )}
            <button
              type="button"
              disabled={!channel}
              onClick={() => setStep(2)}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
            >
              ถัดไป <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900 mb-1">
              อยากทำอะไรในแอป?
            </h2>
            <p className="text-xs text-slate-500 mb-4">เลือกได้หลายข้อ</p>
            <div className="space-y-2">
              {GOALS.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGoal(g.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      on
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-emerald-200"
                    }`}
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800">
                      {g.label}
                    </span>
                    {on && (
                      <Check size={18} className="text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={busy || goals.length === 0}
                onClick={() => void finish()}
                className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
              >
                {busy ? "กำลังบันทึก…" : "เริ่มเส้นทางของฉัน"}
              </button>
            </div>
          </div>
        )}

        {user?.name && (
          <p className="text-center text-xs text-slate-400 mt-6">
            สวัสดี {user.name} — ข้อมูลของคุณปลอดภัยและเข้ารหัส
          </p>
        )}
      </div>
    </div>
  );
};

export default OnboardingCompassSurvey;
