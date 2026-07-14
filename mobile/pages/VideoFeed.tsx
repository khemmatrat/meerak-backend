/**
 * VideoFeed — แหล่งศูนย์รวมคลิปฝีมือช่างและการทำงานของ Talents
 * Feed สาธารณะ เลื่อนดูคลิปแบบ TikTok คลิกจ้างงานเลย
 * - ดึงข้อมูลจาก backend (/api/videos/feed, /api/videos/my)
 * - Talents อัปโหลดคลิปผลงานได้ที่ Profile → Story หรือ VideoUploader
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import {
  videoService,
  type TalentVideo,
  type VideoComment,
} from "../services/videoService";
import { adsService, isSponsoredVideo, sponsoredMediaSources } from "../services/adsService";
import {
  Play,
  Pause,
  User,
  Briefcase,
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
  ChevronLeft,
  Trash2,
  Volume2,
  VolumeX,
  Lock,
} from "lucide-react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { VideoUploader } from "../components/VideoUploader";
import { VideoBrandOverlay } from "../components/VideoBrandOverlay";
import { SponsoredFeedSlide } from "../components/SponsoredFeedSlide";
import { UserRole } from "../types";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { fetchTalentVideoEntitlement } from "../services/talentVideoService";

interface VideoFeedProps {
  /** คลิปที่เพิ่งอัปโหลด — แสดงก่อนจนกว่าจะเลื่อน */
  initialVideo?: TalentVideo | null;
  /** มาจาก Profile → Story หลังอัปโหลดสำเร็จ — onboarding ครั้งแรกตาม sessionStorage */
  fromStoryUpload?: boolean;
}

/** คลิปจาก S3 fallback / คลิปทักทาย — ไม่มี UUID ใน talent_videos จึงยังไม่ไลค์/คอมเมนต์ผ่าน API ได้ */
function engagementBlockedReason(
  v: TalentVideo,
): "s3" | "greeting" | "sponsored" | null {
  if (isSponsoredVideo(v)) return "sponsored";
  if (!v?.id) return "s3";
  if (v.id.startsWith("s3-")) return "s3";
  if (v.id.startsWith("ad-")) return "sponsored";
  if (v.id === "greeting") return "greeting";
  return null;
}

function canPersistEngagement(v: TalentVideo): boolean {
  return engagementBlockedReason(v) === null;
}

function handleSponsoredCta(
  v: TalentVideo,
  navigate: (path: string) => void,
): void {
  const run = async () => {
    let clickId: string | undefined;
    if (v.ad?.publicImpressionId) {
      const out = await adsService.recordClick({
        publicImpressionId: v.ad.publicImpressionId,
        campaignId: v.ad.campaignId,
        creativeId: v.ad.creativeId,
        surface: "VIDEO_FEED",
      });
      clickId = out?.publicClickId;
    }
    const dest = v.ad?.destinationUrl || "/";
    const attr = adsService.getStoredClickAttribution();
    const clickParam = clickId || attr?.publicClickId;
    let target = dest;
    if (clickParam && dest.startsWith("/")) {
      const sep = dest.includes("?") ? "&" : "?";
      target = `${dest}${sep}ad_click=${encodeURIComponent(clickParam)}`;
    }
    if (dest.startsWith("http")) window.open(dest, "_blank");
    else if (dest.startsWith("/")) navigate(target);
  };
  void run();
}

function buildVideoFeedShareUrl(v: TalentVideo): string {
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "";
  const hash =
    v.id && !v.id.startsWith("s3-") && v.id !== "greeting"
      ? `#/video-feed?video=${encodeURIComponent(v.id)}`
      : "#/video-feed";
  return `${base}${hash}`;
}

function engagementBlockedMessage(
  v: TalentVideo,
): { th: string; en: string } | null {
  const r = engagementBlockedReason(v);
  if (!r) return null;
  if (r === "s3") {
    return {
      th: "คลิปตัวอย่างจากคลัง — ไลค์/คอมเมนต์/บันทึกได้เมื่อมีคลิปจาก Talent ในระบบ (อัปโหลดคลิปผ่านแอป)",
      en: "Demo clip from storage — like/comment/save work when the feed shows Talent uploads from the app.",
    };
  }
  if (r === "sponsored") {
    return {
      th: "คลิปโปรโมต — ใช้ปุ่มดูเพิ่มเติมแทนการไลค์/คอมเมนต์ (บันทึกได้ที่ปุ่มบุ๊กมาร์กแถบขวา)",
      en: "Promoted clip — use CTA for details; bookmark on the right saves it.",
    };
  }
  return {
    th: "คลิปทักทาย — ใช้คลิปอัปโหลดในฟีดเพื่อกดไลค์ คอมเมนต์ และบันทึก",
    en: "Greeting clip — upload a feed clip to like, comment, and save.",
  };
}

