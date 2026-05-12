/**
 * VideoFeed — แหล่งศูนย์รวมคลิปฝีมือช่างและการทำงานของ Talents
 * Feed สาธารณะ เลื่อนดูคลิปแบบ TikTok คลิกจ้างงานเลย
 * - ดึงข้อมูลจาก backend (/api/videos/feed, /api/videos/my)
 * - Talents อัปโหลดคลิปผลงานได้ที่ Profile → Story หรือ VideoUploader
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { videoService, type TalentVideo, type VideoComment } from "../services/videoService";
import {
  Play,
  Pause,
  User,
  Briefcase,
  ChevronUp,
  Loader2,
  Upload,
  Video,
  Sparkles,
  Heart,
  MessageCircle,
  Share2,
  MoreVertical,
  Ban,
  Flag,
  Bookmark,
  Link2,
  EyeOff,
  X,
  ThumbsDown,
  SlidersHorizontal,
  Image as ImageIcon,
  Smile,
  AtSign,
  ChevronDown,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { VideoUploader } from "../components/VideoUploader";
import { VideoBrandOverlay } from "../components/VideoBrandOverlay";
import { UserRole } from "../types";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";

interface VideoFeedProps {
  /** คลิปที่เพิ่งอัปโหลด — แสดงก่อนจนกว่าจะเลื่อน */
  initialVideo?: TalentVideo | null;
}

/** คลิปจาก S3 fallback / คลิปทักทาย — ไม่มี UUID ใน talent_videos จึงยังไม่ไลค์/คอมเมนต์ผ่าน API ได้ */
function engagementBlockedReason(v: TalentVideo): "s3" | "greeting" | null {
  if (!v?.id) return "s3";
  if (v.id.startsWith("s3-")) return "s3";
  if (v.id === "greeting") return "greeting";
  return null;
}

function canPersistEngagement(v: TalentVideo): boolean {
  return engagementBlockedReason(v) === null;
}

function buildVideoFeedShareUrl(v: TalentVideo): string {
  const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
  const hash =
    v.id && !v.id.startsWith("s3-") && v.id !== "greeting"
      ? `#/video-feed?video=${encodeURIComponent(v.id)}`
      : "#/video-feed";
  return `${base}${hash}`;
}

function engagementBlockedMessage(v: TalentVideo): { th: string; en: string } | null {
  const r = engagementBlockedReason(v);
  if (!r) return null;
  if (r === "s3") {
    return {
      th: "คลิปตัวอย่างจากคลัง — ไลค์/คอมเมนต์/บันทึกได้เมื่อมีคลิปจาก Talent ในระบบ (อัปโหลดคลิปผ่านแอป)",
      en: "Demo clip from storage — like/comment/save work when the feed shows Talent uploads from the app.",
    };
  }
  return {
    th: "คลิปทักทาย — ใช้คลิปอัปโหลดในฟีดเพื่อกดไลค์ คอมเมนต์ และบันทึก",
    en: "Greeting clip — upload a feed clip to like, comment, and save.",
  };
}

function formatEngagementCount(n: number | undefined): string {
  const x = Math.max(0, n ?? 0);
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`.replace(/\.0M$/, "M");
  if (x >= 1_000) return `${(x / 1_000).toFixed(1)}K`.replace(/\.0K$/, "K");
  return String(x);
}

function formatCommentTimeShort(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}-${d.getDate()}`;
  } catch {
    return "";
  }
}

/** โลโก้แบรนด์จาก Simple Icons CDN (สีแบรนด์) — ใช้แสดงในแผงแชร์ */
const SHARE_BRAND_LOGO: Record<string, string> = {
  facebook: "https://cdn.simpleicons.org/facebook/1877F2",
  line: "https://cdn.simpleicons.org/line/00C300",
  whatsapp: "https://cdn.simpleicons.org/whatsapp/25D366",
  telegram: "https://cdn.simpleicons.org/telegram/26A5E4",
  x: "https://cdn.simpleicons.org/x/000000",
  instagram: "https://cdn.simpleicons.org/instagram/E4405F",
  youtube: "https://cdn.simpleicons.org/youtube/FF0000",
  discord: "https://cdn.simpleicons.org/discord/5865F2",
};

