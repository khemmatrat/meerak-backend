import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { storyService, type UserStory } from "../services/storyService";
import { adsService, isSponsoredVideo } from "../services/adsService";
import { useAdViewability } from "../hooks/useAdViewability";
import { readCachedUserStories, cacheUserStories } from "../utils/storyCache";
import { jwtSubUserId } from "../utils/storyUserId";
import { StoryViewerFrame } from "../components/StoryViewerFrame";

function isSponsoredStory(s: UserStory): boolean {
  return isSponsoredVideo(s);
}

type StoryLocationState = {
  preloadedStories?: UserStory[];
  userName?: string;
};

export const StoryViewer: React.FC = () => {
  const { userId: paramUserId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as StoryLocationState;
  const [stories, setStories] = useState<UserStory[]>(
    () => navState.preloadedStories || [],
  );
  const [userName, setUserName] = useState(navState.userName || "");
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(!navState.preloadedStories?.length);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SLIDE_MS = 8000;

  const current = stories[index];
  const sponsored = current ? isSponsoredStory(current) : false;
  const storyImpressionId = sponsored ? current?.ad?.publicImpressionId || "" : "";
  const { rootRef: storyAdRef } = useAdViewability({
    impressionId: storyImpressionId,
    campaignId: current?.ad?.campaignId,
    creativeId: current?.ad?.creativeId,
    surface: "STORY_VIEWER",
    enabled: sponsored && !!storyImpressionId,
  });

  const fetchStoriesForUser = useCallback(async (rawId: string) => {
    const id = decodeURIComponent(rawId).trim();
    const cached = readCachedUserStories(id);
    if (cached?.length) {
      setStories(cached);
      setUserName(cached[0]?.user_name || "");
      setIndex(0);
      setLoading(false);
    }

    const tryIds = [id];
    const sub = jwtSubUserId();
    if (sub && sub !== id) tryIds.push(sub);

    let lastErr: unknown = null;
    for (const tryId of tryIds) {
      try {
        const data = await storyService.getUserStories(tryId);
        const list = data.stories || [];
        if (list.length) {
          setStories(list);
          setUserName(data.user?.user_name || list[0]?.user_name || "");
          setIndex(0);
          setLoadError(null);
          cacheUserStories(tryId, list);
          return;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (cached?.length) return;

    const err = lastErr as {
      response?: { status?: number };
      code?: string;
      message?: string;
    };
    setStories([]);
    if (
      !err?.response &&
      (err?.code === "ERR_NETWORK" ||
        String(err?.message || "").includes("Network"))
    ) {
      setLoadError("เชื่อมต่อ API ไม่สำเร็จ — รีเฟรชหน้าแล้วลองใหม่");
    } else {
      setLoadError(
        err?.response?.status === 404
          ? "ไม่พบสตอรี่ — ลองรีเฟรชหน้าแรก"
          : err?.response?.status === 401
            ? "เซสชันหมดอายุ — ออกจากระบบแล้วเข้าใหม่"
            : "โหลดสตอรี่ไม่สำเร็จ — ลองอีกครั้ง",
      );
    }
  }, []);

  const loadStories = useCallback(async () => {
    if (!paramUserId) {
      setLoadError("ไม่พบรหัสผู้ใช้");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setMediaError(false);
    await fetchStoriesForUser(paramUserId);
    setLoading(false);
  }, [paramUserId, fetchStoriesForUser]);

  const markViewed = useCallback(async (story: UserStory) => {
    if (!story?.id || viewedRef.current.has(story.id)) return;
    viewedRef.current.add(story.id);
    if (isSponsoredStory(story)) return;
    try {
      await storyService.recordView(story.id);
    } catch {
      /* ignore */
    }
  }, []);

  const closeViewer = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const goNext = useCallback(() => {
    if (index < stories.length - 1) setIndex((i) => i + 1);
    else closeViewer();
  }, [index, stories.length, closeViewer]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  useEffect(() => {
    setMediaError(false);
  }, [current?.id]);

  useEffect(() => {
    if (!current || loadError) return;
    markViewed(current);
    if (progressTimer.current) clearTimeout(progressTimer.current);
    if (current.media_type === "video" && !sponsored) return;
    const ms = sponsored ? SLIDE_MS + 2000 : SLIDE_MS;
    progressTimer.current = setTimeout(goNext, ms);
    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [current, goNext, markViewed, sponsored, loadError]);

  if (loading && !current) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center text-white">
        กำลังโหลดสตอรี่...
      </div>
    );
  }

  if (loadError || !current) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center text-white px-6">
        <p className="text-center text-slate-200 mb-2">
          {loadError || "ไม่พบสตอรี่"}
        </p>
        {paramUserId ? (
          <p className="text-xs text-slate-500 mb-6 break-all">{paramUserId}</p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void loadStories()}
            className="px-4 py-2 rounded-full bg-fuchsia-600 font-semibold text-sm"
          >
            ลองอีกครั้ง
          </button>
          <button
            type="button"
            onClick={closeViewer}
            className="px-4 py-2 rounded-full bg-white/15 font-semibold text-sm"
          >
            กลับหน้าแรก
          </button>
        </div>
      </div>
    );
  }

  const bg =
    (current.background_style?.bg as string) ||
    (current.media_type === "text" ? "#1e3a8a" : "#000");

  const displayName = sponsored
    ? current.ad?.isHouse
      ? "แนะนำโดย AQOND"
      : "โปรโมต"
    : userName;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col overflow-hidden">
      <StoryViewerFrame>
        <div ref={storyAdRef as React.RefObject<HTMLDivElement>} className="absolute inset-0 pointer-events-none" aria-hidden />
        {/* สื่อเต็มกรอบ 9:16 */}
        <div className="absolute inset-0">
          {current.media_url && current.media_type === "video" ? (
            <video
              key={current.id}
              src={current.media_url}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              playsInline
              muted
              onEnded={goNext}
              onError={() => setMediaError(true)}
            />
          ) : current.media_url && !mediaError ? (
            <img
              key={current.id}
              src={current.media_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setMediaError(true)}
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center px-6 sm:px-10"
              style={{ background: bg }}
            >
              {mediaError ? (
                <p className="text-white/80 text-sm mb-4 text-center">
                  โหลดรูปไม่สำเร็จ
                </p>
              ) : null}
              <p className="text-white text-xl sm:text-2xl font-bold text-center whitespace-pre-wrap break-words max-w-full leading-snug">
                {current.text_overlay || ""}
              </p>
            </div>
          )}
        </div>

        {/* gradient อ่านง่ายใต้ header */}
        <div
          className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10"
          aria-hidden
        />

        {/* progress */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          {stories.map((s, i) => (
            <div
              key={s.id}
              className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden"
            >
              <div
                className={`h-full bg-white transition-all duration-300 ${i < index ? "w-full" : i === index ? "w-full animate-pulse" : "w-0"}`}
              />
            </div>
          ))}
        </div>

        {/* header */}
        <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-4 pt-8 pb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!sponsored && current.user_avatar ? (
              <img
                src={current.user_avatar}
                alt=""
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0 ${sponsored ? "bg-amber-500 text-black font-bold" : "bg-slate-600"}`}
              >
                {sponsored ? "Ad" : (userName || "?").charAt(0)}
              </div>
            )}
            <span className="font-semibold text-sm truncate text-white drop-shadow">
              {displayName}
            </span>
          </div>
          <button
            type="button"
            onClick={closeViewer}
            className="p-2 rounded-full hover:bg-white/10 shrink-0"
            aria-label="ปิด"
          >
            <X size={24} className="text-white drop-shadow" />
          </button>
        </header>

        {/* tap zones */}
        <button
          type="button"
          className="absolute left-0 top-0 bottom-0 w-[28%] z-10"
          onClick={goPrev}
          aria-label="ก่อนหน้า"
        />
        <button
          type="button"
          className="absolute right-0 top-0 bottom-0 w-[28%] z-10"
          onClick={goNext}
          aria-label="ถัดไป"
        />

        {current.text_overlay &&
        current.media_type !== "text" &&
        current.media_url &&
        !mediaError ? (
          <p className="absolute bottom-20 left-0 right-0 z-20 text-center text-white text-sm px-6 drop-shadow-lg break-words">
            {current.text_overlay}
          </p>
        ) : null}

        {sponsored && current.ad?.destinationUrl && (
          <button
            type="button"
            className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white text-slate-900 px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg max-w-[90%]"
            onClick={async () => {
              let clickId: string | undefined;
              if (current.ad?.publicImpressionId) {
                const out = await adsService.recordClick({
                  publicImpressionId: current.ad.publicImpressionId,
                  campaignId: current.ad.campaignId,
                  creativeId: current.ad.creativeId,
                  surface: "STORY_VIEWER",
                });
                clickId = out?.publicClickId;
                void adsService.recordRenderEvent({
                  publicImpressionId: current.ad.publicImpressionId,
                  eventType: "ad_cta_clicked",
                  creativeId: current.ad.creativeId,
                  campaignId: current.ad.campaignId,
                  surface: "STORY_VIEWER",
                });
              }
              const dest = current.ad?.destinationUrl || "";
              const clickParam = clickId || adsService.getStoredClickAttribution()?.publicClickId;
              let target = dest;
              if (clickParam && dest.startsWith("/")) {
                const sep = dest.includes("?") ? "&" : "?";
                target = `${dest}${sep}ad_click=${encodeURIComponent(clickParam)}`;
              }
              if (dest.startsWith("http")) window.open(dest, "_blank");
              else if (dest.startsWith("/")) navigate(target);
            }}
          >
            <ExternalLink size={16} />
            ดูเพิ่มเติม
          </button>
        )}

        <div className="absolute bottom-4 left-0 right-0 flex justify-between px-3 pointer-events-none z-20 pb-[env(safe-area-inset-bottom)]">
          <ChevronLeft
            className={`text-white/40 drop-shadow ${index === 0 ? "opacity-20" : ""}`}
          />
          <ChevronRight
            className={`text-white/40 drop-shadow ${index >= stories.length - 1 ? "opacity-20" : ""}`}
          />
        </div>
      </StoryViewerFrame>
    </div>
  );
};

export default StoryViewer;
