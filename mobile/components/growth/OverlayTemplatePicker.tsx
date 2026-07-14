import React, { useEffect, useRef } from "react";
import { ArrowRight, Check, Film, Play, Sparkles, Wand2 } from "lucide-react";
import type { OverlayTemplate } from "../../services/growthEngineService";

export interface OverlayTemplatePickerProps {
  templates: OverlayTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
  headline?: string;
  subtitle?: string;
  cta?: string;
  script?: string;
  weekNo?: number;
  videoPreviewUrl?: string | null;
  onUploadClick?: () => void;
  hasVideo?: boolean;
}

const SPONSOR_LINE = "สนับสนุนโดย AI Resume Talent · AQOND";
const DEFAULT_CTA = "จ้างงานคนนี้วันนี้ — ลด 20%";

type Theme = { bar: string; text: string; accent: string };

function themeOf(t: OverlayTemplate): Theme {
  const p = t.preview as Theme;
  return {
    bar: p?.bar || "#0f172a",
    text: p?.text || "#ffffff",
    accent: p?.accent || "#34d399",
  };
}

const TEMPLATE_STYLES: Record<
  string,
  { cardBg: string; accent: string; badge?: string; badgeBg?: string }
> = {
  pro_hire: {
    cardBg: "bg-slate-900/95",
    accent: "bg-emerald-500",
    badge: "พร้อมรับงาน",
    badgeBg: "bg-emerald-600",
  },
  pro_blue: { cardBg: "bg-slate-900/95", accent: "bg-sky-400" },
  violet_glow: { cardBg: "bg-slate-900/95", accent: "bg-violet-400" },
  minimal_white: { cardBg: "bg-white/20 backdrop-blur-md", accent: "bg-white" },
  hiring_cta: {
    cardBg: "bg-emerald-950/95",
    accent: "bg-emerald-400",
    badge: "พร้อมรับงาน",
    badgeBg: "bg-emerald-600",
  },
  week_stamp: { cardBg: "bg-indigo-950/95", accent: "bg-indigo-400" },
};

function styleOf(templateId: string) {
  return TEMPLATE_STYLES[templateId] || TEMPLATE_STYLES.pro_hire;
}

