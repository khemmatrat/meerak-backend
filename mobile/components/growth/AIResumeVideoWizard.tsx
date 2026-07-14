import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  Sparkles,
  User,
  Wand2,
} from "lucide-react";
import type { TalentResumeDraft } from "../../services/talentResumeService";

export type ResumeWizardStep = "assets" | "style" | "script" | "generating" | "done";

export type MoodPreset = {
  id: string;
  label: string;
  character: string;
  hint: string;
};

export const MOOD_PRESETS: MoodPreset[] = [
  { id: "warm", label: "อบอุ่น เป็นกันเอง", character: "man_warm", hint: "เหมาะช่าง/บริการทั่วไป" },
  { id: "pro", label: "มืออาชีพ น่าเชื่อถือ", character: "man_warm", hint: "เหมือน LinkedIn / HeyGen Pro" },
  { id: "calm", label: "สงบ มั่นใจ", character: "man_warm", hint: "งานที่ต้องการความละเอียด" },
  { id: "excited", label: "กระตือรือร้น", character: "man_warm", hint: "โปรโมทตัวเองให้โดดเด่น" },
];

const STEPS: { id: ResumeWizardStep; label: string }[] = [
  { id: "assets", label: "รูป + โปรไฟล์" },
  { id: "style", label: "สไตล์" },
  { id: "script", label: "สคริปต์" },
  { id: "generating", label: "สร้าง" },
  { id: "done", label: "เสร็จ" },
];

export interface AIResumeVideoWizardProps {
  draft: TalentResumeDraft | null;
  displayName: string;
  previewUrl: string | null;
  script: string;
  onScriptChange: (s: string) => void;
  onPickPhoto: (file: File) => void;
  busy: boolean;
  outputUrl: string | null;
  onGenerate: (opts: { character: string }) => void;
  onGenerationFailed?: () => void;
}

