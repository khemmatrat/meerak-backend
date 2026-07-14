import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Camera,
  ChevronLeft,
  Film,
  Loader2,
  MessageCircle,
  Music2,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { PostTypeChooser } from "../components/PostTypeChooser";
import { PostShareComposer } from "../components/PostShareComposer";
import { PostSharingInfoModal } from "../components/PostSharingInfoModal";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { storyService, type UserStory } from "../services/storyService";
import { videoService } from "../services/videoService";
import { notifyStoriesChanged } from "../utils/storyEvents";
import { resolveStoryViewerUserId } from "../utils/storyUserId";
import type { PostComposeExtras, PostDestination } from "../types/postCompose";
import {
  STORY_GRADIENTS,
  renderTextStoryToBlob,
} from "../utils/storyTextCanvas";
import {
  StoryQuickChatCard,
  StoryTextStudio,
  storyTextToRenderOptions,
  storyTextForExport,
  type StoryTextStudioValue,
} from "../components/StoryTextStudio";
import {
  buildStoryBackgroundStyle,
  hasSeenSharingInfoModal,
  loadPostSharingPrefs,
  markSharingInfoModalSeen,
} from "../utils/postSharingPrefs";

type StoryStep = "pick" | "text" | "compose";
type FeedStep = "pick" | "compose";

const MAX_VIDEO_SEC = 60;
const MAX_IMAGE_MB = 12;

const emptyExtras = (): PostComposeExtras => ({
  caption: "",
  sharing: loadPostSharingPrefs(),
});

export const PostCreate: React.FC = () => {
  const [params] = useSearchParams();
  const type = (params.get("type") as PostDestination | null) || null;
  const navigate = useNavigate();
  const { notify } = useNotification();

  if (!type) {
    return (
      <div className="min-h-[60vh] -mx-4 sm:-mx-6 px-4 sm:px-6 py-6 rounded-2xl bg-slate-900/95 text-white">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1 text-slate-300 text-sm hover:text-white"
        >
          <ChevronLeft size={18} /> กลับ
        </button>
        <PostTypeChooser variant="full" />
      </div>
    );
  }

  if (type === "story") {
    return <StoryPostFlow onExit={() => navigate(-1)} />;
  }

  return <FeedPostFlow onExit={() => navigate(-1)} />;
};

