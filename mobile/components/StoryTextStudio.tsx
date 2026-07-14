import React, { useMemo, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronLeft,
  MessageCircle,
  Palette,
  Share2,
  Type,
  X,
} from "lucide-react";
import {
  STORY_GRADIENTS,
  TEXT_COLORS,
  type TextFontStyle,
  type TextStoryRenderOptions,
} from "../utils/storyTextCanvas";

export type StoryTextMode = "plain" | "chat";

export interface StoryTextStudioValue {
  text: string;
  mode: StoryTextMode;
  chatPrompt: string;
  bgIndex: number;
  fontStyle: TextFontStyle;
  textColor: string;
  textAlign: "center" | "left" | "right";
}

export interface StoryTextStudioProps {
  mode: StoryTextMode;
  value: StoryTextStudioValue;
  onChange: (v: StoryTextStudioValue) => void;
  onNext: (v: StoryTextStudioValue) => void;
  onBack: () => void;
  onClose: () => void;
}

const FONT_OPTIONS: { id: TextFontStyle; label: string; sample: string }[] = [
  { id: "modern", label: "Modern", sample: "Aa" },
  { id: "classic", label: "Classic", sample: "Aa" },
  { id: "signature", label: "Signature", sample: "Aa" },
];

const CHAT_STARTERS = [
  "เพิ่มของคุณบ้าง",
  "ถามอะไรก็ได้",
  "เล่าเรื่องวันนี้",
  "แนะนำที่เที่ยว",
];

export function storyTextToRenderOptions(
  v: StoryTextStudioValue,
): TextStoryRenderOptions {
  return {
    bgIndex: v.bgIndex,
    fontStyle: v.fontStyle,
    textColor: v.textColor,
    textAlign: v.textAlign,
    // chatPrompt เป็นคำแนะนำใน composer เท่านั้น — ไม่วาดลง PNG
  };
}

/** ข้อความหลักที่จะ bake ลงรูปสตอรี่ */
export function storyTextForExport(v: StoryTextStudioValue): string {
  if (v.mode === "chat") {
    return v.text.trim() || v.chatPrompt.trim();
  }
  return v.text.trim();
}

