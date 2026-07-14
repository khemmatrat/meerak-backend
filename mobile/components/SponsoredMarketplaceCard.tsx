import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adsService,
  isSameOriginPromoUrl,
  isSponsoredProvider,
  sponsoredMediaSources,
} from "../services/adsService";
import { useAdViewability } from "../hooks/useAdViewability";

export type SponsoredMarketplaceItem = {
  id: string;
  name?: string;
  signature_service?: string;
  avatar_url?: string;
  portfolio_urls?: string[];
  mixKind?: string;
  is_sponsored?: boolean;
  ad?: {
    publicImpressionId?: string;
    creativeId?: string;
    campaignId?: string;
    destinationUrl?: string;
    mediaType?: string;
    contentKind?: string;
    playbackUrl?: string | null;
    posterUrl?: string | null;
    fallbackImageUrl?: string | null;
    imageUrl?: string | null;
  };
};

type Props = {
  item: SponsoredMarketplaceItem;
  language: string;
};

const MEDIA_TIMEOUT_MS = 8000;

export const SponsoredMarketplaceCard: React.FC<Props> = ({ item, language }) => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timeoutReportedRef = useRef(false);
  const playingSentRef = useRef(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const isEn = language === "en";

  const mediaItem = useMemo(
    () => ({
      mediaType: item.ad?.mediaType,
      ad: item.ad,
      video_url: item.ad?.playbackUrl || item.portfolio_urls?.[0] || item.avatar_url,
      thumbnail_url: item.ad?.posterUrl || item.avatar_url,
    }),
    [item],
  );
  const media = useMemo(() => sponsoredMediaSources(mediaItem), [mediaItem]);
  const impressionId = item.ad?.publicImpressionId || "";
  const isVideo = media.kind === "video" && !!media.videoSrc && !videoFailed;

  const { rootRef: cardRef, reportRender } = useAdViewability({
    impressionId,
    campaignId: item.ad?.campaignId,
    creativeId: item.ad?.creativeId,
    surface: "MARKETPLACE",
    enabled: !!impressionId,
  });

  useEffect(() => {
    setVideoFailed(false);
    setImageFailed(false);
    timeoutReportedRef.current = false;
    playingSentRef.current = false;
  }, [item.id, media.videoSrc, media.imageSrc]);

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const el = videoRef.current;
    const play = async () => {
      try {
        el.muted = true;
        await el.play();
      } catch {
        /* autoplay blocked */
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
  }, [isVideo, media.videoSrc, reportRender]);

  const handleCta = async () => {
    let clickId: string | undefined;
    if (impressionId) {
      const out = await adsService.recordClick({
        publicImpressionId: impressionId,
        campaignId: item.ad?.campaignId,
        creativeId: item.ad?.creativeId,
        surface: "MARKETPLACE",
      });
      clickId = out?.publicClickId;
    }
    const dest = item.ad?.destinationUrl || "/talents";
    const clickParam = clickId || adsService.getStoredClickAttribution()?.publicClickId;
    let target = dest;
    if (clickParam && dest.startsWith("/")) {
      const sep = dest.includes("?") ? "&" : "?";
      target = `${dest}${sep}ad_click=${encodeURIComponent(clickParam)}`;
    }
    if (dest.startsWith("http")) window.open(dest, "_blank");
    else if (dest.startsWith("/")) navigate(target);
  };

  const coverSrc =
    (isVideo && !videoFailed ? media.posterSrc : undefined) ||
    media.imageSrc ||
    item.avatar_url;
  const imageCrossOrigin =
    coverSrc && !isSameOriginPromoUrl(coverSrc) ? ("anonymous" as const) : undefined;

  if (!isSponsoredProvider(item)) return null;

  return (
    <div ref={cardRef as React.RefObject<HTMLDivElement>} className="bg-white rounded-2xl shadow-sm border border-amber-200 ring-2 ring-amber-100 overflow-hidden hover:shadow-lg transition-all group relative">
      <span className="absolute top-2 left-2 z-20 inline-flex items-center rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow">
        {isEn ? "Sponsored" : "โปรโมต"}
      </span>

      <div className="h-64 bg-slate-900 relative overflow-hidden">
        {isVideo ? (
          <video
            ref={videoRef}
            src={media.videoSrc}
            poster={media.posterSrc}
            className="absolute inset-0 z-10 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            crossOrigin={
              media.videoSrc && !isSameOriginPromoUrl(media.videoSrc)
                ? "anonymous"
                : undefined
            }
            onPlaying={() => {
              if (!playingSentRef.current) {
                playingSentRef.current = true;
                reportRender("ad_media_playing");
              }
            }}
            onError={() => {
              if (timeoutReportedRef.current) return;
              timeoutReportedRef.current = true;
              setVideoFailed(true);
              reportRender("ad_media_failed", "video_error_decode");
            }}
          />
        ) : null}
        {!isVideo && coverSrc && !imageFailed ? (
          <img
            src={coverSrc}
            alt={item.name || (isEn ? "Promotion" : "โปรโมชัน")}
            className="absolute inset-0 z-10 h-full w-full object-cover"
            crossOrigin={imageCrossOrigin}
            onLoad={() => {
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
        {(!coverSrc || imageFailed || (isVideo && videoFailed && !media.posterSrc)) ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-black px-6 text-center">
            <p className="text-lg font-bold text-white/90">
              {item.name || (isEn ? "Promotion" : "โปรโมชัน")}
            </p>
          </div>
        ) : null}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10 z-[15]">
          <h3 className="text-xl font-bold text-white line-clamp-1">
            {item.name || (isEn ? "Special offer" : "โปรโมชันพิเศษ")}
          </h3>
          {item.signature_service ? (
            <p className="text-xs text-white/85 mt-1 line-clamp-2">
              {item.signature_service}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        <p className="text-[11px] text-amber-700 font-semibold mb-2">
          {isEn ? "Paid promotion" : "เนื้อหาโฆษณา"}
        </p>
        <button
          type="button"
          onClick={handleCta}
          className="w-full py-2.5 text-center bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors"
        >
          {isEn ? "Learn more" : "ดูโปรโมชัน"}
        </button>
      </div>
    </div>
  );
};