export const AIResumeVideoWizard: React.FC<AIResumeVideoWizardProps> = ({
  draft,
  displayName,
  previewUrl,
  script,
  onScriptChange,
  onPickPhoto,
  busy,
  outputUrl,
  onGenerate,
}) => {
  const [step, setStep] = useState<ResumeWizardStep>("assets");
  const [moodId, setMoodId] = useState(MOOD_PRESETS[1].id);
  const mood = MOOD_PRESETS.find((m) => m.id === moodId) || MOOD_PRESETS[1];

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  useEffect(() => {
    if (busy) setStep("generating");
  }, [busy]);

  useEffect(() => {
    if (outputUrl && !busy) setStep("done");
  }, [outputUrl, busy]);
  const canNext =
    step === "assets"
      ? !!previewUrl
      : step === "style"
        ? true
        : step === "script"
          ? script.trim().length >= 20
          : false;

  const goNext = () => {
    if (step === "assets") setStep("style");
    else if (step === "style") setStep("script");
    else if (step === "script") {
      setStep("generating");
      onGenerate({ character: mood.character });
    }
  };

  const goBack = () => {
    if (step === "style") setStep("assets");
    else if (step === "script") setStep("style");
    else if (step === "done") setStep("script");
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-sm font-bold text-slate-900">AI Resume Video</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          ขั้นตอนแบบ HeyGen — รูป → สไตล์ → สคริปต์ → สร้างวิดีโอ
        </p>
        <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-hide">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIndex;
            return (
              <div
                key={s.id}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                  active
                    ? "bg-slate-900 text-white border-slate-900"
                    : done
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-slate-400 border-slate-200"
                }`}
              >
                {done && !active ? <Check size={10} /> : <span>{i + 1}</span>}
                {s.label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {step === "assets" ? (
          <>
            <p className="text-xs text-slate-600 leading-relaxed">
              อัปโหลดรูปใบหน้าชัด 720p+ และตรวจโปรไฟล์ที่ AI ร่างให้ — เหมือนขั้น Product + Avatar ใน HeyGen
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative aspect-[3/4] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden cursor-pointer hover:border-slate-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickPhoto(f);
                  }}
                />
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 p-2 text-center">
                    <Camera size={28} />
                    <span className="text-[11px] font-medium">Avatar</span>
                    <span className="text-[9px]">อัปโหลด / ลากวาง</span>
                  </div>
                )}
                <span className="absolute top-2 left-2 text-[9px] font-bold bg-white/90 px-1.5 py-0.5 rounded">
                  Avatar
                </span>
              </label>

              <div className="aspect-[3/4] rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100 to-white p-3 flex flex-col">
                <span className="text-[9px] font-bold text-slate-500 uppercase">Resume</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
                    {previewUrl ? (
                      <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-full h-full p-2 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{displayName}</p>
                    <p className="text-[10px] text-slate-500 line-clamp-2">{draft?.headline_th || "—"}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-3 line-clamp-4 leading-relaxed flex-1">
                  {draft?.about_th?.slice(0, 120) || "Hermes + Qwen จะเติมโปรไฟล์ให้อัตโนมัติ"}
                </p>
              </div>
            </div>
          </>
        ) : null}

        {step === "style" ? (
          <>
            <p className="text-xs text-slate-600">เลือกอารมณ์การพูด — 4 แบบ (เหมือน Mood ใน HeyGen)</p>
            <div className="grid grid-cols-2 gap-2">
              {MOOD_PRESETS.map((m) => {
                const active = m.id === moodId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMoodId(m.id)}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      active
                        ? "border-slate-900 ring-2 ring-slate-900/10 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <p className="text-xs font-bold">{m.label}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{m.hint}</p>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-[9/16] rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative"
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt=""
                      className="w-full h-full object-cover opacity-90"
                      style={{ filter: i === 1 ? "none" : "grayscale(20%)" }}
                    />
                  ) : null}
                  {i === 1 ? (
                    <span className="absolute inset-0 ring-2 ring-indigo-500 rounded-lg pointer-events-none" />
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {step === "script" ? (
          <>
            <div className="flex gap-3">
              <div className="w-24 shrink-0 aspect-[9/16] rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-2">
                  <Sparkles size={12} className="text-violet-500" />
                  สคริปต์ (Qwen · แก้ได้)
                </label>
                <textarea
                  value={script}
                  onChange={(e) => onScriptChange(e.target.value.slice(0, 500))}
                  rows={7}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder="สวัสดีครับ ผมพร้อมรับงาน…"
                />
                <p className="text-[10px] text-slate-400 mt-1 text-right">{script.length}/500 · ~15 วิ</p>
              </div>
            </div>
          </>
        ) : null}

        {step === "generating" ? (
          <>
            <p className="text-xs text-slate-600 text-center">
              การสร้างวิดีโออาจใช้เวลาประมาณ 60 วินาที…
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-[9/16] rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center"
                >
                  <Loader2 className="animate-spin text-slate-400" size={22} />
                </div>
              ))}
            </div>
          </>
        ) : null}

        {step === "done" && outputUrl ? (
          <div className="rounded-xl overflow-hidden border border-slate-200 bg-black">
            <video src={outputUrl} controls playsInline className="w-full aspect-[9/16] max-h-80 object-contain mx-auto" />
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
        <button
          type="button"
          onClick={goBack}
          disabled={step === "assets" || step === "generating" || busy}
          className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-40 flex items-center gap-1"
        >
          <ArrowLeft size={14} />
          ย้อนกลับ
        </button>

        {step === "script" ? (
          <button
            type="button"
            disabled={!canNext || busy}
            onClick={goNext}
            className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            <Wand2 size={16} />
            สร้างวิดีโอ
          </button>
        ) : step === "assets" || step === "style" ? (
          <button
            type="button"
            disabled={!canNext}
            onClick={goNext}
            className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            ถัดไป
            <ArrowRight size={14} />
          </button>
        ) : step === "generating" ? (
          <span className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="animate-spin" size={14} />
            กำลังสร้าง…
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default AIResumeVideoWizard;