export const StoryTextStudio: React.FC<StoryTextStudioProps> = ({
  mode,
  value,
  onChange,
  onNext,
  onBack,
  onClose,
}) => {
  const [showColors, setShowColors] = useState(false);
  const patch = (p: Partial<StoryTextStudioValue>) =>
    onChange({ ...value, ...p });

  const [g0, g1] = STORY_GRADIENTS[value.bgIndex % STORY_GRADIENTS.length];
  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(145deg, ${g0} 0%, ${g1} 100%)`,
    }),
    [g0, g1],
  );

  const fontClass =
    value.fontStyle === "classic"
      ? "font-serif"
      : value.fontStyle === "signature"
        ? "italic font-[cursive]"
        : "font-sans font-bold";

  const alignClass =
    value.textAlign === "left"
      ? "text-left"
      : value.textAlign === "right"
        ? "text-right"
        : "text-center";

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <header className="flex items-center justify-between px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/10 bg-black/90 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-white hover:bg-white/10"
          aria-label="ปิด"
        >
          <X size={22} />
        </button>
        <h1 className="text-white font-semibold text-base">
          {mode === "chat" ? "ชวนคุย" : "ข้อความ"}
        </h1>
        <button
          type="button"
          onClick={() => onNext(value)}
          className="text-sm font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 rounded-full shadow-md"
        >
          ถัดไป
        </button>
      </header>

      {/* 9:16 preview */}
      <div className="flex-1 flex items-center justify-center px-6 py-2 min-h-0">
        <div
          className="w-full max-w-[280px] aspect-[9/16] rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-center p-6 relative ring-1 ring-white/20"
          style={previewStyle}
        >
          {mode === "chat" ? (
            <div className="flex flex-col items-center gap-6 w-full">
              <div className="relative">
                <span className="absolute -top-2 -left-3 w-2 h-2 rounded-full bg-rose-400" />
                <span className="absolute -bottom-1 -right-2 w-2.5 h-2.5 rounded-full bg-violet-400" />
                <span className="absolute top-1/2 -right-5 w-1.5 h-1.5 rounded-full bg-amber-300" />
                <div className="bg-white/95 text-slate-900 rounded-full px-6 py-3.5 shadow-lg flex items-center gap-2 min-w-[200px] justify-center">
                  <span className="text-slate-400 text-lg">↩</span>
                  <span className="font-semibold text-base truncate max-w-[180px]">
                    {value.chatPrompt || "เพิ่มของคุณบ้าง"}
                  </span>
                </div>
              </div>
              <textarea
                value={value.text}
                onChange={(e) => patch({ text: e.target.value })}
                placeholder="ข้อความที่จะแสดงบนสตอรี่"
                maxLength={200}
                rows={2}
                className={`w-full bg-transparent outline-none resize-none placeholder:text-white/50 text-lg ${fontClass} ${alignClass}`}
                style={{ color: value.textColor }}
              />
            </div>
          ) : (
            <textarea
              value={value.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder="แตะเพื่อพิมพ์"
              maxLength={500}
              className={`w-full h-full min-h-[120px] bg-transparent outline-none resize-none placeholder:text-white/40 text-2xl leading-snug ${fontClass} ${alignClass}`}
              style={{ color: value.textColor }}
            />
          )}
        </div>
      </div>

      {/* Font row — IG style */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => patch({ fontStyle: f.id })}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm transition ${
                value.fontStyle === f.id
                  ? "bg-white text-slate-900 font-semibold"
                  : "bg-white/10 text-white/80"
              } ${f.id === "signature" ? "italic font-[cursive]" : f.id === "classic" ? "font-serif" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-zinc-900/95 border-t border-white/10 px-4 py-3 pb-safe space-y-3">
        {mode === "chat" && (
          <p className="text-[11px] text-white/50 text-center">
            สติกเกอร์ด้านบนเป็นตัวอย่างในแอปเท่านั้น —
            สตอรี่ที่โพสต์จะแสดงเฉพาะข้อความที่คุณพิมพ์
          </p>
        )}

        {mode === "chat" && (
          <div className="flex gap-2 overflow-x-auto">
            {CHAT_STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch({ chatPrompt: s })}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border ${
                  value.chatPrompt === s
                    ? "bg-white text-slate-900 border-white"
                    : "border-white/30 text-white/80"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {mode === "chat" && (
          <input
            type="text"
            value={value.chatPrompt}
            onChange={(e) => patch({ chatPrompt: e.target.value })}
            placeholder="ตัวอย่างใน composer (ไม่ติดไปกับสตอรี่)"
            maxLength={48}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-fuchsia-400/50"
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <ToolBtn
              active={value.fontStyle === "modern"}
              onClick={() =>
                patch({
                  fontStyle:
                    value.fontStyle === "modern"
                      ? "classic"
                      : value.fontStyle === "classic"
                        ? "signature"
                        : "modern",
                })
              }
              label="Aa"
              icon={<Type size={18} />}
            />
            <ToolBtn
              active={showColors}
              onClick={() => setShowColors((s) => !s)}
              label="สี"
              icon={<Palette size={18} />}
            />
            <ToolBtn
              onClick={() =>
                patch({
                  textAlign:
                    value.textAlign === "center"
                      ? "left"
                      : value.textAlign === "left"
                        ? "right"
                        : "center",
                })
              }
              label="จัด"
              icon={
                value.textAlign === "left" ? (
                  <AlignLeft size={18} />
                ) : value.textAlign === "right" ? (
                  <AlignRight size={18} />
                ) : (
                  <AlignCenter size={18} />
                )
              }
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto max-w-[50%]">
            {STORY_GRADIENTS.map(([a, b], i) => (
              <button
                key={`${a}-${b}`}
                type="button"
                onClick={() => patch({ bgIndex: i })}
                className={`shrink-0 w-8 h-8 rounded-full border-2 ${
                  value.bgIndex === i
                    ? "border-white scale-110"
                    : "border-transparent"
                }`}
                style={{
                  background: `linear-gradient(135deg, ${a}, ${b})`,
                }}
                aria-label={`พื้นหลัง ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {showColors && (
          <div className="flex gap-2 flex-wrap">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patch({ textColor: c })}
                className={`w-9 h-9 rounded-full border-2 ${
                  value.textColor === c
                    ? "border-fuchsia-400"
                    : "border-white/20"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onNext(value)}
          className="w-full min-h-[52px] flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white font-bold text-base shadow-lg shadow-fuchsia-950/40 active:scale-[0.98] transition-transform"
        >
          <Share2 size={22} strokeWidth={2.25} />
          แชร์สตอรี่
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center justify-center gap-1 text-white/60 text-xs py-2 hover:text-white/90"
        >
          <ChevronLeft size={14} /> กลับไปเลือกสื่อ
        </button>
      </div>
    </div>
  );
};

function ToolBtn({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl ${
        active ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10"
      }`}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

/** การ์ดชวนคุยบนหน้าเลือกสื่อ — แบบ IG */
export const StoryQuickChatCard: React.FC<{ onClick: () => void }> = ({
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="shrink-0 w-[108px] aspect-[3/4] rounded-2xl bg-zinc-800/90 border border-zinc-600/50 p-2 flex flex-col items-center justify-center gap-2 hover:border-fuchsia-500/40 transition"
  >
    <div className="relative w-full flex-1 flex items-center justify-center">
      <span className="absolute top-2 left-3 w-1.5 h-1.5 rounded-full bg-rose-400" />
      <span className="absolute bottom-3 right-2 w-2 h-2 rounded-full bg-violet-400" />
      <div className="bg-white rounded-full px-3 py-2 shadow-md flex items-center gap-1 max-w-full">
        <MessageCircle size={12} className="text-slate-400 shrink-0" />
        <span className="text-[9px] font-semibold text-slate-800 truncate">
          เพิ่มของคุณบ้าง
        </span>
      </div>
    </div>
    <span className="text-[11px] text-white/80 font-medium">ชวนคุย</span>
  </button>
);