function formatEngagementCount(n: number | undefined): string {
  const x = Math.max(0, n ?? 0);
  if (x >= 1_000_000)
    return `${(x / 1_000_000).toFixed(1)}M`.replace(/\.0M$/, "M");
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

const VideoFeed: React.FC<VideoFeedProps> = ({
  initialVideo,
  fromStoryUpload = false,
}) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { config } = useMobileAppConfig();
  const { notify } = useNotification();
  const signupsEnabled = config.featureFlags.enableSignups;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<TalentVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [feedMuted, setFeedMuted] = useState(false);
  const [sponsoredMuted, setSponsoredMuted] = useState(true);
  const [myVideos, setMyVideos] = useState<TalentVideo[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [aiResumeLocked, setAiResumeLocked] = useState(true);
  const [aiResumeCredits, setAiResumeCredits] = useState(0);
  const [showCommentModal, setShowCommentModal] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentSheetTab, setCommentSheetTab] = useState<
    "comments" | "reviews"
  >("comments");
  const [commentsNewestFirst, setCommentsNewestFirst] = useState(true);
  const [replyingTo, setReplyingTo] = useState<VideoComment | null>(null);
  const [expandedReplyIds, setExpandedReplyIds] = useState<
    Record<string, boolean>
  >({});
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [blockedTalentIds, setBlockedTalentIds] = useState<Set<string>>(
    new Set(),
  );
  const [hiddenVideoIds, setHiddenVideoIds] = useState<Set<string>>(new Set());
  const [shareSheetVideo, setShareSheetVideo] = useState<TalentVideo | null>(
    null,
  );
  const [saveClipModalVideo, setSaveClipModalVideo] =
    useState<TalentVideo | null>(null);
  const [saveClipModalRemoving, setSaveClipModalRemoving] = useState(false);
  const [saveInFlightId, setSaveInFlightId] = useState<string | null>(null);
  const [savedPromotedCreativeIds, setSavedPromotedCreativeIds] = useState<
    Set<string>
  >(new Set());
  const [showStoryTipBanner, setShowStoryTipBanner] = useState(false);
  const [boostVideoTarget, setBoostVideoTarget] = useState<TalentVideo | null>(
    null,
  );
  const [boostLoading, setBoostLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const dismissStoryTipKey = "aqond_story_feed_tip_dismissed";

  useEffect(() => {
    if (!fromStoryUpload) return;
    try {
      if (typeof sessionStorage === "undefined") return;
      if (sessionStorage.getItem(dismissStoryTipKey) === "1") return;
      setShowStoryTipBanner(true);
    } catch {
      /* ignore */
    }
  }, [fromStoryUpload]);

  const isProvider = user?.role === UserRole.PROVIDER;

  useEffect(() => {
    if (!user?.id || !isProvider) {
      setAiResumeLocked(true);
      setAiResumeCredits(0);
      return;
    }
    fetchTalentVideoEntitlement()
      .then((ent) => {
        setAiResumeLocked(!!ent.locked);
        setAiResumeCredits(ent.creditsRemaining ?? 0);
      })
      .catch(() => {
        setAiResumeLocked(true);
        setAiResumeCredits(0);
      });
  }, [user?.id, isProvider]);

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

  useEffect(() => {
    if (!user?.id) {
      setSavedPromotedCreativeIds(new Set());
      return;
    }
    videoService
      .getSavedPromotedCreativeIds()
      .then((ids) => setSavedPromotedCreativeIds(new Set(ids)))
      .catch(() => setSavedPromotedCreativeIds(new Set()));
  }, [user?.id]);

  // รวมคลิปของตัวเองไว้ด้านหน้า (initialVideo + myVideos ที่ยังไม่อยู่ใน feed) — ไม่รวม blocked
  const orderedVideos = React.useMemo(() => {
    const feed = videos.filter(
      (v) => !v.talent_id || !blockedTalentIds.has(v.talent_id),
    );
    const my = myVideos.filter(
      (v) => !v.talent_id || !blockedTalentIds.has(v.talent_id),
    );
    const myUrls = new Set(my.map((v) => v.video_url));
    const feedUrls = new Set(feed.map((v) => v.video_url));

    let prepend: TalentVideo[] = [];
    if (
      initialVideo &&
      !blockedTalentIds.has(initialVideo.talent_id || "") &&
      !feedUrls.has(initialVideo.video_url)
    ) {
      prepend.push(initialVideo);
    }
    my.forEach((v) => {
      if (
        !feedUrls.has(v.video_url) &&
        !prepend.some((p) => p.video_url === v.video_url)
      ) {
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
    if (!el || !currentVideo || isSponsoredVideo(currentVideo)) return;
    el.pause();
    el.currentTime = 0;
    const tryPlay = () => {
      if (playing) void el.play().catch(() => {});
    };
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    } else {
      el.addEventListener("loadeddata", tryPlay, { once: true });
      return () => el.removeEventListener("loadeddata", tryPlay);
    }
  }, [currentIndex, currentVideo?.id, playing]);

  useEffect(() => {
    if (!currentVideo || !isSponsoredVideo(currentVideo)) return;
    setSponsoredMuted(true);
    const t = setTimeout(() => {
      if (currentVideo.ad?.publicImpressionId) {
        /* impression reserved server-side; optional client ping later */
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [currentVideo?.id, currentVideo?.ad?.publicImpressionId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = feedMuted;
    if (playing) el.play().catch(() => {});
    else el.pause();
  }, [playing, feedMuted]);

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
        prev.map((x) => (x.id === id ? { ...x, ...upd } : x)),
      );
      setMyVideos((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...upd } : x)),
      );
    },
    [],
  );

  const updatePromotedSaveState = useCallback(
    (creativeId: string, saved: boolean) => {
      setSavedPromotedCreativeIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(creativeId);
        else next.delete(creativeId);
        return next;
      });
      setVideos((prev) =>
        prev.map((x) =>
          x.ad?.creativeId === creativeId ? { ...x, saved_by_me: saved } : x,
        ),
      );
    },
    [],
  );

  const isClipSavedByMe = useCallback(
    (v: TalentVideo) => {
      if (v.saved_by_me) return true;
      const cid = v.ad?.creativeId;
      return !!(cid && savedPromotedCreativeIds.has(cid));
    },
    [savedPromotedCreativeIds],
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
        language === "en"
          ? "Sign in to like clips"
          : "กรุณาเข้าสู่ระบบเพื่อกดไลค์",
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
      updateVideoInList(v.id, {
        liked_by_me: res.liked,
        like_count: res.like_count,
      });
    } catch (e) {
      console.error("Like error:", e);
      notify(
        language === "en" ? "Could not update like" : "ไม่สามารถบันทึกไลค์ได้",
        "error",
      );
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
      notify(
        language === "en"
          ? "Sign in to comment"
          : "กรุณาเข้าสู่ระบบเพื่อคอมเมนต์",
        "warning",
      );
      return;
    }
    try {
      const res = await videoService.addComment(
        vid,
        commentText.trim(),
        replyingTo?.id ?? null,
      );
      setCommentText("");
      setReplyingTo(null);
      await loadComments(vid);
      setVideos((prev) =>
        prev.map((x) =>
          x.id === vid ? { ...x, comment_count: res.comment_count } : x,
        ),
      );
      setMyVideos((prev) =>
        prev.map((x) =>
          x.id === vid ? { ...x, comment_count: res.comment_count } : x,
        ),
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
    v.title
      ? `${v.title} — ดูคลิปฝีมือช่างบน aqond`
      : "ดูคลิปฝีมือช่างบน aqond";

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
      if (
        channel === "instagram" ||
        channel === "youtube" ||
        channel === "discord"
      ) {
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
      notify(
        language === "en"
          ? "Sign in to save clips"
          : "กรุณาเข้าสู่ระบบเพื่อบันทึกคลิป",
        "warning",
      );
      return;
    }

    if (isSponsoredVideo(v)) {
      const creativeId = v.ad?.creativeId;
      if (!creativeId) {
        notify(
          language === "en"
            ? "Cannot save this promoted clip"
            : "บันทึกโฆษณานี้ไม่ได้ — ไม่พบรหัสครีเอทีฟ",
          "info",
        );
        return;
      }
      const flightKey = `promo:${creativeId}`;
      if (saveInFlightId === flightKey) return;
      setSaveInFlightId(flightKey);
      try {
        const r = await videoService.togglePromotedSave(v);
        updatePromotedSaveState(creativeId, r.saved);
        if (r.saved) {
          setSaveClipModalVideo({
            ...v,
            saved_by_me: true,
            talent_name: language === "en" ? "Promoted" : "โปรโมต",
          });
          notify(
            language === "en" ? "Promoted clip saved" : "บันทึกคลิปโปรโมตแล้ว",
            "success",
          );
        } else {
          setSaveClipModalVideo((cur) =>
            cur?.ad?.creativeId === creativeId ? null : cur,
          );
          notify(
            language === "en"
              ? "Removed from saved clips"
              : "นำออกจากคลิปที่บันทึกแล้ว",
            "success",
          );
        }
        window.dispatchEvent(new Event("aqond:saved-clips-changed"));
      } catch (e: unknown) {
        console.error("Promoted save error:", e);
        const serverMsg =
          (e as { response?: { data?: { error?: string } } })?.response?.data
            ?.error || "";
        notify(
          language === "en"
            ? serverMsg || "Could not update save"
            : serverMsg || "บันทึกคลิปโปรโมตไม่สำเร็จ",
          "error",
        );
      } finally {
        setSaveInFlightId((cur) => (cur === flightKey ? null : cur));
      }
      return;
    }

    const blocked = engagementBlockedMessage(v);
    if (blocked) {
      notify(language === "en" ? blocked.en : blocked.th, "info");
      return;
    }
    if (saveInFlightId === v.id) return;
    setSaveInFlightId(v.id);
    try {
      const r = await videoService.toggleSave(v.id);
      updateVideoInList(v.id, {
        saved_by_me: r.saved,
        save_count: r.save_count,
      });
      if (r.saved) {
        setSaveClipModalVideo({
          ...v,
          saved_by_me: true,
          save_count: r.save_count,
        });
        notify(
          language === "en" ? "Clip saved" : "บันทึกคลิปแล้ว",
          "success",
        );
      } else {
        setSaveClipModalVideo((cur) => (cur?.id === v.id ? null : cur));
        notify(
          language === "en"
            ? "Removed from saved clips"
            : "นำออกจากคลิปที่บันทึกแล้ว",
          "success",
        );
      }
      window.dispatchEvent(new Event("aqond:saved-clips-changed"));
    } catch (e: unknown) {
      console.error("Save error:", e);
      const serverMsg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "";
      notify(
        language === "en"
          ? serverMsg || "Could not update save"
          : serverMsg || "บันทึกคลิปไม่สำเร็จ",
        "error",
      );
    } finally {
      setSaveInFlightId((cur) => (cur === v.id ? null : cur));
    }
  };

  const handleRemoveSavedFromModal = async () => {
    const v = saveClipModalVideo;
    if (!v?.id || !user?.id || saveClipModalRemoving) return;
    setSaveClipModalRemoving(true);
    try {
      if (isSponsoredVideo(v) && v.ad?.creativeId) {
        const r = await videoService.togglePromotedSave(v);
        updatePromotedSaveState(v.ad.creativeId, r.saved);
      } else {
        const r = await videoService.toggleSave(v.id);
        updateVideoInList(v.id, {
          saved_by_me: r.saved,
          save_count: r.save_count,
        });
      }
      setSaveClipModalVideo(null);
      notify(
        language === "en"
          ? "Removed from saved clips"
          : "นำออกจากคลิปที่บันทึกแล้ว",
        "success",
      );
      window.dispatchEvent(new Event("aqond:saved-clips-changed"));
    } catch (e) {
      console.error("Remove save error:", e);
      notify(
        language === "en" ? "Could not update save" : "ยกเลิกบันทึกไม่สำเร็จ",
        "error",
      );
    } finally {
      setSaveClipModalRemoving(false);
    }
  };

  const handleNotInterested = (v: TalentVideo) => {
    setHiddenVideoIds((prev) => new Set(prev).add(v.id));
    setShowActionsMenu(null);
    notify(
      language === "en"
        ? "We’ll show fewer clips like this in this session."
        : "จะแสดงคลิปแบบนี้น้อยลงในรอบนี้",
      "info",
    );
  };

  const handleBoost = async (pack: "starter" | "growth" | "pro") => {
    if (!boostVideoTarget?.id) return;
    setBoostLoading(true);
    try {
      const out = await videoService.boostVideo(boostVideoTarget.id, pack);
      if (out.success) {
        notify(
          out.message ||
            (language === "en" ? "Promotion started" : "เริ่มโปรโมตคลิปแล้ว"),
          "success",
        );
        setBoostVideoTarget(null);
      } else {
        notify(out.error || "โปรโมตไม่สำเร็จ", "error");
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        (language === "en" ? "Boost failed" : "โปรโมตไม่สำเร็จ");
      notify(msg, "error");
    } finally {
      setBoostLoading(false);
    }
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
            Talents
            สามารถอัปโหลดคลิปผลงานเพื่อให้ลูกค้าเห็นฝีมือและจ้างงานได้ทันที
          </p>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="p-6 rounded-full bg-slate-100 mb-6">
            <Sparkles size={48} className="text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            ยังไม่มีคลิปในฟีด
          </h2>
          <p className="text-slate-600 mb-6 max-w-sm">
            เป็น Talent อยู่แล้ว?
            อัปโหลดคลิปผลงานของคุณเพื่อให้ลูกค้าเห็นฝีมือและจ้างงานได้เลย
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            {isProvider ? (
              <>
                <Link
                  to={aiResumeLocked ? "/referral?tab=ai" : "/talent/ai-resume"}
                  className="px-6 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 flex items-center gap-2 relative"
                >
                  <Sparkles size={20} />
                  {aiResumeLocked ? "ปลดล็อก Resume AI" : "สร้าง Resume AI"}
                  {aiResumeLocked ? (
                    <Lock size={14} className="opacity-90" aria-hidden />
                  ) : null}
                </Link>
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
                      notify(
                        "การสมัครสมาชิกถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
                        "warning",
                      )
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

  const slide = currentVideo;
  const sponsoredHasVideo =
    !!slide &&
    isSponsoredVideo(slide) &&
    !!sponsoredMediaSources(slide).videoSrc;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-black">
      {/* Floating chrome — TikTok-style minimal top bar over video */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-0.5">
          <Link
            to="/"
            className="inline-flex items-center gap-0.5 rounded-lg py-0.5 pr-2 text-[13px] font-semibold text-white drop-shadow-md transition active:scale-[0.98] hover:bg-white/10"
            aria-label={language === "en" ? "Back to Home" : "กลับหน้าแรก"}
          >
            <ChevronLeft size={20} strokeWidth={2.5} aria-hidden />
            Home
          </Link>
          <p className="text-sm font-semibold text-white/90 drop-shadow-md">
            {language === "en" ? "For You" : "ฟีดวิดีโอ"}
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 pt-0.5">
          {user?.id ? (
            <Link
              to="/video-feed/saved"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
              aria-label={language === "en" ? "Saved clips list" : "รายการคลิปที่บันทึก"}
            >
              <Bookmark size={18} strokeWidth={2.25} />
            </Link>
          ) : null}
          {isProvider ? (
            <>
              <Link
                to={aiResumeLocked ? "/referral?tab=ai" : "/talent/ai-resume"}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
                aria-label={
                  language === "en"
                    ? aiResumeLocked
                      ? "Unlock AI Resume — invite 10 friends"
                      : "Create AI Resume video"
                    : aiResumeLocked
                      ? "ปลดล็อก Resume AI — ชวนเพื่อน 10 คน"
                      : "สร้างวิดีโอ Resume AI"
                }
              >
                <Sparkles size={18} />
                {aiResumeLocked ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white ring-2 ring-black/40">
                    <Lock size={9} strokeWidth={3} aria-hidden />
                  </span>
                ) : aiResumeCredits > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-0.5 text-[9px] font-bold text-white ring-2 ring-black/40">
                    {aiResumeCredits}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
                aria-label={language === "en" ? "Upload" : "อัปโหลด"}
              >
                <Upload size={18} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {showStoryTipBanner ? (
        <div
          role="status"
          className="absolute left-3 right-3 top-12 z-40 flex gap-2 rounded-xl border border-white/15 bg-black/75 px-3 py-2 text-xs text-white/90 backdrop-blur-md"
        >
          <p className="min-w-0 flex-1 leading-relaxed">
            {language === "en"
              ? "Swipe up/down for the next clip — upload more from Profile → Story."
              : "ปัดขึ้น/ลงดูคลิปถัดไป — อัปโหลดเพิ่มได้ที่ โปรไฟล์ → แท็บสตอรี่"}
          </p>
          <button
            type="button"
            aria-label={language === "en" ? "Close" : "ปิด"}
            onClick={() => {
              try {
                sessionStorage.setItem(dismissStoryTipKey, "1");
              } catch {
                /* ignore */
              }
              setShowStoryTipBanner(false);
            }}
            className="shrink-0 rounded-lg p-1 text-white/70 hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {/* Feed — single active slide (TikTok-style) */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 w-full touch-pan-y overflow-hidden bg-black"
        onWheel={handleWheel}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {currentVideo ? (
          <div key={currentVideo.id} className="absolute inset-0 h-full w-full">
            {isSponsoredVideo(currentVideo) ? (
              <SponsoredFeedSlide
                video={currentVideo}
                language={language}
                muted={sponsoredMuted}
                onMutedChange={setSponsoredMuted}
                onCta={() => handleSponsoredCta(currentVideo, navigate)}
              />
            ) : (
              <VideoBrandOverlay
                videoRef={videoRef}
                showEndCard={false}
                loop={true}
                className="relative h-full w-full"
              >
                <video
                  ref={videoRef}
                  src={currentVideo.video_url}
                  key={currentVideo.id}
                  className="absolute inset-0 h-full w-full object-cover"
                  loop
                  muted={feedMuted}
                  playsInline
                  autoPlay
                  onClick={() => setPlaying((p) => !p)}
                  poster={currentVideo.thumbnail_url || undefined}
                />
              </VideoBrandOverlay>
            )}

            {slide && isSponsoredVideo(slide) ? (
              <div className="pointer-events-auto absolute right-2 bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))] z-[70] flex flex-col items-center justify-end gap-3.5">
                {sponsoredHasVideo ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSponsoredMuted((m) => !m);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 backdrop-blur-sm shadow-md active:scale-95 transition-transform"
                    title={
                      sponsoredMuted
                        ? language === "en"
                          ? "Unmute"
                          : "เปิดเสียง"
                        : language === "en"
                          ? "Mute"
                          : "ปิดเสียง"
                    }
                    aria-label={
                      sponsoredMuted
                        ? language === "en"
                          ? "Unmute"
                          : "เปิดเสียง"
                        : language === "en"
                          ? "Mute"
                          : "ปิดเสียง"
                    }
                  >
                    {sponsoredMuted ? (
                      <VolumeX size={24} strokeWidth={2.25} />
                    ) : (
                      <Volume2 size={24} strokeWidth={2.25} />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave(slide);
                  }}
                  className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                    saveInFlightId === `promo:${slide.ad?.creativeId || ""}`
                      ? "opacity-60"
                      : ""
                  }`}
                  title={
                    isClipSavedByMe(slide)
                      ? language === "en"
                        ? "Unsave"
                        : "ยกเลิกบันทึก"
                      : language === "en"
                        ? "Save"
                        : "บันทึก"
                  }
                  aria-label={
                    isClipSavedByMe(slide)
                      ? language === "en"
                        ? "Unsave promoted clip"
                        : "ยกเลิกบันทึกคลิปโปรโมต"
                      : language === "en"
                        ? "Save promoted clip"
                        : "บันทึกคลิปโปรโมต"
                  }
                  disabled={
                    saveInFlightId === `promo:${slide.ad?.creativeId || ""}`
                  }
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                    <Bookmark
                      size={26}
                      className={
                        isClipSavedByMe(slide)
                          ? "text-amber-300 fill-amber-400/90"
                          : "text-white drop-shadow-md"
                      }
                      strokeWidth={2}
                    />
                  </span>
                </button>
              </div>
            ) : null}

            {slide && !isSponsoredVideo(slide) ? (
            <>
            {/* TikTok-style: ชื่อ + คำบรรยายมุมล่างซ้าย */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-14 z-[15] bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] text-white sm:right-20">
              <div className="pointer-events-auto max-w-[calc(100%-3rem)]">
                <div className="flex items-center gap-2 mb-1">
                  {slide.talent_id ? (
                    <Link
                      to={`/talents/${slide.talent_id}`}
                      className="flex items-center gap-2 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden ring-2 ring-white/25 shrink-0">
                        {slide.talent_avatar ? (
                          <img
                            src={slide.talent_avatar}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <span className="font-semibold text-[15px] truncate drop-shadow-md">
                        @{slide.talent_name || "Talent"}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                        {slide.talent_avatar ? (
                          <img
                            src={slide.talent_avatar}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <span className="font-semibold truncate">
                        {slide.talent_name || "Talent"}
                      </span>
                    </div>
                  )}
                </div>
                {slide.title && (
                  <p className="text-sm text-white/95 leading-snug drop-shadow line-clamp-3">
                    {slide.title}
                  </p>
                )}
                {(engagementBlockedReason(slide!) === "s3" ||
                  engagementBlockedReason(slide!) === "greeting") && (
                  <p className="text-[10px] text-amber-200/95 mt-1.5 leading-snug max-w-[90vw]">
                    {language === "en"
                      ? "Demo or greeting clip — upload a portfolio clip to enable likes & comments."
                      : "คลิปตัวอย่างหรือทักทาย — อัปโหลดคลิปผลงานในฟีดเพื่อให้ไลค์/คอมเมนต์/บันทึกได้"}
                  </p>
                )}
                {typeof slide.view_count === "number" && slide.view_count > 0 && (
                  <p className="text-[11px] text-white/75 mt-1.5 tabular-nums">
                    {language === "en" ? "Views " : "รับชม "}
                    {formatEngagementCount(slide.view_count)}
                  </p>
                )}
              </div>
            </div>
            {/* TikTok-style: แถบโต้ตอบขวา — แสดงทุกคลิป; ไลค์/คอมเมนต์บันทึกเมื่อคลิปซิงค์แล้ว */}
            <div className="pointer-events-auto absolute right-2 bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))] z-[70] flex flex-col items-center justify-end gap-3.5">
              {slide.talent_id && (
                <Link
                  to={`/talents/${slide.talent_id}`}
                  state={{ fromVideoFeed: true }}
                  className="flex flex-col items-center gap-0.5 mb-1"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={
                    language === "en"
                      ? "View provider & hire"
                      : "ดูโปรไฟล์และจ้างงาน"
                  }
                >
                  <div className="w-12 h-12 rounded-full border-2 border-white/90 overflow-hidden shadow-lg ring-2 ring-black/30">
                    {slide.talent_avatar ? (
                      <img
                        src={slide.talent_avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
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
                  handleLike(slide!);
                }}
                className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                  !canPersistEngagement(slide!) ? "opacity-60" : ""
                }`}
                title={language === "en" ? "Like" : "ไลค์"}
                aria-label="Like"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <Heart
                    size={28}
                    className={
                      slide.liked_by_me
                        ? "fill-red-500 text-red-500"
                        : "text-white drop-shadow-md"
                    }
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(slide.like_count)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenComments(slide!);
                }}
                className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                  !canPersistEngagement(slide!) ? "opacity-60" : ""
                }`}
                title={language === "en" ? "Comments" : "คอมเมนต์"}
                aria-label="Comments"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <MessageCircle
                    size={27}
                    className="text-white drop-shadow-md"
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(slide.comment_count)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave(slide!);
                }}
                className={`flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${
                  !canPersistEngagement(slide!) || saveInFlightId === slide!.id
                    ? "opacity-60"
                    : ""
                }`}
                title={
                  isClipSavedByMe(slide!)
                    ? language === "en"
                      ? "Unsave"
                      : "ยกเลิกบันทึก"
                    : language === "en"
                      ? "Save"
                      : "บันทึก"
                }
                aria-label={
                  isClipSavedByMe(slide!)
                    ? language === "en"
                      ? "Unsave clip"
                      : "ยกเลิกบันทึกคลิป"
                    : language === "en"
                      ? "Save clip"
                      : "บันทึกคลิป"
                }
                disabled={saveInFlightId === slide!.id}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <Bookmark
                    size={26}
                    className={
                      isClipSavedByMe(slide!)
                        ? "text-amber-300 fill-amber-400/90"
                        : "text-white drop-shadow-md"
                    }
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(slide.save_count)}
                </span>
              </button>
              {slide.talent_id && slide.talent_id !== user?.id && (
                <Link
                  to={`/talents/${slide.talent_id}`}
                  state={{ fromVideoFeed: true, hireIntent: true }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
                  title={
                    language === "en" ? "Hire this provider" : "จ้างงานทันที"
                  }
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
                  openShareSheet(slide!);
                }}
                className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
                title={language === "en" ? "Share" : "แชร์"}
                aria-label="Share"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm shadow-md">
                  <Share2 size={25} className="text-white drop-shadow-md" />
                </span>
                <span className="text-[11px] font-semibold text-white drop-shadow-md tabular-nums">
                  {formatEngagementCount(slide.share_count)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFeedMuted((m) => !m);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 backdrop-blur-sm shadow-md"
                title={feedMuted ? (language === "en" ? "Unmute" : "เปิดเสียง") : language === "en" ? "Mute" : "ปิดเสียง"}
                aria-label={feedMuted ? (language === "en" ? "Unmute" : "เปิดเสียง") : language === "en" ? "Mute" : "ปิดเสียง"}
              >
                {feedMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
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
                    setShowActionsMenu(showActionsMenu === slide.id ? null : slide.id);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 backdrop-blur-sm shadow-md"
                  title={language === "en" ? "More" : "เพิ่มเติม"}
                  aria-label="More"
                >
                  <MoreVertical size={24} />
                </button>
                {showActionsMenu === slide.id &&
                  createPortal(
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-[150] bg-black/30"
                        aria-label={language === "en" ? "Close menu" : "ปิดเมนู"}
                        onClick={() => setShowActionsMenu(null)}
                      />
                      <div
                        role="menu"
                        className="fixed right-3 z-[200] min-w-[220px] max-w-[min(calc(100vw-1.5rem),280px)] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50 py-1 text-slate-900 shadow-2xl ring-1 ring-black/5 bottom-[max(5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))]"
                      >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const blocked = engagementBlockedMessage(slide!);
                        if (blocked) {
                          notify(
                            language === "en" ? blocked.en : blocked.th,
                            "info",
                          );
                          setShowActionsMenu(null);
                          return;
                        }
                        setShowReportModal(slide.id);
                        setShowActionsMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-100"
                    >
                      <Flag size={16} className="shrink-0 text-red-600" />
                      {language === "en"
                        ? "Report this clip"
                        : "แจ้งรายงานคลิปนี้"}
                    </button>
                    {user?.id &&
                      slide.talent_id === user.id &&
                      !isSponsoredVideo(slide!) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowActionsMenu(null);
                            setBoostVideoTarget(slide!);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-800 hover:bg-amber-50"
                        >
                          <Sparkles
                            size={16}
                            className="shrink-0 text-amber-600"
                          />
                          {language === "en" ? "Promote clip" : "โปรโมตคลิป"}
                        </button>
                      )}
                    {slide.talent_id && slide.talent_id !== user?.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBlock(slide!);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-slate-100"
                      >
                        <Ban size={16} className="shrink-0 text-rose-600" />
                        {language === "en" ? "Block creator" : "บล็อก Talent"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotInterested(slide!);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 [&_svg]:shrink-0 [&_svg]:text-slate-600"
                    >
                      <EyeOff size={16} />
                      {language === "en" ? "Not interested" : "ไม่สนใจคลิปนี้"}
                    </button>
                    <div className="my-1 border-t border-slate-200" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openShareSheet(slide!);
                        setShowActionsMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 [&_svg]:shrink-0 [&_svg]:text-slate-600"
                    >
                      <Share2 size={16} />
                      {language === "en" ? "Share to…" : "แชร์ไปยัง…"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyVideoLinkOnly(slide!);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 [&_svg]:shrink-0 [&_svg]:text-slate-600"
                    >
                      <Link2 size={16} />
                      {language === "en" ? "Copy link" : "คัดลอกลิงก์"}
                    </button>
                    {slide.talent_id && (
                      <Link
                        to={`/talents/${slide.talent_id}`}
                        state={{ fromVideoFeed: true }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 [&_svg]:shrink-0 [&_svg]:text-slate-600"
                      >
                        <User size={16} />
                        {language === "en"
                          ? "Talent profile"
                          : "โปรไฟล์ Talent"}
                      </Link>
                    )}
                      </div>
                    </>,
                    document.body,
                  )}
              </div>
            </div>
            </>
            ) : null}
          </div>
        ) : null}
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
                    aria-label={
                      language === "en"
                        ? "Sort comments"
                        : "เรียงลำดับความคิดเห็น"
                    }
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
                      {language === "en"
                        ? "No comments yet"
                        : "ยังไม่มีความคิดเห็น"}
                    </p>
                  ) : (
                    <ul className="space-y-4 pb-2">
                      {commentThread.roots.map((c) => {
                        const replies =
                          commentThread.repliesByParent.get(c.id) || [];
                        const replyCount = replies.length;
                        const expanded = !!expandedReplyIds[c.id];
                        return (
                          <li key={c.id} className="flex gap-2.5">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-200">
                              {c.user_avatar ? (
                                <img
                                  src={c.user_avatar}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <User
                                  size={18}
                                  className="m-1.5 text-slate-500"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[14px] font-semibold leading-snug text-slate-900">
                                    {c.user_name ||
                                      (language === "en" ? "User" : "ผู้ใช้")}
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-snug text-slate-900">
                                    {c.text}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
                                    <span>
                                      {formatCommentTimeShort(c.created_at)}
                                    </span>
                                    <button
                                      type="button"
                                      className="font-medium text-slate-500 hover:text-slate-800"
                                      onClick={() => {
                                        if (!user?.id) {
                                          notify(
                                            language === "en"
                                              ? "Sign in to reply"
                                              : "กรุณาเข้าสู่ระบบเพื่อตอบกลับ",
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
                                        {language === "en"
                                          ? "View"
                                          : "ดูการตอบกลับ"}{" "}
                                        {replyCount}{" "}
                                        {language === "en"
                                          ? "replies"
                                          : "รายการ"}
                                      </span>
                                      <ChevronDown
                                        size={14}
                                        className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                                      />
                                    </button>
                                  )}
                                  {expanded &&
                                    replies.map((r) => (
                                      <div
                                        key={r.id}
                                        className="mt-3 flex gap-2 border-l border-slate-100 pl-3"
                                      >
                                        <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-slate-200">
                                          {r.user_avatar ? (
                                            <img
                                              src={r.user_avatar}
                                              alt=""
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            <User
                                              size={14}
                                              className="m-1.5 text-slate-500"
                                            />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[13px] font-semibold text-slate-900">
                                            {r.user_name ||
                                              (language === "en"
                                                ? "User"
                                                : "ผู้ใช้")}
                                          </p>
                                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-900">
                                            {r.text}
                                          </p>
                                          <div className="mt-1 text-[11px] text-slate-500">
                                            {formatCommentTimeShort(
                                              r.created_at,
                                            )}
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
                                    <Heart
                                      size={18}
                                      strokeWidth={1.75}
                                      className="fill-none"
                                    />
                                  </button>
                                  <span className="text-[11px] leading-none">
                                    0
                                  </span>
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
                        <span className="font-semibold text-slate-900">
                          {replyingTo.user_name || "…"}
                        </span>
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
                        <img
                          src={user.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
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
                            language === "en"
                              ? "Photo comments coming soon"
                              : "แนบรูปเร็วๆ นี้",
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
                          notify(
                            language === "en"
                              ? "Emoji picker coming soon"
                              : "อีโมจิเร็วๆ นี้",
                            "info",
                          )
                        }
                      >
                        <Smile size={18} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="shrink-0 p-1 text-slate-500 hover:text-slate-800"
                        aria-label="Mention"
                        onClick={() =>
                          notify(
                            language === "en"
                              ? "Mentions coming soon"
                              : "กล่าวถึงเร็วๆ นี้",
                            "info",
                          )
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
            {typeof navigator !== "undefined" &&
              typeof navigator.share === "function" && (
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
                <Link2
                  size={22}
                  className="text-indigo-600"
                  strokeWidth={2.25}
                />
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
                    executeShareChannel(
                      shareSheetVideo,
                      key === "x" ? "twitter" : key,
                    )
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

      {saveClipModalVideo && (
        <div
          className="fixed inset-0 z-[118] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={() => {
            if (!saveClipModalRemoving) setSaveClipModalVideo(null);
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50 shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Bookmark size={20} className="fill-emerald-700/15" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900">
                    {language === "en" ? "Clip saved" : "บันทึกคลิปแล้ว"}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {language === "en"
                      ? "You can remove it from here anytime."
                      : "ลบออกจากที่บันทึกได้จากหน้านี้เมื่อไม่ต้องการ"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-200/80"
                disabled={saveClipModalRemoving}
                onClick={() => setSaveClipModalVideo(null)}
                aria-label={language === "en" ? "Close" : "ปิด"}
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex gap-3 p-5">
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-200">
                {saveClipModalVideo.thumbnail_url ? (
                  <img
                    src={saveClipModalVideo.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-700/10">
                    <Video size={28} className="text-slate-400" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-sm font-semibold leading-snug text-slate-900">
                  {saveClipModalVideo.title?.trim()
                    ? saveClipModalVideo.title
                    : language === "en"
                      ? "Untitled clip"
                      : "คลิปไม่มีชื่อ"}
                </p>
                {(saveClipModalVideo.talent_name ||
                  saveClipModalVideo.talent_id) && (
                  <p className="mt-1 truncate text-xs text-slate-600">
                    @{saveClipModalVideo.talent_name || "Talent"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200/80 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setSaveClipModalVideo(null);
                  navigate("/video-feed/saved");
                }}
                disabled={saveClipModalRemoving}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {language === "en"
                  ? "Open saved clips"
                  : "ดูคลิปที่บันทึกทั้งหมด"}
              </button>
              <button
                type="button"
                onClick={handleRemoveSavedFromModal}
                disabled={saveClipModalRemoving}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white py-3 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-60"
              >
                {saveClipModalRemoving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Trash2 size={18} />
                )}
                {language === "en" ? "Remove from saved" : "ลบออกจากที่บันทึก"}
              </button>
              <button
                type="button"
                onClick={() => setSaveClipModalVideo(null)}
                disabled={saveClipModalRemoving}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {language === "en" ? "Close" : "ปิด"}
              </button>
            </div>
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

      {boostVideoTarget && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-bold">
                  {language === "en" ? "Promote clip" : "โปรโมตคลิป"}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {language === "en"
                    ? "Show this clip in Video Feed to more viewers."
                    : "แสดงคลิปในฟีดให้คนดูมากขึ้น — หักจากกระเป๋าเงิน"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !boostLoading && setBoostVideoTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              {(
                [
                  [
                    "starter",
                    "Starter",
                    "50",
                    language === "en" ? "Basic reach" : "เข้าถึงพื้นฐาน",
                  ],
                  [
                    "growth",
                    "Growth",
                    "150",
                    language === "en" ? "More impressions" : "แสดงมากขึ้น",
                  ],
                  [
                    "pro",
                    "Pro",
                    "500",
                    language === "en" ? "Maximum push" : "โปรโมตเต็มที่",
                  ],
                ] as const
              ).map(([pack, label, thb, desc]) => (
                <button
                  key={pack}
                  type="button"
                  disabled={boostLoading}
                  onClick={() => void handleBoost(pack)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-60 text-left"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                  <span className="font-bold text-amber-700">{thb} ฿</span>
                </button>
              ))}
            </div>
            {boostLoading && (
              <p className="mt-3 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />{" "}
                {language === "en" ? "Processing…" : "กำลังดำเนินการ…"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoFeed;
