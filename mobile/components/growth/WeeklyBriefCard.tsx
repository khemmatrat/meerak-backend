import React from "react";
import { Sparkles, Camera, Hash } from "lucide-react";
import type { IncubationBrief } from "../../services/growthEngineService";

export interface WeeklyBriefCardProps {
  weekNo: number;
  totalWeeks?: number;
  brief: IncubationBrief;
  daysRemaining?: number;
  onStart?: () => void;
  composedUrl?: string | null;
}

export const WeeklyBriefCard: React.FC<WeeklyBriefCardProps> = ({
  weekNo,
  totalWeeks = 13,
  brief,
  daysRemaining,
  onStart,
  composedUrl,
}) => {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            สัปดาห์ {weekNo}/{totalWeeks}
          </p>
          <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
            <Sparkles size={20} className="text-violet-600 shrink-0" />
            {brief.headline_th || "โจทย์คลิปสัปดาห์นี้"}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">โจทย์ถ่ายคลิป — ไม่ถูกใส่ในวิดีโอส่งออก</p>
        </div>
        {typeof daysRemaining === "number" ? (
          <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
            เหลือ {daysRemaining} วัน
          </span>
        ) : null}
      </div>

      {brief.cta_th ? (
        <div className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 mb-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-amber-950/70">CTA ในคลิป</p>
          <p className="text-base font-extrabold text-slate-900 mt-0.5">{brief.cta_th}</p>
        </div>
      ) : null}

      {brief.hook_th ? (
        <p className="text-sm text-slate-700 leading-relaxed flex items-start gap-2 mb-3">
          <Camera size={16} className="text-indigo-500 shrink-0 mt-0.5" />
          {brief.hook_th}
        </p>
      ) : null}

      {brief.script_th ? (
        <blockquote className="text-sm text-slate-600 bg-white/80 border border-slate-100 rounded-xl px-3 py-2 mb-3 italic">
          "{brief.script_th}"
        </blockquote>
      ) : null}

      {brief.hashtags?.length ? (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {brief.hashtags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full"
            >
              <Hash size={10} />
              {tag.replace(/^#/, "")}
            </span>
          ))}
        </div>
      ) : null}

      {composedUrl ? (
        <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 bg-black">
          <video src={composedUrl} controls playsInline className="w-full max-h-64 object-contain" />
        </div>
      ) : null}

      {onStart ? (
        <button
          type="button"
          onClick={onStart}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm shadow-md active:scale-[0.99] transition-transform"
        >
          {composedUrl ? "ทำคลิปสัปดาห์ใหม่" : "ถ่ายคลิป 15 วินาที + ใส่เทมเพลต"}
        </button>
      ) : null}

      <p className="text-[10px] text-center text-slate-400 mt-3">
        สนับสนุนโดย AI Resume Talent · AQOND
      </p>
    </div>
  );
};

export default WeeklyBriefCard;
