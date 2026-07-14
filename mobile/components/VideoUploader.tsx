/**
 * VideoUploader — อัปโหลดคลิปผลงาน (Provider/Talent)
 * โฟลว์ธรรมดา: เลือกไฟล์แล้วอัปโหลดทันที • โฟลว์ publishFlow: เลือกไฟล์เก็บไว้ กดเผยแพร่ค่อยอัปโหลดและไปฟีด
 */
import React, { useState, useRef, useId } from "react";
import { useNavigate } from "react-router-dom";
import { videoService, type TalentVideo } from "../services/videoService";
import { Upload, Loader2, FileVideo } from "lucide-react";

interface VideoUploaderProps {
  onSuccess?: (video: TalentVideo) => void;
  onError?: (msg: string) => void;
  /** ถ้า true จะ navigate ไป video-feed พร้อมคลิปใหม่ */
  navigateToFeedOnSuccess?: boolean;
  /** e.g. Profile → Story upload: เพื่อแสดง onboarding ครั้งแรกบน Feed (ควบคู่ navigate state) */
  fromStoryUpload?: boolean;
  /**
   * true = เลือกไฟล์แค่เก็บไว้ — ให้ผู้ใช้กรอกชื่อและคำอธิบายครบ เลือกกด 「เผยแพร่」 ค่อยอัปโหลดและไปฟีด (แนะนำแท็บ Story)
   */
  publishFlow?: boolean;
}

