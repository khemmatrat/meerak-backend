import React, { useState } from "react";
import {
  BarChart3,
  ChevronRight,
  Loader2,
  MapPin,
  MessageCircle,
  Music2,
  Share2,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import type { PostComposeExtras, PostPollDraft } from "../types/postCompose";
import { SUGGESTED_MUSIC } from "../types/postCompose";
import { PostRemixSettingsPanel } from "./PostRemixSettingsPanel";
import {
  loadPostSharingPrefs,
  savePostSharingPrefs,
} from "../utils/postSharingPrefs";

export interface PostShareComposerProps {
  title?: string;
  preview: React.ReactNode;
  destinationLabel: string;
  /** คำอธิบายใต้ป้ายปลายทาง — เช่น สตอรี่ไม่ขึ้น Video Feed */
  destinationHint?: string;
  extras: PostComposeExtras;
  onExtrasChange: (next: PostComposeExtras) => void;
  onShare: () => void | Promise<void>;
  onBack: () => void;
  sharing?: boolean;
  shareLabel?: string;
  /** วิดีโอสตอรี่ — ตัวเลือกโพสต์ไป Video Feed ด้วย */
  postToVideoFeed?: boolean;
  onPostToVideoFeedChange?: (checked: boolean) => void;
}

export const PostShareComposer: React.FC<PostShareComposerProps> = ({
  title = "โพสต์ใหม่",
  preview,
  destinationLabel,
  extras,
  onExtrasChange,
  onShare,
  onBack,
  sharing = false,
  shareLabel = "แชร์",
  destinationHint,
  postToVideoFeed = false,
  onPostToVideoFeedChange,
}) => {
  const [showPoll, setShowPoll] = useState(false);
  const [showTopic, setShowTopic] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showRemix, setShowRemix] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const sharingPrefs = extras.sharing || loadPostSharingPrefs();

  const patch = (partial: Partial<PostComposeExtras>) =>
    onExtrasChange({ ...extras, ...partial });

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    const list = [...(extras.taggedPeople || []), t].slice(0, 20);
    patch({ taggedPeople: list });
    setTagInput("");
  };

  const initPoll = (): PostPollDraft => ({
    question: extras.poll?.question || "",
    optionA: extras.poll?.optionA || "ใช่",
    optionB: extras.poll?.optionB || "ไม่",
  });

  return (
    <div className="fixed inset-0 z-[200] min-h-[100dvh] bg-white text-slate-900 flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100"
          aria-label="กลับ"
        >
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <h1 className="flex-1 text-center font-semibold text-base pr-8">
          {title}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-3 space-y-1.5">
          <span className="inline-block text-xs font-medium text-fuchsia-700 bg-fuchsia-50 px-2 py-1 rounded-full border border-fuchsia-200">
            {destinationLabel}
          </span>
          {destinationHint ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              {destinationHint}
            </p>
          ) : null}
        </div>

        <div className="px-4 py-3 flex gap-3">
          <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
            {preview}
          </div>
          <textarea
            value={extras.caption}
            onChange={(e) => patch({ caption: e.target.value.slice(0, 2200) })}
            placeholder="เพิ่มคำบรรยาย..."
            rows={4}
            className="flex-1 text-sm outline-none resize-none placeholder:text-slate-400"
          />
        </div>

        <div className="px-4 flex gap-2 flex-wrap pb-2">
          <button
            type="button"
            onClick={() => setShowPoll(true)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium"
          >
            <BarChart3 size={14} />
            โพลล์
          </button>
          <button
            type="button"
            onClick={() => setShowTopic(true)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium"
          >
            <MessageCircle size={14} />
            หัวข้อชวนคุย
          </button>
        </div>

        {extras.poll?.question ? (
          <p className="px-4 text-xs text-slate-500 mb-2">
            โพลล์: {extras.poll.question}
          </p>
        ) : null}
        {extras.conversationTopic ? (
          <p className="px-4 text-xs text-slate-500 mb-2">
            ชวนคุย: {extras.conversationTopic}
          </p>
        ) : null}

        {onPostToVideoFeedChange ? (
          <label className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-950">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={postToVideoFeed}
              onChange={(e) => onPostToVideoFeedChange(e.target.checked)}
            />
            <span>
              <span className="font-semibold">โพสต์ไป Video Feed ด้วย</span>
              <span className="block text-xs text-emerald-800/90 mt-0.5">
                คลิปจะขึ้นฟีดวิดีโอ (ลายน้ำ + ฉากจบ) นอกจากสตอรี่ 24 ชม.
              </span>
            </span>
          </label>
        ) : null}

        <div className="border-t border-slate-100">
          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 text-left"
            onClick={() => {
              const m = SUGGESTED_MUSIC[0];
              patch({ music: extras.music?.trackId === m.trackId ? null : m });
            }}
          >
            <Music2 size={20} className="text-slate-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">เพิ่มเสียง</p>
              {extras.music ? (
                <p className="text-xs text-slate-500 truncate">
                  {extras.music.title}
                  {extras.music.artist ? ` · ${extras.music.artist}` : ""}
                </p>
              ) : null}
            </div>
            <ChevronRight size={18} className="text-slate-400" />
          </button>
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
            {SUGGESTED_MUSIC.map((m) => (
              <button
                key={m.trackId}
                type="button"
                onClick={() =>
                  patch({
                    music: extras.music?.trackId === m.trackId ? null : m,
                  })
                }
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  extras.music?.trackId === m.trackId
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200"
                }`}
              >
                {m.title}
              </button>
            ))}
          </div>

          <RowButton
            icon={<Tag size={20} />}
            label="แท็กผู้คน"
            hint={
              extras.taggedPeople?.length
                ? `${extras.taggedPeople.length} คน`
                : undefined
            }
            onClick={() => setShowTags(true)}
          />
          <RowButton
            icon={<MapPin size={20} />}
            label="เพิ่มตำแหน่ง"
            hint={extras.location}
            onClick={() => setShowLocation(true)}
          />

          <div className="flex items-center gap-3 px-4 py-3.5 border-t border-slate-100">
            <Sparkles size={20} className="text-slate-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">เพิ่มป้าย AI</p>
              <p className="text-[11px] text-slate-500 leading-snug">
                ติดป้ายเมื่อเนื้อหาสร้างด้วย AI ตามนโยบายแพลตฟอร์ม
              </p>
            </div>
            <input
              type="checkbox"
              checked={!!extras.aiLabel}
              onChange={(e) => patch({ aiLabel: e.target.checked })}
              className="h-5 w-5 rounded"
            />
          </div>

          <RowButton
            icon={<ChevronRight size={20} className="rotate-0" />}
            label="การควบคุมรีมิกซ์และดาวน์โหลด"
            onClick={() => setShowRemix(true)}
          />
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-slate-200 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.08)] pb-[max(1rem,env(safe-area-inset-bottom))] mb-16 md:mb-0">
        <button
          type="button"
          disabled={sharing}
          onClick={() => onShare()}
          className="w-full min-h-[52px] py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60 shadow-md"
        >
          {sharing ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <Share2 size={20} />
          )}
          {shareLabel}
        </button>
      </div>

      {/* Poll sheet */}
      <Sheet open={showPoll} onClose={() => setShowPoll(false)} title="โพลล์">
        <PollForm
          poll={extras.poll || initPoll()}
          onChange={(poll) => patch({ poll })}
        />
        <SheetActions
          onClear={() => patch({ poll: null })}
          onDone={() => setShowPoll(false)}
        />
      </Sheet>

      <Sheet
        open={showTopic}
        onClose={() => setShowTopic(false)}
        title="หัวข้อชวนคุย"
      >
        <div className="flex justify-center py-3">
          <div className="bg-white rounded-full px-5 py-3 shadow-md border border-slate-100 flex items-center gap-2">
            <span className="text-slate-400">↩</span>
            <span className="font-semibold text-slate-800 text-sm">
              {extras.conversationTopic || "เพิ่มของคุณบ้าง"}
            </span>
          </div>
        </div>
        <input
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-fuchsia-400/30 outline-none"
          placeholder="เช่น ถามความเห็นเรื่อง..."
          value={extras.conversationTopic || ""}
          onChange={(e) => patch({ conversationTopic: e.target.value })}
          maxLength={120}
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {["เพิ่มของคุณบ้าง", "เล่าเรื่องวันนี้", "แนะนำที่เที่ยว"].map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch({ conversationTopic: s })}
                className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-700"
              >
                {s}
              </button>
            ),
          )}
        </div>
        <SheetActions
          onClear={() => patch({ conversationTopic: undefined })}
          onDone={() => setShowTopic(false)}
        />
      </Sheet>

      <Sheet
        open={showTags}
        onClose={() => setShowTags(false)}
        title="แท็กผู้คน"
      >
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
            placeholder="ชื่อหรือ @username"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 rounded-xl bg-blue-500 text-white text-sm font-medium"
          >
            เพิ่ม
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {(extras.taggedPeople || []).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2 py-1 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() =>
                  patch({
                    taggedPeople: extras.taggedPeople?.filter((x) => x !== t),
                  })
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <SheetActions
          onClear={() => patch({ taggedPeople: [] })}
          onDone={() => setShowTags(false)}
        />
      </Sheet>

      <Sheet
        open={showLocation}
        onClose={() => setShowLocation(false)}
        title="ตำแหน่ง"
      >
        <input
          className="w-full border rounded-xl px-3 py-2 text-sm"
          placeholder="เช่น กรุงเทพฯ, ประเทศไทย"
          value={extras.location || ""}
          onChange={(e) => patch({ location: e.target.value })}
          maxLength={120}
        />
        <SheetActions
          onClear={() => patch({ location: undefined })}
          onDone={() => setShowLocation(false)}
        />
      </Sheet>

      <Sheet
        open={showRemix}
        onClose={() => setShowRemix(false)}
        title="การตั้งค่าแชร์"
        tall
      >
        <PostRemixSettingsPanel
          prefs={sharingPrefs}
          onChange={(p) => {
            savePostSharingPrefs(p);
            patch({ sharing: p });
          }}
          variant="sheet"
        />
        <button
          type="button"
          className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 text-white font-medium"
          onClick={() => setShowRemix(false)}
        >
          บันทึก
        </button>
      </Sheet>
    </div>
  );
};

function RowButton({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 text-left border-t border-slate-100"
    >
      <span className="text-slate-600 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? (
          <p className="text-xs text-slate-500 truncate">{hint}</p>
        ) : null}
      </div>
      <ChevronRight size={18} className="text-slate-400 shrink-0" />
    </button>
  );
}

function Sheet({
  open,
  onClose,
  title,
  tall,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tall?: boolean;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[250] flex items-end bg-black/50">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="ปิด"
      />
      <div
        className={`relative w-full bg-white rounded-t-2xl p-4 ${tall ? "max-h-[80vh] overflow-y-auto" : ""}`}
      >
        <h3 className="font-bold text-center mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function PollForm({
  poll,
  onChange,
}: {
  poll: PostPollDraft;
  onChange: (p: PostPollDraft) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        className="w-full border rounded-xl px-3 py-2 text-sm"
        placeholder="คำถามโพลล์"
        value={poll.question}
        onChange={(e) => onChange({ ...poll, question: e.target.value })}
      />
      <input
        className="w-full border rounded-xl px-3 py-2 text-sm"
        placeholder="ตัวเลือก 1"
        value={poll.optionA}
        onChange={(e) => onChange({ ...poll, optionA: e.target.value })}
      />
      <input
        className="w-full border rounded-xl px-3 py-2 text-sm"
        placeholder="ตัวเลือก 2"
        value={poll.optionB}
        onChange={(e) => onChange({ ...poll, optionB: e.target.value })}
      />
    </div>
  );
}

function SheetActions({
  onClear,
  onDone,
}: {
  onClear: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        type="button"
        onClick={onClear}
        className="flex-1 py-2 text-sm text-slate-600"
      >
        ล้าง
      </button>
      <button
        type="button"
        onClick={onDone}
        className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium"
      >
        เสร็จ
      </button>
    </div>
  );
}
