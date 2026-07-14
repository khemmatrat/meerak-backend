import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Type, Camera, Loader2, Share2 } from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { storyService } from "../services/storyService";
import { videoService } from "../services/videoService";
import { BG_COLORS, renderTextStoryToBlob } from "../utils/storyTextCanvas";

type Mode = "picker" | "text" | "preview";

const MAX_VIDEO_SEC = 60;
const MAX_IMAGE_MB = 12;

export const StoryCreate: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("picker");
  const [text, setText] = useState("");
  const [bgIndex, setBgIndex] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | "text">(
    "image",
  );
  const [caption, setCaption] = useState("");
  const [postToFeed, setPostToFeed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [recentThumbs, setRecentThumbs] = useState<{
    id: string;
    url: string;
    file?: File;
  }>([]);

  const revokePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  const setFilePreview = (file: File) => {
    revokePreview();
    const isVideo = file.type.startsWith("video/");
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        if (v.duration > MAX_VIDEO_SEC) {
          notify(`วิดีโอยาวเกิน ${MAX_VIDEO_SEC} วินาที`, "warning");
          return;
        }
        setMediaType("video");
        setPendingFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setMode("preview");
      };
      v.src = URL.createObjectURL(file);
    } else {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        notify(`รูปใหญ่เกิน ${MAX_IMAGE_MB}MB`, "warning");
        return;
      }
      setMediaType("image");
      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setMode("preview");
    }
    const thumbUrl = URL.createObjectURL(file);
    setRecentThumbs((prev) => {
      const next = [
        { id: `${Date.now()}`, url: thumbUrl, file },
        ...prev,
      ].slice(0, 12);
      return next;
    });
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      notify("รองรับเฉพาะรูปหรือวิดีโอ", "warning");
      return;
    }
    setFilePreview(file);
  };

  const shareTextStory = async () => {
    if (!text.trim()) {
      notify("พิมพ์ข้อความก่อนแชร์", "warning");
      return;
    }
    setSharing(true);
    try {
      const blob = await renderTextStoryToBlob(text, bgIndex);
      await storyService.createStory({
        file: blob,
        mediaType: "text",
        textOverlay: text.trim(),
        backgroundStyle: { bg: BG_COLORS[bgIndex % BG_COLORS.length] },
        filename: "story-text.jpg",
      });
      notify("แชร์สตอรี่แล้ว", "success");
      navigate("/", { replace: true });
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      notify(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "แชร์ไม่สำเร็จ",
        "error",
      );
    } finally {
      setSharing(false);
    }
  };

  const shareMediaStory = async () => {
    if (!pendingFile) {
      notify("เลือกรูปหรือวิดีโอก่อน", "warning");
      return;
    }
    setSharing(true);
    try {
      await storyService.createStory({
        file: pendingFile,
        mediaType,
        textOverlay: caption.trim() || undefined,
      });
      if (postToFeed && mediaType === "video") {
        try {
          await videoService.upload(
            pendingFile,
            caption.slice(0, 120) || "สตอรี่",
            caption || "",
          );
          notify("แชร์สตอรี่และส่งไป Video Feed แล้ว", "success");
        } catch {
          notify("สตอรี่สำเร็จ แต่ส่ง Video Feed ไม่สำเร็จ", "warning");
        }
      } else {
        notify("แชร์สตอรี่แล้ว", "success");
      }
      navigate("/", { replace: true });
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      notify(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "แชร์ไม่สำเร็จ",
        "error",
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          type="button"
          onClick={() => {
            if (mode !== "picker") setMode("picker");
            else navigate(-1);
          }}
          className="p-2 rounded-full hover:bg-white/10"
          aria-label="ปิด"
        >
          <X size={24} />
        </button>
        <h1 className="font-semibold text-base">เพิ่มลงในสตอรี่</h1>
        <div className="w-10" />
      </header>

      {mode === "picker" && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              type="button"
              onClick={() => setMode("text")}
              className="flex items-center gap-2 shrink-0 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium"
            >
              <Type size={18} />
              ข้อความ
            </button>
          </div>

          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-sm text-white/70">ล่าสุด</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-blue-400"
            >
              เลือกไฟล์
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="aspect-[3/4] bg-zinc-800 flex flex-col items-center justify-center gap-2 rounded-sm"
            >
              <Camera size={32} className="text-white/80" />
              <span className="text-xs text-white/60">กล้อง</span>
            </button>
            {recentThumbs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => t.file && setFilePreview(t.file)}
                className="aspect-[3/4] bg-zinc-900 overflow-hidden rounded-sm"
              >
                {t.file?.type.startsWith("video/") ? (
                  <video
                    src={t.url}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={t.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {mode === "text" && (
        <div className="flex-1 flex flex-col p-4">
          <div
            className="flex-1 rounded-2xl flex items-center justify-center p-6 mb-4"
            style={{ background: BG_COLORS[bgIndex % BG_COLORS.length] }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="พิมพ์ข้อความ..."
              maxLength={500}
              className="w-full h-full min-h-[200px] bg-transparent text-white text-center text-2xl font-bold placeholder:text-white/50 outline-none resize-none"
            />
          </div>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {BG_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setBgIndex(i)}
                className={`w-10 h-10 rounded-full shrink-0 border-2 ${i === bgIndex ? "border-white" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={sharing}
            onClick={shareTextStory}
            className="w-full py-3 rounded-full bg-blue-500 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {sharing ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Share2 size={20} />
            )}
            แชร์สตอรี่
          </button>
        </div>
      )}

      {mode === "preview" && previewUrl && (
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 relative bg-black flex items-center justify-center">
            {mediaType === "video" ? (
              <video
                src={previewUrl}
                className="max-h-full max-w-full object-contain"
                controls
                playsInline
              />
            ) : (
              <img
                src={previewUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
          <div className="p-4 space-y-3 bg-gradient-to-t from-black to-transparent">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="เพิ่มคำบรรยาย (ไม่บังคับ)"
              className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-white/40"
            />
            {mediaType === "video" && (
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={postToFeed}
                  onChange={(e) => setPostToFeed(e.target.checked)}
                  className="rounded"
                />
                โพสต์ไป Video Feed ด้วย (ลายน้ำ + ฉากจบ)
              </label>
            )}
            <button
              type="button"
              disabled={sharing}
              onClick={shareMediaStory}
              className="w-full py-3 rounded-full bg-blue-500 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {sharing ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Share2 size={20} />
              )}
              แชร์สตอรี่
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryCreate;
