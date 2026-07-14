import React from "react";
import { Check, Lock, UserPlus } from "lucide-react";

export interface ReferralMilestoneTrackerProps {
  qualified: number;
  target?: number;
  unlocked?: boolean;
  title?: string;
  subtitle?: string;
  socialProof?: string;
}

export const ReferralMilestoneTracker: React.FC<ReferralMilestoneTrackerProps> = ({
  qualified,
  target = 10,
  unlocked = false,
  title = "ชวนเพื่อนเปิด Wallet",
  subtitle = "เพื่อนต้องสมัครและเปิดกระเป๋า AQOND จึงจะนับ",
  socialProof = "ไรเดอร์และช่าง 12,000+ ผ่านขั้นนี้แล้ว",
}) => {
  const pct = Math.min(100, Math.round((qualified / target) * 100));
  const slots = Array.from({ length: target }, (_, i) => i < qualified);

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            {unlocked ? (
              <Check className="text-emerald-600" size={20} />
            ) : (
              <Lock className="text-violet-600" size={20} />
            )}
            {title}
          </h3>
          <p className="text-xs text-slate-600 mt-1">{subtitle}</p>
          <p className="text-xs text-violet-700 mt-2 font-medium">{socialProof}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-violet-700 tabular-nums">
            {qualified}/{target}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">เพื่อน</p>
        </div>
      </div>

      <div className="h-2 rounded-full bg-violet-100 overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {slots.map((filled, i) => (
          <div
            key={i}
            className={`aspect-square rounded-xl flex items-center justify-center border-2 transition-all ${
              filled
                ? "border-emerald-400 bg-emerald-50 text-emerald-600"
                : "border-dashed border-slate-200 bg-white/80 text-slate-300"
            }`}
          >
            {filled ? (
              <Check size={16} strokeWidth={3} />
            ) : (
              <UserPlus size={14} />
            )}
          </div>
        ))}
      </div>

      {!unlocked && qualified < target && (
        <p className="text-xs text-center text-slate-500 mt-4">
          เหลืออีก {target - qualified} คน — แชร์ลิงก์แล้วบอกให้เปิด Wallet ในแอป
        </p>
      )}
      {unlocked && (
        <p className="text-sm text-center text-emerald-700 font-semibold mt-4">
          ปลดล็อกแล้ว — สร้างวิดีโอ Resume AI ได้เลย
        </p>
      )}
    </div>
  );
};

export default ReferralMilestoneTracker;
