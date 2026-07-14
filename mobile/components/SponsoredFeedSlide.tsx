import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TalentVideo } from "../services/videoService";
import {
  adsService,
  isSameOriginPromoUrl,
  sponsoredMediaSources,
} from "../services/adsService";

type Props = {
  video: TalentVideo;
  language: string;
  onCta: () => void;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
};

const MEDIA_TIMEOUT_MS = 8000;

export const SponsoredFeedSlide: React.FC<Props> = ({
  video,
  language,
  onCta,
  muted: mutedProp,
  onMutedChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timeoutReportedRef = useRef(false);
  const playingSentRef = useRef(false);
  const viewableSentRef = useRef(false);
  const videoView2sSentRef = useRef(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [internalMuted, setInternalMuted] = useState(true);
  const muted = mutedProp ?? internalMuted;
  const media = useMemo(() => sponsoredMediaSources(video), [video]);
  const isEn = language === "en";
  const isVideo = media.kind === "video" && !!media.videoSrc && !videoFailed;
  const imageSrc = media.imageSrc;
  const impressionId = video.ad?.publicImpressionId || "";

  const reportRender = useCallback(
    (
      eventType: Parameters<typeof adsService.recordRenderEvent>[0]["eventType"],
      reason?: string,
    ) => {
      if (!impressionId) return;
      void adsService.recordRenderEvent({
        publicImpressionId: impressionId,
        eventType,
        creativeId: video.ad?.creativeId,
        campaignId: video.ad?.campaignId,
        surface: "VIDEO_FEED",
        reason,
      });
    },
    [impressionId, video.ad?.creativeId, video.ad?.campaignId],
  );

  useEffect(() => {
    setVideoReady(false);
    setVideoFailed(false);
    setImageFailed(false);
    timeoutReportedRef.current = false;
    playingSentRef.current = false;
    viewableSentRef.current = false;
    videoView2sSentRef.current = false;
    if (onMutedChange) onMutedChange(true);
    else setInternalMuted(true);
  }, [video.id, media.videoSrc, media.imageSrc, onMutedChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !impressionId) return;
    let visibleSince: number | null = null;
    let viewableTimer: ReturnType<typeof setTimeout> | null = null;
    const obs = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0;
        if (ratio >= 0.5) {
          if (visibleSince == null) visibleSince = Date.now();
          if (!viewableSentRef.current && visibleSince && Date.now() - visibleSince >= 1000) {
            viewableSentRef.current = true;
            reportRender("ad_viewable_1s");
          } else if (!viewableSentRef.current && !viewableTimer) {
            const wait = visibleSince ? Math.max(0, 1000 - (Date.now() - visibleSince)) : 1000;
            viewableTimer = setTimeout(() => {
              if (!viewableSentRef.current) {
                viewableSentRef.current = true;
                reportRender("ad_viewable_1s");
              }
            }, wait);
          }
        } else {
          visibleSince = null;
          if (viewableTimer) clearTimeout(viewableTimer);
          viewableTimer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    obs.observe(root);
    return () => {
      obs.disconnect();
      if (viewableTimer) clearTimeout(viewableTimer);
    };
  }, [impressionId, reportRender]);

  useEffect(() => {
    if (!impressionId) return;
    reportRender("ad_rendered");
  }, [impressionId, reportRender]);

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    videoRef.current.muted = muted;
    const el = videoRef.current;
    const play = async () => {
      try {
        el.muted = muted;
        await el.play();
      } catch {
        /* autoplay blocked — CTA overlay still visible */
      }
    };
    void play();

    const timeout = window.setTimeout(() => {
      if (timeoutReportedRef.current || playingSentRef.current) return;
      timeoutReportedRef.current = true;
      setVideoFailed(true);
      reportRender("ad_media_failed_timeout", "video_play_timeout");
    }, MEDIA_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [isVideo, media.videoSrc, reportRender, muted]);

  const crossOriginAttr =
    media.videoSrc && !isSameOriginPromoUrl(media.videoSrc)
      ? ("anonymous" as const)
      : undefined;

  const imageCrossOrigin =
    imageSrc && !isSameOriginPromoUrl(imageSrc)
      ? ("anonymous" as const)
      : undefined;

  const showFallbackCard =
    (!isVideo && (!imageSrc || imageFailed)) || (isVideo && videoFailed);

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full min-h-0 flex-1 bg-black overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950 to-black" />

      {isVideo ? (
        <>
          <video
            ref={videoRef}
            src={media.videoSrc}
            poster={media.posterSrc}
            className="absolute inset-0 z-10 h-full w-full object-cover"
            autoPlay
            loop
            muted={muted}
            playsInline
            preload="auto"
            crossOrigin={crossOriginAttr}
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => {
              setVideoReady(true);
              reportRender("ad_media_loaded");
            }}
            onPlaying={() => {
              setVideoReady(true);
              if (!playingSentRef.current) {
                playingSentRef.current = true;
                reportRender("ad_media_playing");
              }
              if (!videoView2sSentRef.current) {
                window.setTimeout(() => {
                  if (!videoView2sSentRef.current && !videoFailed) {
                    videoView2sSentRef.current = true;
                    reportRender("ad_video_view_2s");
                  }
                }, 2000);
              }
            }}
            onError={() => {
              if (timeoutReportedRef.current) return;
              timeoutReportedRef.current = true;
              setVideoFailed(true);
              reportRender("ad_media_failed", "video_error_decode");
            }}
          />
          {!videoReady && !videoFailed ? (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow">
                {isEn ? "Loading ad video..." : "กำลังโหลดวิดีโอโฆษณา..."}
              </span>
            </div>
          ) : null}
          {videoFailed && media.posterSrc ? (
            <img
              src={media.posterSrc}
              alt=""
              className="absolute inset-0 z-10 h-full w-full object-cover"
              crossOrigin={imageCrossOrigin}
            />
          ) : null}
        </>
      ) : imageSrc && !imageFailed ? (
        <img
          src={imageSrc}
          alt={video.title || (isEn ? "Promotion" : "โปรโมชัน")}
          className="absolute inset-0 z-10 h-full w-full object-cover"
          crossOrigin={imageCrossOrigin}
          onLoad={() => {
            reportRender("ad_media_loaded");
            if (!playingSentRef.current) {
              playingSentRef.current = true;
              reportRender("ad_media_playing");
            }
          }}
          onError={() => {
            setImageFailed(true);
            reportRender("ad_media_failed", "image_load_error");
          }}
        />
      ) : null}

      {showFallbackCard ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8 text-center">
          <p className="text-lg font-bold text-white/90">
            {video.title || (isEn ? "Promotion" : "โปรโมชัน")}
          </p>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-[45%] bg-gradient-to-t from-black via-black/80 to-transparent"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-4 pr-16 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-6 sm:pr-20">
        <span className="mb-2 inline-flex items-center rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
          {video.ad?.isHouse
            ? isEn
              ? "Featured by AQOND"
              : "แนะนำโดย AQOND"
            : isEn
              ? "Sponsored"
              : "โปรโมต"}
        </span>
        <h2 className="text-[17px] font-bold leading-snug text-white line-clamp-2 drop-shadow">
          {video.title || (isEn ? "Special offer" : "โปรโมชันพิเศษ")}
        </h2>
        {video.description ? (
          <p className="mt-1 text-sm leading-snug text-white/80 line-clamp-2 drop-shadow">
            {video.description}
          </p>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            reportRender("ad_cta_clicked");
            onCta();
          }}
          className="pointer-events-auto mt-3 w-full rounded-xl bg-white py-3 text-center text-[15px] font-bold text-slate-900 shadow-lg shadow-black/40 transition active:scale-[0.98]"
        >
          {isEn ? "Learn more" : "ดูโปรโมชัน"}
        </button>
        <p className="mt-2 text-center text-[10px] text-white/50">
          {isEn ? "Paid promotion" : "เนื้อหาโฆษณา"}
        </p>
      </div>
    </div>
  );
};