const VideoFeed: React.FC<VideoFeedProps> = ({ initialVideo }) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { config } = useMobileAppConfig();
  const { notify } = useNotification();
  const signupsEnabled = config.featureFlags.enableSignups;
  const [searchParams] = useSearchParams();
  const [videos, setVideos] = useState<TalentVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [myVideos, setMyVideos] = useState<TalentVideo[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentSheetTab, setCommentSheetTab] = useState<"comments" | "reviews">("comments");
  const [commentsNewestFirst, setCommentsNewestFirst] = useState(true);
  const [replyingTo, setReplyingTo] = useState<VideoComment | null>(null);
  const [expandedReplyIds, setExpandedReplyIds] = useState<Record<string, boolean>>({});
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [blockedTalentIds, setBlockedTalentIds] = useState<Set<string>>(new Set());
  const [hiddenVideoIds, setHiddenVideoIds] = useState<Set<string>>(new Set());
  const [shareSheetVideo, setShareSheetVideo] = useState<TalentVideo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isProvider = user?.role === UserRole.PROVIDER;

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await videoService.getFeed(20);
      setVideos(res.videos || []);
    } catch (e) {
      console.error("Video feed load error:", e);
      setVideos([]);
    }
    setLoading(false);
  }, []);

  const loadMyVideos = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await videoService.getMyVideos();
      setMyVideos(list || []);
    } catch {
      setMyVideos([]);
    }
  }, [user?.id]);

  useEffect(() => {
    loadFeed();
    loadMyVideos();
  }, [loadFeed, loadMyVideos]);

  // รวมคลิปของตัวเองไว้ด้านหน้า (initialVideo + myVideos ที่ยังไม่อยู่ใน feed) — ไม่รวม blocked
  const orderedVideos = React.useMemo(() => {
    const feed = videos.filter((v) => !v.talent_id || !blockedTalentIds.has(v.talent_id));
    const my = myVideos.filter((v) => !v.talent_id || !blockedTalentIds.has(v.talent_id));
    const myUrls = new Set(my.map((v) => v.video_url));
    const feedUrls = new Set(feed.map((v) => v.video_url));

    let prepend: TalentVideo[] = [];
    if (initialVideo && !blockedTalentIds.has(initialVideo.talent_id || "") && !feedUrls.has(initialVideo.video_url)) {
      prepend.push(initialVideo);
    }
    my.forEach((v) => {
      if (!feedUrls.has(v.video_url) && !prepend.some((p) => p.video_url === v.video_url)) {
        prepend.push(v);
      }
    });

    return [...prepend, ...feed].filter((v) => !hiddenVideoIds.has(v.id));
  }, [videos, myVideos, initialVideo, blockedTalentIds, hiddenVideoIds]);

  // เลื่อนไปคลิปที่แชร์มา (?video=id)
  const videoIdFromUrl = searchParams.get("video");
  useEffect(() => {
    if (!videoIdFromUrl || orderedVideos.length === 0) return;
    const idx = orderedVideos.findIndex((v) => v.id === videoIdFromUrl);
    if (idx >= 0) setCurrentIndex(idx);
  }, [videoIdFromUrl, orderedVideos]);

  useEffect(() => {
    if (orderedVideos.length === 0) return;
    setCurrentIndex((i) => Math.min(i, Math.max(0, orderedVideos.length - 1)));
  }, [orderedVideos.length]);

  const currentVideo = orderedVideos[currentIndex];
  const videoRef = useRef<HTMLVideoElement>(null);

  // TikTok-style: เล่นเฉพาะคลิปปัจจุบัน — วิดีโอเดียว key เปลี่ยน = unmount คลิปเดิมทันที
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !currentVideo) return;
    el.pause();
    el.currentTime = 0;
    if (playing) el.play().catch(() => {});
  }, [currentIndex, currentVideo?.id, playing]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) el.play().catch(() => {});
    else el.pause();
  }, [playing]);

  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 30) return;
    if (e.deltaY > 0 && currentIndex < orderedVideos.length - 1) {
      setCurrentIndex((i) => i + 1);
      setPlaying(true);
    } else if (e.deltaY < 0 && currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setPlaying(true);
    }
  };

  const handleTouchEnd = useRef<{ startY: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    handleTouchEnd.current = { startY: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = handleTouchEnd.current?.startY;
    if (start == null) return;
    const dy = e.changedTouches[0].clientY - start;
    if (Math.abs(dy) < 50) return;
    if (dy > 0 && currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setPlaying(true);
    } else if (dy < 0 && currentIndex < orderedVideos.length - 1) {
      setCurrentIndex((i) => i + 1);
      setPlaying(true);
    }
  };

  const handleUploadSuccess = (video: TalentVideo) => {
    setShowUploadModal(false);
    loadFeed();
    loadMyVideos();
    setVideos((prev) => [video, ...prev]);
    setCurrentIndex(0);
  };

  const updateVideoInList = useCallback(
    (id: string, upd: Partial<TalentVideo>) => {
      setVideos((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...upd } : x))
      );
      setMyVideos((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...upd } : x))
      );
    },
    []
  );

  // นับยอดดูหลังดูต่อเนื่อง ~2 วินาที (ฝั่งเซิร์ฟเวอร์ dedup รายวัน)
  useEffect(() => {
    if (!currentVideo || !canPersistEngagement(currentVideo)) return;
    const id = currentVideo.id;
    const t = window.setTimeout(() => {
      videoService
        .recordView(id)
        .then((r) => {
          if (typeof r.view_count === "number") {
            updateVideoInList(id, { view_count: r.view_count });
          }
        })
        .catch(() => {});
    }, 2200);
    return () => clearTimeout(t);
  }, [currentVideo?.id, updateVideoInList]);

  const handleLike = async (v: TalentVideo) => {
    if (!user?.id) {
      notify(
        language === "en" ? "Sign in to like clips" : "กรุณาเข้าสู่ระบบเพื่อกดไลค์",
        "warning",
      );
      return;
    }
    const blocked = engagementBlockedMessage(v);
    if (blocked) {
      notify(language === "en" ? blocked.en : blocked.th, "info");
      return;
    }
    try {
      const res = await videoService.toggleLike(v.id);
      updateVideoInList(v.id, { liked_by_me: res.liked, like_count: res.like_count });
    } catch (e) {
      console.error("Like error:", e);
      notify(language === "en" ? "Could not update like" : "ไม่สามารถบันทึกไลค์ได้", "error");
    }
  };

  const loadComments = useCallback(async (videoId: string) => {
    try {
      const res = await videoService.getComments(videoId);
      setComments(res.comments || []);
    } catch {
      setComments([]);
    }
  }, []);

  const handleOpenComments = (v: TalentVideo) => {
    const blocked = engagementBlockedMessage(v);
    if (blocked) {
      notify(language === "en" ? blocked.en : blocked.th, "info");
      return;
    }
    setShowCommentModal(v.id);
    setCommentText("");
    setReplyingTo(null);
    setCommentSheetTab("comments");
    setExpandedReplyIds({});
    loadComments(v.id);
  };

  const handleSubmitComment = async () => {
    const vid = showCommentModal;
    if (!vid || !commentText.trim()) return;
    if (!user?.id) {
      notify(language === "en" ? "Sign in to comment" : "กรุณาเข้าสู่ระบบเพื่อคอมเมนต์", "warning");
      return;
    }
    try {
      const res = await videoService.addComment(vid, commentText.trim(), replyingTo?.id ?? null);
      setCommentText("");
      setReplyingTo(null);
      await loadComments(vid);
      setVideos((prev) =>
        prev.map((x) =>
          x.id === vid ? { ...x, comment_count: res.comment_count } : x
        )
      );
      setMyVideos((prev) =>
        prev.map((x) =>
          x.id === vid ? { ...x, comment_count: res.comment_count } : x
        )
      );
    } catch (e) {
      console.error("Comment error:", e);
    }
  };

  const activeCommentVideo = useMemo(() => {
    if (!showCommentModal) return null;
    return (
      videos.find((x) => x.id === showCommentModal) ||
      myVideos.find((x) => x.id === showCommentModal) ||
      (initialVideo?.id === showCommentModal ? initialVideo : null) ||
      null
    );
  }, [showCommentModal, videos, myVideos, initialVideo]);

  const commentThread = useMemo(() => {
    const roots = comments.filter((c) => !c.parent_id);
    const sorted = [...roots].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return commentsNewestFirst ? tb - ta : ta - tb;
    });
    const repliesByParent = new Map<string, VideoComment[]>();
    for (const c of comments) {
      if (!c.parent_id) continue;
      const list = repliesByParent.get(c.parent_id) || [];
      list.push(c);
      repliesByParent.set(c.parent_id, list);
    }
    for (const [, list] of repliesByParent) {
      list.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
    }
    return { roots: sorted, repliesByParent };
  }, [comments, commentsNewestFirst]);

  const recordShareIfPossible = useCallback(
    async (v: TalentVideo, channel: string) => {
      if (!canPersistEngagement(v)) return;
      try {
        const r = await videoService.recordShare(v.id, channel);
        updateVideoInList(v.id, { share_count: r.share_count });
      } catch {
        /* ignore */
      }
    },
    [updateVideoInList],
  );

  const shareTextFor = (v: TalentVideo) =>
    v.title ? `${v.title} — ดูคลิปฝีมือช่างบน aqond` : "ดูคลิปฝีมือช่างบน aqond";

  /** เปิดแผงแชร์ (Copy / Facebook / LINE / WhatsApp / …) */
  const openShareSheet = (v: TalentVideo) => {
    setShareSheetVideo(v);
    setShowActionsMenu(null);
  };

  /** ดำเนินการแชร์ตามช่องทาง + บันทึกยอดแชร์เมื่อมี UUID คลิป */
  const executeShareChannel = async (v: TalentVideo, channel: string) => {
    const url = buildVideoFeedShareUrl(v);
    const text = shareTextFor(v);
    const enc = encodeURIComponent;

    const afterCopy = async () => {
      await recordShareIfPossible(v, channel);
      setShareSheetVideo(null);
      notify(language === "en" ? "Link copied" : "คัดลอกลิงก์แล้ว", "success");
    };

    try {
      if (channel === "copy") {
        await navigator.clipboard.writeText(url);
        await afterCopy();
        return;
      }
      if (channel === "instagram" || channel === "youtube" || channel === "discord") {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        await recordShareIfPossible(v, channel);
        setShareSheetVideo(null);
        notify(
          language === "en"
            ? channel === "discord"
              ? "Copied — paste into Discord."
              : "Copied — paste into Instagram or YouTube (e.g. Shorts)."
            : channel === "discord"
              ? "คัดลอกแล้ว — วางใน Discord"
              : "คัดลอกแล้ว — วางใน Instagram หรือ YouTube (เช่น Shorts)",
          "success",
        );
        return;
      }
      if (channel === "native" && navigator.share) {
        try {
          await navigator.share({ title: "aqond", text, url });
          await recordShareIfPossible(v, "native");
          setShareSheetVideo(null);
          return;
        } catch {
          /* fall through to copy */
        }
      }
      const urls: Record<string, string> = {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
        line: `https://social-plugins.line.me/lineit/share?url=${enc(url)}`,
        whatsapp: `https://wa.me/?text=${enc(`${text} ${url}`)}`,
        telegram: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
        twitter: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
      };
      const openUrl = urls[channel];
      if (openUrl) {
        window.open(openUrl, "_blank", "noopener,noreferrer");
        await recordShareIfPossible(v, channel);
      }
      setShareSheetVideo(null);
    } catch (e) {
      console.error("share channel:", e);
      notify(language === "en" ? "Share failed" : "แชร์ไม่สำเร็จ", "error");
    }
  };

  const copyVideoLinkOnly = async (v: TalentVideo) => {
    try {
      await navigator.clipboard.writeText(buildVideoFeedShareUrl(v));
      notify(language === "en" ? "Link copied" : "คัดลอกลิงก์แล้ว", "success");
      await recordShareIfPossible(v, "copy");
      setShowActionsMenu(null);
    } catch {
      notify(language === "en" ? "Could not copy" : "คัดลอกไม่สำเร็จ", "error");
    }
  };

  const handleSave = async (v: TalentVideo) => {
    if (!user?.id) {
      notify(language === "en" ? "Sign in to save clips" : "กรุณาเข้าสู่ระบบเพื่อบันทึกคลิป", "warning");
      return;
    }
    const blocked = engagementBlockedMessage(v);
    if (blocked) {
      notify(language === "en" ? blocked.en : blocked.th, "info");
      return;
    }
    try {
      const r = await videoService.toggleSave(v.id);
      updateVideoInList(v.id, { saved_by_me: r.saved, save_count: r.save_count });
    } catch (e) {
      console.error("Save error:", e);
      notify(language === "en" ? "Could not update save" : "บันทึกคลิปไม่สำเร็จ", "error");
    }
  };

  const handleNotInterested = (v: TalentVideo) => {
    setHiddenVideoIds((prev) => new Set(prev).add(v.id));
    setShowActionsMenu(null);
    notify(
      language === "en" ? "We’ll show fewer clips like this in this session." : "จะแสดงคลิปแบบนี้น้อยลงในรอบนี้",
      "info",
    );
  };

  const handleBlock = async (v: TalentVideo) => {
    if (!user?.id || !canPersistEngagement(v) || !v.talent_id) return;
    setShowActionsMenu(null);
    try {
      await videoService.blockVideoCreator(v.id);
      const talentId = v.talent_id;
      setBlockedTalentIds((prev) => new Set(prev).add(talentId));
      setVideos((prev) => prev.filter((x) => x.talent_id !== talentId));
      setMyVideos((prev) => prev.filter((x) => x.talent_id !== talentId));
      if (currentIndex > 0) setCurrentIndex((i) => Math.max(0, i - 1));
    } catch (e) {
      console.error("Block error:", e);
      alert("ไม่สามารถบล็อกได้");
    }
  };

  const handleReport = async () => {
    const vid = showReportModal;
    if (!vid || !user?.id) return;
    try {
      await videoService.reportVideo(vid, reportReason);
      setShowReportModal(null);
      setReportReason("");
      alert("ขอบคุณที่แจ้งรายงาน เราจะตรวจสอบ");
    } catch (e) {
      console.error("Report error:", e);
      alert("ไม่สามารถแจ้งรายงานได้");
    }
  };

  if (loading && orderedVideos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="animate-spin text-indigo-500" />
        <p className="text-slate-500">กำลังโหลดคลิป...</p>
      </div>
    );
  }

  if (orderedVideos.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col">
        {/* Hero — แหล่งศูนย์รวม */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white px-6 py-10 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-2xl bg-white/20">
              <Video size={48} />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            แหล่งศูนย์รวมคลิปฝีมือช่าง
          </h1>
          <p className="text-indigo-100 text-lg mb-6">
            คลิปการทำงานและฝีมือของ Talents ที่พร้อมรับงาน
          </p>
          <p className="text-white/90 text-sm max-w-md mx-auto">
            Talents สามารถอัปโหลดคลิปผลงานเพื่อให้ลูกค้าเห็นฝีมือและจ้างงานได้ทันที
          </p>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="p-6 rounded-full bg-slate-100 mb-6">
            <Sparkles size={48} className="text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">ยังไม่มีคลิปในฟีด</h2>
          <p className="text-slate-600 mb-6 max-w-sm">
            เป็น Talent อยู่แล้ว? อัปโหลดคลิปผลงานของคุณเพื่อให้ลูกค้าเห็นฝีมือและจ้างงานได้เลย
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            {isProvider ? (
              <>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Upload size={20} />
                  อัปโหลดคลิป
                </button>
                <Link
                  to="/profile"
                  className="px-6 py-3 border border-indigo-600 text-indigo-600 rounded-xl font-medium hover:bg-indigo-50 flex items-center gap-2"
                >
                  ไปที่ Profile
                </Link>
              </>
            ) : (
              <>
                {signupsEnabled ? (
                  <Link
                    to="/register"
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
                  >
                    สมัครเป็น Talent
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      notify("การสมัครสมาชิกถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")
                    }
                    className="px-6 py-3 bg-slate-400 text-white rounded-xl font-medium cursor-not-allowed opacity-90"
                  >
                    สมัครเป็น Talent
                  </button>
                )}
                <Link
                  to="/talents"
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50"
                >
                  ดู Talent ทั้งหมด
                </Link>
              </>
            )}
          </div>
        </div>

        {showUploadModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
              <h3 className="text-lg font-bold mb-4">อัปโหลดคลิปผลงาน</h3>
              <VideoUploader
                navigateToFeedOnSuccess={false}
                onSuccess={(v) => handleUploadSuccess(v)}
                onError={(msg) => console.error(msg)}
              />
              <button
                onClick={() => setShowUploadModal(false)}
                className="mt-4 w-full py-2 text-slate-600 hover:text-slate-800"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[70vh]">
      {/* Header — แหล่งศูนย์รวม (compact) */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/20">
            <Video size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg">แหล่งศูนย์รวมคลิปฝีมือช่าง</h1>
            <p className="text-indigo-100 text-sm">คลิปการทำงานของ Talents</p>
          </div>
        </div>
        {isProvider && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium flex items-center gap-2 shrink-0"
          >
            <Upload size={18} />
            อัปโหลด
          </button>
        )}
      </div>

      {/* Feed — TikTok-style: วิดีโอเดียว เปลี่ยน src เมื่อเลื่อน (คลิปเดิมหยุดทันที) */}
      <div
        ref={containerRef}
        className="flex-1 h-[calc(100vh-12rem)] min-h-[400px] overflow-hidden snap-y snap-mandatory bg-black relative"
        onWheel={handleWheel}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {orderedVideos.map((v, idx) => (
          <div
            key={v.id}
            className={`h-full w-full snap-start snap-always flex items-center justify-center relative ${
              idx === currentIndex ? "" : "pointer-events-none invisible"
            }`}
            style={idx !== currentIndex ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } : undefined}
          >
            {/* วิดีโอจริงแสดงเฉพาะคลิปปัจจุบัน — ป้องกันคลิปเดิมเล่นต่อ */}
            {idx === currentIndex && currentVideo && (
              <VideoBrandOverlay
                videoRef={videoRef}
                showEndCard={true}
                loop={true}
                className="flex items-center justify-center w-full h-full"
              >
                <video
                  ref={videoRef}
                  src={currentVideo.video_url}
                  key={currentVideo.id}
                  className="max-h-full max-w-full object-contain"
                  loop={false}
                  muted={false}
                  playsInline
                  onClick={() => setPlaying((p) => !p)}
                  poster={currentVideo.thumbnail_url || undefined}
                />
              </VideoBrandOverlay>
            )}
            {/* TikTok-style: ชื่อ + คำบรรยายมุมล่างซ้าย */}
            <div className="absolute bottom-0 left-0 right-14 sm:right-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white pointer-events-none z-[15]">
              <div className="pointer-events-auto max-w-[calc(100%-3rem)]">
                <div className="flex items-center gap-2 mb-1">
                  {v.talent_id ? (
                    <Link
                      to={`/talents/${v.talent_id}`}
                      className="flex items-center gap-2 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden ring-2 ring-white/25 shrink-0">
                        {v.talent_avatar ? (
                          <img src={v.talent_avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <span className="font-semibold text-[15px] truncate drop-shadow-md">
                        @{v.talent_name || "Talent"}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                        {v.talent_avatar ? (
                          <img src={v.talent_avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <span className="font-semibold truncate">{v.talent_name || "Talent"}</span>
                    </div>
                  )}
                </div>
                {v.title && (
                  <p className="text-sm text-white/95 leading-snug drop-shadow line-clamp-3">{v.title}</p>
                )}
                {engagementBlockedReason(v) && (
                  <p className="text-[10px] text-amber-200/95 mt-1.5 leading-snug max-w-[90vw]">
                    {language === "en"
                      ? "Demo or greeting clip — upload a portfolio clip to enable likes & comments."
                      : "คลิปตัวอย่างหรือทักทาย — อัปโหลดคลิปผลงานในฟีดเพื่อให้ไลค์/คอมเมนต์/บันทึกได้"}
                  </p>
                )}
                {typeof v.view_count === "number" && v.view_count > 0 && (
                  <p className="text-[11px] text-white/75 mt-1.5 tabular-nums">
                    {language === "en" ? "Views " : "รับชม "}
                    {formatEngagementCount(v.view_count)}
                  </p>
                )}
              </div>
            </div>
            {/* TikTok-style: แถบโต้ตอบขวา — แสดงทุกคลิป; ไลค์/คอมเมนต์บันทึกเมื่อคลิปซิงค์แล้ว */}
            <div className="absolute right-2 bottom-[max(5rem,env(safe-area-inset-bottom,0px))] flex flex-col items-center justify-end gap-3.5 z-20 pointer-events-auto">
              {v.talent_id && (
                <Link
                  to={`/talents/${v.talent_id}`}
                  state={{ fromVideoFeed: true }}
                  className="flex flex-col items-center gap-0.5 mb-1"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={language === "en" ? "View provider & hire" : "ดูโปรไฟล์และจ้างงาน"}
                >
                  <div className="w-12 h-12 rounded-full border-2 border-white/90 overflow-hidden shadow-lg ring-2 ring-black/30">
                    {v.talent_avatar ? (
                      <img src={v.talent_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-600 flex items-center justify-center">
                        <User size={22} className="text-white" />
                      </div>
                    )}
                  </div>
                </Link>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike(v);
                }}
                className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                  !canPersistEngagement(v) ? "opacity-60" : ""
                }`}
                title={language === "en" ? "Like" : "ไลค์"}
                aria-label="Like"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <Heart
                    size={28}
                    className={v.liked_by_me ? "fill-red-500 text-red-500" : "text-white drop-shadow-md"}
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(v.like_count)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenComments(v);
                }}
                className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                  !canPersistEngagement(v) ? "opacity-60" : ""
                }`}
                title={language === "en" ? "Comments" : "คอมเมนต์"}
                aria-label="Comments"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <MessageCircle size={27} className="text-white drop-shadow-md" strokeWidth={2} />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(v.comment_count)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave(v);
                }}
                className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                  !canPersistEngagement(v) ? "opacity-60" : ""
                }`}
                title={language === "en" ? "Save" : "บันทึก"}
                aria-label="Save"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <Bookmark
                    size={26}
                    className={
                      v.saved_by_me ? "text-amber-300 fill-amber-400/90" : "text-white drop-shadow-md"
                    }
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(v.save_count)}
                </span>
              </button>
              {v.talent_id && v.talent_id !== user?.id && (
                <Link
                  to={`/talents/${v.talent_id}`}
                  state={{ fromVideoFeed: true, hireIntent: true }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
                  title={language === "en" ? "Hire this provider" : "จ้างงานทันที"}
                  aria-label={language === "en" ? "Hire" : "จ้างงาน"}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-amber-950 shadow-lg shadow-amber-900/40 ring-2 ring-white/30">
                    <Briefcase size={26} strokeWidth={2.25} />
                  </span>
                  <span className="text-[11px] font-bold text-white drop-shadow-md">
                    {language === "en" ? "Hire" : "จ้างงาน"}
                  </span>
                </Link>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openShareSheet(v);
                }}
                className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
                title={language === "en" ? "Share" : "แชร์"}
                aria-label="Share"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <Share2 size={25} className="text-white drop-shadow-md" />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(v.share_count)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPlaying((p) => !p);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 backdrop-blur-sm shadow-md"
                title={playing ? "Pause" : "Play"}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActionsMenu(showActionsMenu === v.id ? null : v.id);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 backdrop-blur-sm shadow-md"
                  title={language === "en" ? "More" : "เพิ่มเติม"}
                  aria-label="More"
                >
                  <MoreVertical size={24} />
                </button>
                {showActionsMenu === v.id && (
                  <div className="absolute right-0 top-full z-[100] mt-1 min-w-[220px] rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const blocked = engagementBlockedMessage(v);
                        if (blocked) {
                          notify(language === "en" ? blocked.en : blocked.th, "info");
                          setShowActionsMenu(null);
                          return;
                        }
                        setShowReportModal(v.id);
                        setShowActionsMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-100 hover:bg-white/10"
                    >
                      <Flag size={16} />
                      {language === "en" ? "Report this clip" : "แจ้งรายงานคลิปนี้"}
                    </button>
                    {v.talent_id && v.talent_id !== user?.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBlock(v);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-rose-100 hover:bg-white/10"
                      >
                        <Ban size={16} />
                        {language === "en" ? "Block creator" : "บล็อก Talent"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotInterested(v);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/95 hover:bg-white/10"
                    >
                      <EyeOff size={16} />
                      {language === "en" ? "Not interested" : "ไม่สนใจคลิปนี้"}
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openShareSheet(v);
                        setShowActionsMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/95 hover:bg-white/10"
                    >
                      <Share2 size={16} />
                      {language === "en" ? "Share to…" : "แชร์ไปยัง…"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyVideoLinkOnly(v);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/95 hover:bg-white/10"
                    >
                      <Link2 size={16} />
                      {language === "en" ? "Copy link" : "คัดลอกลิงก์"}
                    </button>
                    {v.talent_id && (
                      <Link
                        to={`/talents/${v.talent_id}`}
                        state={{ fromVideoFeed: true }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/95 hover:bg-white/10"
                      >
                        <User size={16} />
                        {language === "en" ? "Talent profile" : "โปรไฟล์ Talent"}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
            {idx === currentIndex && (
              <div className="absolute top-4 left-4 text-white/90 text-sm flex items-center gap-2">
                <ChevronUp size={16} />
                เลื่อนดูคลิป คลิกจ้างงานเลย
              </div>
            )}
          </div>
        ))}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">อัปโหลดคลิปผลงาน</h3>
            <VideoUploader
              navigateToFeedOnSuccess={true}
              onSuccess={handleUploadSuccess}
              onError={(msg) => console.error(msg)}
            />
            <button
              onClick={() => setShowUploadModal(false)}
              className="mt-4 w-full py-2 text-slate-600 hover:text-slate-800"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {showCommentModal && (
        <div
          className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
          role="presentation"
          onClick={() => {
            setShowCommentModal(null);
            setReplyingTo(null);
          }}
        >
          <div
            className="flex max-h-[min(88vh,720px)] w-full max-w-md flex-col rounded-t-[14px] bg-white shadow-2xl sm:max-h-[80vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* TikTok-style: แท็บความคิดเห็น / รีวิว + ปิด */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 pt-2">
              <div className="flex min-w-0 flex-1 items-end gap-0.5">
                <div
                  className={`flex min-w-0 items-end gap-0.5 border-b-2 ${
                    commentSheetTab === "comments"
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-400"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setCommentSheetTab("comments")}
                    className="min-w-0 truncate px-1 pb-2 text-left text-[15px] font-semibold leading-none hover:text-slate-900"
                  >
                    {language === "en" ? "Comments" : "ความคิดเห็น"}{" "}
                    {formatEngagementCount(activeCommentVideo?.comment_count)}
                  </button>
                  <button
                    type="button"
                    className="mb-0.5 shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title={language === "en" ? "Sort" : "เรียงลำดับ"}
                    aria-label={language === "en" ? "Sort comments" : "เรียงลำดับความคิดเห็น"}
                    onClick={() => setCommentsNewestFirst((v) => !v)}
                  >
                    <SlidersHorizontal size={16} strokeWidth={2.25} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCommentSheetTab("reviews")}
                  className={`border-b-2 px-2 pb-2 text-[15px] font-medium leading-none ${
                    commentSheetTab === "reviews"
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-400"
                  }`}
                >
                  {language === "en" ? "Reviews" : "รีวิว"} 0
                </button>
              </div>
              <button
                type="button"
                className="mb-1 shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => {
                  setShowCommentModal(null);
                  setReplyingTo(null);
                }}
                aria-label={language === "en" ? "Close" : "ปิด"}
              >
                <X size={20} strokeWidth={2.25} />
              </button>
            </div>

            {commentSheetTab === "reviews" ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center text-sm text-slate-500">
                {language === "en"
                  ? "Reviews are not available in this version yet."
                  : "รีวิวยังไม่พร้อมในเวอร์ชันนี้"}
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {commentThread.roots.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      {language === "en" ? "No comments yet" : "ยังไม่มีความคิดเห็น"}
                    </p>
                  ) : (
                    <ul className="space-y-4 pb-2">
                      {commentThread.roots.map((c) => {
                        const replies = commentThread.repliesByParent.get(c.id) || [];
                        const replyCount = replies.length;
                        const expanded = !!expandedReplyIds[c.id];
                        return (
                          <li key={c.id} className="flex gap-2.5">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-200">
                              {c.user_avatar ? (
                                <img src={c.user_avatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <User size={18} className="m-1.5 text-slate-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[14px] font-semibold leading-snug text-slate-900">
                                    {c.user_name || (language === "en" ? "User" : "ผู้ใช้")}
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-snug text-slate-900">
                                    {c.text}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
                                    <span>{formatCommentTimeShort(c.created_at)}</span>
                                    <button
                                      type="button"
                                      className="font-medium text-slate-500 hover:text-slate-800"
                                      onClick={() => {
                                        if (!user?.id) {
                                          notify(
                                            language === "en" ? "Sign in to reply" : "กรุณาเข้าสู่ระบบเพื่อตอบกลับ",
                                            "warning",
                                          );
                                          return;
                                        }
                                        setReplyingTo(c);
                                      }}
                                    >
                                      {language === "en" ? "Reply" : "ตอบกลับ"}
                                    </button>
                                  </div>
                                  {replyCount > 0 && (
                                    <button
                                      type="button"
                                      className="mt-2 flex items-center gap-1 text-left text-[12px] text-slate-500 hover:text-slate-700"
                                      onClick={() =>
                                        setExpandedReplyIds((prev) => ({
                                          ...prev,
                                          [c.id]: !prev[c.id],
                                        }))
                                      }
                                    >
                                      <span className="text-slate-300">——</span>
                                      <span>
                                        {language === "en" ? "View" : "ดูการตอบกลับ"}{" "}
                                        {replyCount}{" "}
                                        {language === "en" ? "replies" : "รายการ"}
                                      </span>
                                      <ChevronDown
                                        size={14}
                                        className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                                      />
                                    </button>
                                  )}
                                  {expanded &&
                                    replies.map((r) => (
                                      <div key={r.id} className="mt-3 flex gap-2 border-l border-slate-100 pl-3">
                                        <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-slate-200">
                                          {r.user_avatar ? (
                                            <img src={r.user_avatar} alt="" className="h-full w-full object-cover" />
                                          ) : (
                                            <User size={14} className="m-1.5 text-slate-500" />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[13px] font-semibold text-slate-900">
                                            {r.user_name || (language === "en" ? "User" : "ผู้ใช้")}
                                          </p>
                                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-900">
                                            {r.text}
                                          </p>
                                          <div className="mt-1 text-[11px] text-slate-500">
                                            {formatCommentTimeShort(r.created_at)}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                                {/* ไอคอนไลค์/ดิสไลค์คอมเมนต์ — ยังไม่มี API แยก (แสดงสไตล์ TikTok) */}
                                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5 text-slate-400">
                                  <button
                                    type="button"
                                    className="rounded-full p-0.5 hover:bg-slate-50"
                                    aria-hidden
                                    tabIndex={-1}
                                  >
                                    <Heart size={18} strokeWidth={1.75} className="fill-none" />
                                  </button>
                                  <span className="text-[11px] leading-none">0</span>
                                  <button
                                    type="button"
                                    className="rounded-full p-0.5 hover:bg-slate-50"
                                    aria-hidden
                                    tabIndex={-1}
                                  >
                                    <ThumbsDown size={17} strokeWidth={1.75} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* แถบป้อนข้อความล่าง — สไตล์ TikTok */}
                <div className="shrink-0 border-t border-slate-100 bg-white pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.25rem))] pt-1">
                  {replyingTo && (
                    <div className="flex items-center justify-between gap-2 px-3 pb-1 text-[12px] text-slate-600">
                      <span className="truncate">
                        {language === "en" ? "Replying to" : "กำลังตอบกลับ"}{" "}
                        <span className="font-semibold text-slate-900">{replyingTo.user_name || "…"}</span>
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-indigo-600 hover:underline"
                        onClick={() => setReplyingTo(null)}
                      >
                        {language === "en" ? "Cancel" : "ยกเลิก"}
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 pb-2">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-200">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User size={16} className="m-2 text-slate-500" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-slate-100 px-3 py-2">
                      <input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={
                          language === "en"
                            ? "Add a comment..."
                            : user?.id
                              ? "เพิ่มความคิดเห็น..."
                              : "เข้าสู่ระบบเพื่อแสดงความคิดเห็น"
                        }
                        className="min-w-0 flex-1 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
                        maxLength={500}
                        disabled={!user?.id}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitComment();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="shrink-0 p-1 text-slate-500 hover:text-slate-800"
                        aria-label={language === "en" ? "Photo" : "รูปภาพ"}
                        onClick={() =>
                          notify(
                            language === "en" ? "Photo comments coming soon" : "แนบรูปเร็วๆ นี้",
                            "info",
                          )
                        }
                      >
                        <ImageIcon size={18} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="shrink-0 p-1 text-slate-500 hover:text-slate-800"
                        aria-label="Emoji"
                        onClick={() =>
                          notify(language === "en" ? "Emoji picker coming soon" : "อีโมจิเร็วๆ นี้", "info")
                        }
                      >
                        <Smile size={18} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="shrink-0 p-1 text-slate-500 hover:text-slate-800"
                        aria-label="Mention"
                        onClick={() =>
                          notify(language === "en" ? "Mentions coming soon" : "กล่าวถึงเร็วๆ นี้", "info")
                        }
                      >
                        <AtSign size={18} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {shareSheetVideo && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 backdrop-blur-[2px]"
          onClick={() => setShareSheetVideo(null)}
          role="presentation"
        >
          <div
            className="max-h-[min(88vh,680px)] w-full max-w-md overflow-y-auto rounded-t-[18px] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {language === "en" ? "Share clip" : "แชร์คลิป"}
              </h3>
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                onClick={() => setShareSheetVideo(null)}
              >
                {language === "en" ? "Close" : "ปิด"}
              </button>
            </div>
            <p className="mb-4 text-center text-xs leading-relaxed text-slate-500">
              {language === "en"
                ? "Tap an app — share counts when the clip exists in the system."
                : "แตะไอคอนแอป — จะนับยอดแชร์เมื่อคลิปมีรหัสในระบบ"}
            </p>
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <button
                type="button"
                className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left transition hover:bg-slate-100 active:scale-[0.99]"
                onClick={() => executeShareChannel(shareSheetVideo, "native")}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <Share2 size={22} strokeWidth={2.25} />
                </span>
                <span className="font-medium text-slate-900">
                  {language === "en" ? "Share via device…" : "แชร์ผ่านระบบ…"}
                </span>
              </button>
            )}
            <button
              type="button"
              className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
              onClick={() => executeShareChannel(shareSheetVideo, "copy")}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                <Link2 size={22} className="text-indigo-600" strokeWidth={2.25} />
              </span>
              <span className="font-medium text-slate-900">
                {language === "en" ? "Copy link" : "คัดลอกลิงก์"}
              </span>
            </button>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {language === "en" ? "Apps" : "แอปยอดนิยม"}
            </p>
            <div className="grid grid-cols-4 gap-3">
              {(
                [
                  ["facebook", "Facebook"],
                  ["line", "LINE"],
                  ["whatsapp", "WhatsApp"],
                  ["telegram", "Telegram"],
                  ["x", "X"],
                  ["instagram", language === "en" ? "Instagram" : "IG"],
                  ["youtube", "YouTube"],
                  ["discord", "Discord"],
                ] as [string, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/90 py-3 transition hover:bg-slate-100 active:scale-[0.97]"
                  onClick={() =>
                    executeShareChannel(shareSheetVideo, key === "x" ? "twitter" : key)
                  }
                >
                  <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
                    <img
                      src={SHARE_BRAND_LOGO[key] || SHARE_BRAND_LOGO.facebook}
                      alt=""
                      className="h-8 w-8 object-contain"
                      loading="lazy"
                    />
                  </span>
                  <span className="max-w-full truncate px-1 text-center text-[11px] font-medium leading-tight text-slate-700">
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-center text-[10px] text-slate-400">
              {language === "en"
                ? "Instagram / YouTube / Discord: link copied — paste in the app."
                : "Instagram / YouTube / Discord: คัดลอกลิงก์แล้ว — วางในแอป"}
            </p>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">แจ้งรายงานคลิป</h3>
            <p className="text-slate-600 text-sm mb-4">เหตุผล (ไม่บังคับ)</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="เช่น สแปม, เนื้อหาไม่เหมาะสม..."
              className="w-full px-4 py-2 border rounded-xl mb-4 min-h-[80px]"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowReportModal(null);
                  setReportReason("");
                }}
                className="flex-1 py-2 border rounded-xl text-slate-600"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReport}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl font-medium"
              >
                แจ้งรายงาน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoFeed;