function formatMb(bytes: number) {
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onSuccess,
  onError,
  navigateToFeedOnSuccess = true,
  fromStoryUpload,
  publishFlow = false,
}) => {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "sending" | "processing"
  >("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldIds = useId();

  const runUpload = async (file: File) => {
    setUploadPhase("sending");
    setUploadPct(0);
    const res = await videoService.upload(
      file,
      title || undefined,
      desc || undefined,
      {
        onUploadProgress: (pct) => setUploadPct(pct),
      },
    );
    if (res?.job_id || res?.status === "processing") {
      setUploadPhase("processing");
      setUploadPct(100);
    }
    const video = res?.video;
    if (video) {
      onSuccess?.(video);
      if (navigateToFeedOnSuccess) {
        navigate("/video-feed", {
          state: {
            initialVideo: video,
            ...(fromStoryUpload ? { fromStoryUpload: true } : {}),
          },
        });
      }
      if (publishFlow) {
        setPendingFile(null);
        setTitle("");
        setDesc("");
      }
    } else {
      onError?.("อัปโหลดสำเร็จแต่ไม่ได้รับข้อมูลคลิป");
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      onError?.("กรุณาเลือกไฟล์วิดีโอ (MP4, WebM)");
      return;
    }
    const maxBytes = 100 * 1024 * 1024;
    if (file.size > maxBytes) {
      onError?.("ไฟล์ใหญ่เกิน 100MB — ลดความยาวหรือความละเอียดแล้วลองใหม่");
      return;
    }
    if (publishFlow) {
      setPendingFile(file);
      return;
    }
    setUploading(true);
    try {
      await runUpload(file);
    } catch (err: any) {
      onError?.(
        err?.response?.data?.error || err?.message || "อัปโหลดไม่สำเร็จ",
      );
    } finally {
      setUploading(false);
      setUploadPhase("idle");
      setUploadPct(0);
    }
  };

  const publish = async () => {
    if (!pendingFile) {
      onError?.("กรุณาเลือกคลิปวิดีโอก่อนเผยแพร่");
      return;
    }
    setUploading(true);
    try {
      await runUpload(pendingFile);
    } catch (err: any) {
      onError?.(
        err?.response?.data?.error || err?.message || "อัปโหลดไม่สำเร็จ",
      );
    } finally {
      setUploading(false);
      setUploadPhase("idle");
      setUploadPct(0);
    }
  };

  const labelCls = publishFlow
    ? "block text-sm font-semibold text-slate-800 mb-1.5"
    : "block text-sm font-medium text-slate-300 mb-1";
  const fieldCls = publishFlow
    ? "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] leading-snug text-slate-900 placeholder:text-slate-500 shadow-inner outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
    : "w-full border border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-slate-800/50 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50";
  const pickVideoBtnCls = publishFlow
    ? "w-full flex min-h-[5.75rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 px-4 py-4 text-emerald-950 shadow-inner transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50"
    : "w-full flex items-center justify-center gap-2 py-5 border-2 border-dashed rounded-2xl border-amber-500/65 text-amber-700 bg-amber-50/90 hover:bg-amber-100/95 hover:border-amber-600 disabled:opacity-50 font-semibold text-sm shadow-sm transition-all";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${fieldIds}-title`} className={labelCls}>
          หัวข้อคลิป
        </label>
        <input
          id={`${fieldIds}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น คลิปล้างแอร์"
          className={fieldCls}
        />
      </div>
      <div>
        <label htmlFor={`${fieldIds}-desc`} className={labelCls}>
          คำอธิบายคลิป
        </label>
        <textarea
          id={`${fieldIds}-desc`}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="เช่น แสดงเทคนิคการล้างแอร์"
          rows={2}
          className={
            publishFlow
              ? `${fieldCls} resize-none leading-relaxed`
              : `${fieldCls} resize-none`
          }
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleFileInput}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={
          `${pickVideoBtnCls} ` +
          (publishFlow ? "font-semibold text-[15px]" : "")
        }
      >
        {uploading && !publishFlow ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            กำลังอัปโหลดและประมวลผล (ติดลายน้ำ)...
          </>
        ) : publishFlow ? (
          <>
            <Upload size={22} strokeWidth={2} className="text-emerald-800" />
            {pendingFile
              ? "เปลี่ยนคลิปวิดีโอ"
              : "เลือกคลิปวิดีโอ (เก็บไว้ในเครื่อง ยังไม่อัปโหลด)"}
          </>
        ) : (
          <>
            <Upload size={20} />
            เลือกคลิปวิดีโอเพื่ออัปโหลด
          </>
        )}
      </button>
      {publishFlow && pendingFile && !uploading && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm">
          <FileVideo className="shrink-0 text-emerald-700 mt-0.5" size={22} />
          <div className="min-w-0 flex-1">
            <p
              className="font-semibold text-slate-900 truncate"
              title={pendingFile.name}
            >
              {pendingFile.name}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              พร้อมเผยแพร่ — ขนาดประมาณ {formatMb(pendingFile.size)}
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-rose-700 hover:text-rose-800 underline underline-offset-2"
              onClick={() => setPendingFile(null)}
            >
              เลิกเลือกคลิปนี้
            </button>
          </div>
        </div>
      )}
      {publishFlow && uploading && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm font-semibold text-emerald-950">
            <span>
              {uploadPhase === "processing"
                ? "กำลังติดลายน้ำและฉากจบ..."
                : "กำลังส่งคลิปขึ้นเซิร์ฟเวอร์..."}
            </span>
            <span>{uploadPhase === "sending" ? `${uploadPct}%` : "…"}</span>
          </div>
          <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{
                width: `${uploadPhase === "processing" ? 100 : uploadPct}%`,
              }}
            />
          </div>
          <p className="text-xs text-emerald-900/80">
            อย่าปิดหน้าจอ — คลิป ~
            {pendingFile ? formatMb(pendingFile.size) : ""}{" "}
            อาจใช้เวลาหลายนาทีบนมือถือ
          </p>
        </div>
      )}
      {publishFlow && (
        <button
          type="button"
          onClick={() => void publish()}
          disabled={uploading || !pendingFile}
          className={`w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-bold text-[15px] shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            uploading || !pendingFile
              ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
              : "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={20} className="animate-spin text-white" />
              <span className="text-white">กำลังอัปโหลด...</span>
            </>
          ) : (
            <span className="text-white">เผยแพร่ไปที่ Video Feed</span>
          )}
        </button>
      )}
      <p
        className={
          publishFlow
            ? "text-[13px] text-slate-600 leading-relaxed"
            : "text-xs text-slate-400 leading-relaxed"
        }
      >
        {publishFlow ? (
          <>
            ขั้นตอน เลือกคลิป → ปรับหัวข้อและคำอธิบายได้ตามชอบ → กด
            「เผยแพร่ไปที่ Video Feed」 ระบบจึงจะส่งและพาเข้าฟีด
            พร้อมหัวข้อและคำอธิบายที่ระบุ
          </>
        ) : (
          <>
            เลือกไฟล์แล้วจะเริ่มอัปโหลดทันที — หลังสำเร็จจะไปหน้า Video Feed
            (เมื่อเป็นโฟลว์นี้ แนะนำกรอกหัวข้อและคำอธิบายก่อนเลือกคลิป)
          </>
        )}
      </p>
    </div>
  );
};