function ClipCaptionOverlay({
  templateId,
  cta,
  headline,
  subtitle,
  weekNo,
  size = "md",
  showSponsor = true,
  variant = "bar",
}: {
  templateId: string;
  cta: string;
  headline: string;
  subtitle: string;
  weekNo?: number;
  size?: "sm" | "md";
  showSponsor?: boolean;
  variant?: "bar" | "scene";
}) {
  const st = styleOf(templateId);
  const compact = size === "sm";
  const isScene = variant === "scene";

  if (isScene) {
    return (
      <div className="absolute inset-0 bg-black flex flex-col items-center justify-center px-2 text-center">
        <img
          src="/aqond-logo-endcard.png"
          alt="AQOND"
          className={`object-contain ${compact ? "w-8 h-8 mb-0.5" : "w-14 h-14 mb-1"}`}
        />
        <p className={`font-black text-amber-400 tracking-wide ${compact ? "text-[8px]" : "text-[12px]"}`}>
          AQOND
        </p>
        <p className={`text-white/50 ${compact ? "text-[5px] mb-1" : "text-[7px] mb-1.5"}`}>
          จ้างช่างมืออาชีพวันนี้
        </p>
        <p
          className={`font-bold text-white leading-tight ${compact ? "text-[6px] px-1" : "text-[9px] px-2"}`}
        >
          {cta}
        </p>
        <div
          className={`rounded-full bg-amber-400 text-black font-extrabold ${
            compact ? "text-[5px] px-2 py-0.5 mt-1" : "text-[8px] px-3 py-1 mt-1.5"
          }`}
        >
          กดจ้างงานที่ AQOND
        </div>
        {showSponsor ? (
          <p className={`text-white/40 mt-1.5 ${compact ? "text-[4px]" : "text-[6px]"}`}>{SPONSOR_LINE}</p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {st.badge && !compact ? (
        <span className="absolute left-2 top-2 bg-emerald-600/90 text-white font-semibold rounded-full text-[7px] px-1.5 py-0.5 backdrop-blur-sm">
          {st.badge}
        </span>
      ) : null}
      {templateId === "week_stamp" && weekNo && !compact ? (
        <span className="absolute left-2 top-2 bg-indigo-600/90 text-white font-semibold rounded-full text-[7px] px-1.5 py-0.5">
          W{weekNo}
        </span>
      ) : null}
      {showSponsor ? (
        <p
          className={`absolute left-0 right-0 bottom-[4%] text-center text-white/35 ${
            compact ? "text-[4px]" : "text-[6px]"
          }`}
        >
          {SPONSOR_LINE}
        </p>
      ) : null}
    </>
  );
}

function StyleThumb({
  templateId,
  cta,
  headline,
  subtitle,
  active,
  nameTh,
  accent,
}: {
  templateId: string;
  cta: string;
  headline: string;
  subtitle: string;
  active: boolean;
  nameTh: string;
  accent: string;
}) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden aspect-[9/14] bg-gradient-to-b from-slate-500 to-slate-800 ${
        active ? "ring-2 ring-indigo-500 shadow-lg" : "ring-1 ring-slate-200 opacity-90"
      }`}
    >
      <ClipCaptionOverlay
        templateId={templateId}
        cta={cta}
        headline={headline}
        subtitle={subtitle}
        size="sm"
        showSponsor={false}
      />
      {active ? (
        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
          <Check size={11} className="text-white" strokeWidth={3} />
        </span>
      ) : (
        <span
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ring-1 ring-white/40"
          style={{ background: accent }}
        />
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 py-2">
        <p className="text-[9px] font-semibold text-white leading-tight line-clamp-2">{nameTh}</p>
      </div>
    </div>
  );
}

function PhonePreview({
  videoUrl,
  templateId,
  cta,
  headline,
  subtitle,
  weekNo,
  videoRef,
  size = "lg",
}: {
  videoUrl?: string | null;
  templateId: string;
  cta: string;
  headline: string;
  subtitle: string;
  weekNo?: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  size?: "lg" | "sm";
}) {
  const w = size === "lg" ? "w-[min(100%,260px)]" : "w-[72px]";

  return (
    <div className={`relative ${w} mx-auto`}>
      <div
        className={`rounded-[1.4rem] p-[3px] bg-gradient-to-br from-violet-400/40 via-indigo-300/30 to-fuchsia-400/40 shadow-xl ${
          size === "lg" ? "shadow-indigo-200/50" : ""
        }`}
      >
        <div className="relative rounded-[1.2rem] overflow-hidden bg-slate-900 aspect-[9/16] ring-1 ring-black/10">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              preload="metadata"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-slate-600 via-slate-700 to-slate-900">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                  <Play size={16} className="text-white/80 ml-0.5" />
                </div>
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          <ClipCaptionOverlay
            templateId={templateId}
            cta={cta}
            headline={headline}
            subtitle={subtitle}
            weekNo={weekNo}
            size={size === "lg" ? "md" : "sm"}
          />
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { n: 1, label: "อัปโหลดคลิป" },
  { n: 2, label: "โจทย์ Hermes" },
  { n: 3, label: "เลือกสไตล์" },
  { n: 4, label: "ส่งออก" },
];

export const OverlayTemplatePicker: React.FC<OverlayTemplatePickerProps> = ({
  templates,
  selectedId,
  onSelect,
  headline = "",
  subtitle = "",
  cta = "",
  script = "",
  weekNo,
  videoPreviewUrl,
  onUploadClick,
  hasVideo = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const selected = templates.find((t) => t.id === selectedId) || templates[0];
  const displayTitle = (headline || "ช่างมืออาชีพ AQOND").trim();
  const displaySub = (subtitle || "").trim();
  const displayCta = (cta || DEFAULT_CTA).trim();
  const activeStep = !hasVideo ? 1 : 3;

  useEffect(() => {
    const v = videoRef.current;
    if (!videoPreviewUrl || !v) return;
    v.src = videoPreviewUrl;
    v.muted = true;
    v.playsInline = true;
    v.currentTime = 0.1;
  }, [videoPreviewUrl]);

  return (
    <div className="space-y-5">
      {/* Step pills — Instories-style */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {STEPS.map((s) => {
          const done = s.n < activeStep || (s.n === 1 && hasVideo) || (s.n <= 3 && hasVideo);
          const current = s.n === activeStep || (s.n === 2 && hasVideo && activeStep === 3);
          return (
            <div
              key={s.n}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                current
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : done
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white text-slate-400 border-slate-200"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                  current ? "bg-white/25" : done ? "bg-emerald-500 text-white" : "bg-slate-100"
                }`}
              >
                {done && !current ? <Check size={10} /> : s.n}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>

      {/* Hermes brief — clean white card */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
              Hermes AI Brief
              {weekNo ? ` · สัปดาห์ ${weekNo}` : ""}
            </p>
            <p className="text-xs text-slate-500">โจทย์ถ่ายคลิป — ไม่แสดงในวิดีโอส่งออก</p>
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 shadow-md">
            <p className="text-[10px] font-bold uppercase text-amber-950/70 mb-0.5">
              CTA ดึงดูดการจ้าง
            </p>
            <p className="text-base font-extrabold text-slate-900 leading-snug">{displayCta}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">โจทย์ถ่าย (Hermes)</p>
            <p className="text-sm font-bold text-slate-800">{displayTitle}</p>
            {displaySub ? (
              <p className="text-sm text-slate-600 leading-relaxed mt-0.5">{displaySub}</p>
            ) : null}
            <p className="text-[10px] text-violet-600 mt-1.5 font-medium">
              ระหว่างคลิปไม่มีกรอบ/แท็บ — มีเฉพาะฉาก CTA 3 วินาทีท้าย
            </p>
          </div>
          {script ? (
            <p className="text-xs text-slate-500 italic border-l-2 border-violet-300 pl-3 mt-2">
              &ldquo;{script}&rdquo;
            </p>
          ) : null}
          <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 mt-2">
            {SPONSOR_LINE}
          </p>
        </div>
      </div>

      {/* Before → After hero — Instories-style */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-50 via-indigo-50/80 to-fuchsia-50 border border-indigo-100 p-4">
        <p className="text-xs font-bold text-indigo-700 mb-3 text-center uppercase tracking-wide">
          ตัวอย่างก่อน → หลังใส่แคปชัน
        </p>

        <div className="flex items-center justify-center gap-3">
          {/* Before */}
          <div className="text-center shrink-0">
            <div className="w-[88px] rounded-xl overflow-hidden aspect-[9/16] bg-slate-300 ring-2 ring-slate-200 relative">
              {videoPreviewUrl ? (
                <video
                  src={videoPreviewUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-400">
                  <Film size={20} className="text-white/60" />
                </div>
              )}
              <span className="absolute top-1 left-1 text-[8px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded">
                ก่อน
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">คลิปดิบ</p>
          </div>

          <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <ArrowRight size={16} className="text-white" />
          </div>

          {/* After */}
          <div className="text-center flex-1 min-w-0">
            <PhonePreview
              videoUrl={videoPreviewUrl}
              templateId={selected?.id || "pro_hire"}
              cta={displayCta}
              headline={displayTitle}
              subtitle={displaySub}
              weekNo={weekNo}
              videoRef={videoRef}
              size="lg"
            />
            <p className="text-[10px] text-indigo-600 font-semibold mt-1">หลัง + แคปชัน</p>
          </div>
        </div>

        {!hasVideo && onUploadClick ? (
          <button
            type="button"
            onClick={onUploadClick}
            className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-indigo-300 bg-white/80 text-indigo-700 font-semibold text-sm hover:bg-white transition-colors"
          >
            อัปโหลดวิดีโอ 15 วินาที — ดู preview จริง
          </button>
        ) : null}
      </div>

      {/* CTA Scene preview — 3 วินาทีท้ายคลิป */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
        <p className="text-xs font-bold text-amber-800 mb-2">ฉาก CTA ท้ายคลิป (3 วินาทีสุดท้าย)</p>
        <div className="flex justify-center">
          <div className="relative w-[120px] rounded-xl overflow-hidden aspect-[9/16] ring-2 ring-amber-300 bg-slate-950">
            <ClipCaptionOverlay
              templateId={selected?.id || "pro_hire"}
              cta={displayCta}
              headline={displayTitle}
              subtitle={displaySub}
              variant="scene"
              size="sm"
            />
          </div>
        </div>
        <p className="text-[10px] text-amber-900/70 text-center mt-2 leading-relaxed">
          ฉากจบแบบ TikTok — จอดำ + โลโก้ AQOND + ปุ่มจ้างงาน
        </p>
      </div>

      {/* Template styles */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-slate-800">เลือกสไตล์แคปชัน</p>
          <p className="text-[10px] text-slate-400">{templates.length} สไตล์</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {templates.map((t) => {
            const active = t.id === selectedId;
            const th = themeOf(t);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={`shrink-0 w-[100px] transition-all ${active ? "scale-[1.02]" : "opacity-85"}`}
              >
                <StyleThumb
                  templateId={t.id}
                  cta={displayCta}
                  headline={displayTitle}
                  subtitle={displaySub}
                  active={active}
                  nameTh={t.nameTh}
                  accent={th.accent}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* AI hint bar */}
      <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5">
        <Wand2 size={14} className="text-violet-400 shrink-0" />
        <p className="text-[11px] text-slate-300 leading-relaxed">
          คลิปสะอาดตลอด · ฉากจ้างงาน + CTA 3 วินาทีท้ายเท่านั้น
        </p>
      </div>
    </div>
  );
};

export default OverlayTemplatePicker;