function StoryPostFlow({ onExit }: { onExit: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotification();
  const [postToVideoFeed, setPostToVideoFeed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<StoryStep>("pick");
  const [textStudioMode, setTextStudioMode] = useState<"plain" | "chat">(
    "plain",
  );
  const [textStudio, setTextStudio] = useState<StoryTextStudioValue>({
    text: "",
    mode: "plain",
    chatPrompt: "เพิ่มของคุณบ้าง",
    bgIndex: 0,
    fontStyle: "modern",
    textColor: "#ffffff",
    textAlign: "center",
  });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | "text">(
    "image",
  );
  const [extras, setExtras] = useState<PostComposeExtras>(emptyExtras);
  const [sharing, setSharing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(!hasSeenSharingInfoModal());
  const [recentThumbs, setRecentThumbs] = useState<
    { id: string; url: string; file?: File }[]
  >([]);

  const setFilePreview = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const isVideo = file.type.startsWith("video/");
    const done = (url: string) => {
      setMediaType(isVideo ? "video" : "image");
      setPendingFile(file);
      setPreviewUrl(url);
      setStep("compose");
    };
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        if (v.duration > MAX_VIDEO_SEC) {
          notify(`วิดีโอยาวเกิน ${MAX_VIDEO_SEC} วินาที`, "warning");
          return;
        }
        done(URL.createObjectURL(file));
      };
      v.src = URL.createObjectURL(file);
    } else {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        notify(`รูปใหญ่เกิน ${MAX_IMAGE_MB}MB`, "warning");
        return;
      }
      done(URL.createObjectURL(file));
    }
    setRecentThumbs((prev) =>
      [
        { id: `${Date.now()}`, url: URL.createObjectURL(file), file },
        ...prev,
      ].slice(0, 12),
    );
  };

  const shareStory = async () => {
    setSharing(true);
    try {
      const [g0, g1] =
        STORY_GRADIENTS[textStudio.bgIndex % STORY_GRADIENTS.length];
      const bgStyle = buildStoryBackgroundStyle({
        bg: mediaType === "text" ? g0 : undefined,
        poll: extras.poll || undefined,
        music: extras.music || undefined,
        conversationTopic:
          textStudio.mode === "chat"
            ? textStudio.chatPrompt
            : extras.conversationTopic,
        taggedPeople: extras.taggedPeople,
        location: extras.location,
        aiLabel: extras.aiLabel,
        sharing: extras.sharing || loadPostSharingPrefs(),
        ...(mediaType === "text"
          ? {
              font_style: textStudio.fontStyle,
              text_color: textStudio.textColor,
              text_align: textStudio.textAlign,
              gradient: [g0, g1],
              chat_mode: textStudio.mode === "chat",
            }
          : {}),
      });
      const caption = extras.caption.trim();
      let created: { story: UserStory } | null = null;

      if (step === "compose" && pendingFile) {
        created = await storyService.createStory({
          file: pendingFile,
          mediaType,
          textOverlay: caption || undefined,
          backgroundStyle: bgStyle,
        });
        if (postToVideoFeed && mediaType === "video") {
          try {
            await videoService.upload(
              pendingFile,
              caption.slice(0, 120) || "สตอรี่",
              caption || "",
            );
            notify(
              "แชร์สตอรี่แล้ว และส่งคลิปไป Video Feed — รอประมวลผลลายน้ำ",
              "success",
            );
          } catch {
            notify(
              "สตอรี่ขึ้นแล้ว แต่ส่ง Video Feed ไม่สำเร็จ — ลองอัปโหลดจากแท็บคลิปผลงาน",
              "warning",
            );
          }
        } else {
          notify(
            "แชร์สตอรี่แล้ว — ดูที่วง「สตอรี่ของคุณ」บนหน้าแรก",
            "success",
          );
        }
      } else if (mediaType === "text") {
        const exportText = storyTextForExport(textStudio);
        if (!exportText) {
          notify("พิมพ์ข้อความหรือเลือกหัวข้อชวนคุยก่อนแชร์", "warning");
          return;
        }
        const blob = await renderTextStoryToBlob(
          exportText,
          storyTextToRenderOptions(textStudio),
        );
        created = await storyService.createStory({
          file: blob,
          mediaType: "text",
          textOverlay: exportText,
          backgroundStyle: bgStyle,
          filename: "story-text.jpg",
        });
        notify(
          "แชร์สตอรี่แล้ว — ดูที่วง「สตอรี่ของคุณ」บนหน้าแรก (ไม่ขึ้น Video Feed)",
          "success",
        );
      } else {
        notify(
          "ไม่พบสื่อที่จะแชร์ — กลับไปเลือกรูป/วิดีโอหรือข้อความ",
          "warning",
        );
        return;
      }

      if (!created?.story?.id) {
        throw new Error(
          "เซิร์ฟเวอร์ไม่บันทึกสตอรี่ — ตรวจ log backend หรือ S3 (AWS_*)",
        );
      }

      markSharingInfoModalSeen();
      notifyStoriesChanged();
      const viewId =
        String(created.story.user_id || "").trim() ||
        resolveStoryViewerUserId(null, user?.id);
      if (viewId) {
        navigate(`/stories/view/${encodeURIComponent(viewId)}`, {
          replace: true,
          state: {
            preloadedStories: [created.story],
            userName: user?.name || user?.email,
          },
        });
      } else {
        navigate("/", { replace: true });
      }
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

  if (step === "text") {
    const studio = (
      <StoryTextStudio
        mode={textStudioMode}
        value={{ ...textStudio, mode: textStudioMode }}
        onChange={(v) => {
          setTextStudio(v);
          setTextStudioMode(v.mode);
        }}
        onNext={(v) => {
          setTextStudio(v);
          setTextStudioMode(v.mode);
          setMediaType("text");
          setExtras((e) => ({
            ...e,
            conversationTopic:
              v.mode === "chat" ? v.chatPrompt : e.conversationTopic,
          }));
          setStep("compose");
        }}
        onBack={() => setStep("pick")}
        onClose={onExit}
      />
    );
    return typeof document !== "undefined"
      ? createPortal(studio, document.body)
      : studio;
  }

  if (step === "compose") {
    const [g0, g1] =
      STORY_GRADIENTS[textStudio.bgIndex % STORY_GRADIENTS.length];
    const composer = (
      <>
        <PostShareComposer
          title="โพสต์ใหม่"
          destinationLabel="สตอรี่ · หมดอายุใน 24 ชม."
          preview={
            mediaType === "video" && previewUrl ? (
              <video
                src={previewUrl}
                className="w-full h-full object-cover"
                muted
              />
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : mediaType === "text" ? (
              <div
                className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center"
                style={{
                  background: `linear-gradient(145deg, ${g0}, ${g1})`,
                  color: textStudio.textColor,
                }}
              >
                {textStudio.mode === "chat" ? (
                  <span className="bg-white text-slate-900 text-[8px] font-semibold rounded-full px-2 py-0.5 mb-1 truncate max-w-full">
                    {textStudio.chatPrompt}
                  </span>
                ) : null}
                <span className="text-[9px] font-bold line-clamp-3">
                  {(textStudio.text || "Aa").slice(0, 36)}
                </span>
              </div>
            ) : (
              <div className="w-full h-full bg-slate-300" />
            )
          }
          extras={extras}
          onExtrasChange={setExtras}
          onShare={shareStory}
          onBack={() =>
            mediaType === "text" ? setStep("text") : setStep("pick")
          }
          sharing={sharing}
          shareLabel="แชร์สตอรี่"
          destinationHint="สตอรี่แสดงที่แถววงบนหน้าแรก 24 ชม. — ข้อความ/ชวนคุยไม่ขึ้น Video Feed โดยอัตโนมัติ"
          postToVideoFeed={postToVideoFeed}
          onPostToVideoFeedChange={
            mediaType === "video" && pendingFile
              ? setPostToVideoFeed
              : undefined
          }
        />
        <PostSharingInfoModal
          open={infoOpen}
          onClose={() => {
            markSharingInfoModalSeen();
            setInfoOpen(false);
          }}
          onManageSettings={() => navigate("/settings/post-sharing")}
        />
      </>
    );
    return typeof document !== "undefined"
      ? createPortal(composer, document.body)
      : composer;
  }

  return (
    <div className="fixed inset-0 z-[200] min-h-[100dvh] bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          type="button"
          onClick={onExit}
          className="p-2 rounded-full hover:bg-white/10"
        >
          <X size={24} />
        </button>
        <h1 className="font-semibold text-base text-white">เพิ่มลงในสตอรี่</h1>
        <div className="w-10" />
      </header>

      {step === "pick" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setTextStudioMode("plain");
                setTextStudio((s) => ({ ...s, mode: "plain" }));
                setStep("text");
              }}
              className="shrink-0 w-[108px] aspect-[3/4] rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 border border-white/10 flex flex-col items-center justify-center gap-2"
            >
              <Type size={28} className="text-white" />
              <span className="text-[11px] font-medium text-white">
                ข้อความ
              </span>
            </button>
            <StoryQuickChatCard
              onClick={() => {
                setTextStudioMode("chat");
                setTextStudio((s) => ({
                  ...s,
                  mode: "chat",
                  chatPrompt: s.chatPrompt || "เพิ่มของคุณบ้าง",
                }));
                setStep("text");
              }}
            />
            <QuickChip
              icon={Music2}
              label="เพลง"
              onClick={() => fileRef.current?.click()}
            />
          </div>
          <div className="flex justify-between mb-2 px-1 text-sm text-white/70">
            <span>ล่าสุด</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-blue-400"
            >
              เลือกไฟล์
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="aspect-[3/4] bg-zinc-800 flex flex-col items-center justify-center gap-2"
            >
              <Camera size={32} />
              <span className="text-xs text-white/60">กล้อง</span>
            </button>
            {recentThumbs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => t.file && setFilePreview(t.file)}
                className="aspect-[3/4] overflow-hidden bg-zinc-900"
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
            multiple
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFilePreview(f);
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFilePreview(f);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function FeedPostFlow({ onExit }: { onExit: () => void }) {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<FeedStep>("pick");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extras, setExtras] = useState<PostComposeExtras>(emptyExtras);
  const [sharing, setSharing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(!hasSeenSharingInfoModal());

  const pickVideo = (file: File) => {
    if (!file.type.startsWith("video/")) {
      notify("Video Feed รองรับเฉพาะวิดีโอ", "warning");
      return;
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.duration > 120) {
        notify("แนะนำคลิปไม่เกิน 2 นาที", "warning");
      }
      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStep("compose");
    };
    v.src = URL.createObjectURL(file);
  };

  const shareFeed = async () => {
    if (!pendingFile) return;
    setSharing(true);
    try {
      const title =
        extras.caption.slice(0, 120) ||
        extras.poll?.question?.slice(0, 80) ||
        "คลิปผลงาน";
      let description = extras.caption;
      const meta = {
        poll: extras.poll,
        music: extras.music,
        conversation_topic: extras.conversationTopic,
        tagged_people: extras.taggedPeople,
        location: extras.location,
        ai_label: extras.aiLabel,
        sharing: extras.sharing || loadPostSharingPrefs(),
      };
      if (Object.values(meta).some(Boolean)) {
        description =
          `${description}\n\n[meta]${JSON.stringify(meta)}[/meta]`.trim();
      }
      await videoService.upload(pendingFile, title, description);
      markSharingInfoModalSeen();
      notify("ส่งคลิปไป Video Feed แล้ว — รอประมวลผลลายน้ำ", "success");
      navigate("/video-feed", { replace: true });
    } catch (e: unknown) {
      const err = e as { message?: string };
      notify(err?.message || "อัปโหลดไม่สำเร็จ", "error");
    } finally {
      setSharing(false);
    }
  };

  if (step === "compose" && previewUrl) {
    return (
      <>
        <PostShareComposer
          title="โพสต์ใหม่"
          destinationLabel="Video Feed · คลิปถาวร"
          preview={
            <video
              src={previewUrl}
              className="w-full h-full object-cover"
              muted
            />
          }
          extras={extras}
          onExtrasChange={setExtras}
          onShare={shareFeed}
          onBack={() => setStep("pick")}
          sharing={sharing}
          shareLabel="เผยแพร่ไป Video Feed"
        />
        <PostSharingInfoModal
          open={infoOpen}
          onClose={() => {
            markSharingInfoModalSeen();
            setInfoOpen(false);
          }}
          onManageSettings={() => navigate("/settings/post-sharing")}
        />
      </>
    );
  }

  return (
    <div className="post-create-feed -mx-4 sm:-mx-6 -my-6 min-h-[calc(100dvh-10rem)] flex flex-col rounded-none sm:rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950 shadow-xl ring-1 ring-slate-700/50">
      <header className="flex items-center px-3 py-3.5 border-b border-white/10 bg-slate-900/90 backdrop-blur-md sticky top-0 z-10">
        <button
          type="button"
          onClick={onExit}
          className="p-2 rounded-full text-white hover:bg-white/10 transition-colors"
          aria-label="ปิด"
        >
          <X size={22} className="text-white" />
        </button>
        <h1 className="flex-1 text-center text-base sm:text-lg font-bold text-white tracking-tight pr-10">
          คลิปผลงาน / Video Feed
        </h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">
        <div className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center shadow-lg shadow-emerald-950/50">
          <Film size={34} className="text-emerald-300" strokeWidth={1.75} />
        </div>

        <div className="text-center max-w-sm space-y-2">
          <p className="text-lg font-bold text-white">อัปโหลดคลิปผลงาน</p>
          <p className="text-sm text-slate-200 leading-relaxed">
            เลือกวิดีโอจากเครื่อง — ระบบจะติด{" "}
            <span className="text-emerald-300 font-medium">ลายน้ำ</span> และ{" "}
            <span className="text-emerald-300 font-medium">ฉากจบ</span>{" "}
            อัตโนมัติ
          </p>
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5 pt-1">
            <Sparkles size={14} className="text-amber-300 shrink-0" />
            แนะนำความยาว 15–60 วินาที
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={sharing}
          className="w-full max-w-xs px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/60 border border-emerald-400/30 disabled:opacity-60 transition-colors"
        >
          {sharing ? (
            <Loader2 className="animate-spin" size={22} />
          ) : (
            <Camera size={22} className="text-white" />
          )}
          <span className="text-white">เลือกวิดีโอ</span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickVideo(f);
          }}
        />
      </div>
    </div>
  );
}

function QuickChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 shrink-0 rounded-xl bg-white/10 px-4 py-2 text-xs"
    >
      <Icon size={20} />
      {label}
    </button>
  );
}

export default PostCreate;
