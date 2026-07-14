import { api, getBackendBase } from "./api";

function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const k = "aqond_ads_session_id";
    let v = sessionStorage.getItem(k);
    if (!v) {
      v =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return `${Date.now()}`;
  }
}

const renderEventSent = new Set<string>();

function renderEventKey(publicImpressionId: string, eventType: string): string {
  return `${publicImpressionId}:${eventType}`;
}

export type AdRenderEventType =
  | "ad_rendered"
  | "ad_media_loaded"
  | "ad_media_playing"
  | "ad_viewable_1s"
  | "ad_video_view_2s"
  | "ad_media_failed"
  | "ad_media_failed_timeout"
  | "ad_cta_clicked";

export const adsService = {
  storeClickAttribution(params: {
    publicClickId: string;
    publicImpressionId: string;
    campaignId?: string;
    creativeId?: string;
    surface?: string;
  }) {
    if (typeof window === "undefined" || !params.publicClickId) return;
    try {
      sessionStorage.setItem("aqond_last_ad_click", JSON.stringify({
        ...params,
        storedAt: Date.now(),
      }));
    } catch {
      /* ignore */
    }
  },

  getStoredClickAttribution(): {
    publicClickId: string;
    publicImpressionId: string;
    campaignId?: string;
    creativeId?: string;
    surface?: string;
    storedAt?: number;
  } | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem("aqond_last_ad_click");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        publicClickId: string;
        publicImpressionId: string;
        campaignId?: string;
        creativeId?: string;
        surface?: string;
        storedAt?: number;
      };
      if (parsed.storedAt && Date.now() - parsed.storedAt > 30 * 24 * 60 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  /** Read ?ad_click= from URL and merge into session attribution. */
  captureAdClickFromUrl(search?: string | URLSearchParams) {
    if (typeof window === "undefined") return null;
    try {
      const params =
        typeof search === "string"
          ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
          : search || new URLSearchParams(window.location.search);
      const clickId = params.get("ad_click")?.trim();
      if (!clickId) return null;
      const existing = adsService.getStoredClickAttribution();
      adsService.storeClickAttribution({
        publicClickId: clickId,
        publicImpressionId: existing?.publicImpressionId || params.get("ad_impression") || "",
        campaignId: existing?.campaignId || params.get("ad_campaign") || undefined,
        creativeId: existing?.creativeId || params.get("ad_creative") || undefined,
        surface: existing?.surface,
      });
      return clickId;
    } catch {
      return null;
    }
  },

  getAdClickPayloadForBooking(): {
    adClickPublicId?: string;
    adCampaignId?: string;
    adCreativeId?: string;
    adImpressionId?: string;
  } {
    const attr = adsService.getStoredClickAttribution();
    if (!attr?.publicClickId) return {};
    return {
      adClickPublicId: attr.publicClickId,
      adCampaignId: attr.campaignId,
      adCreativeId: attr.creativeId,
      adImpressionId: attr.publicImpressionId || undefined,
    };
  },

  async recordClick(params: {
    publicImpressionId: string;
    campaignId?: string;
    creativeId?: string;
    surface?: string;
  }): Promise<{ publicClickId?: string } | void> {
    if (!params.publicImpressionId) return;
    try {
      const { data } = await api.post(
        "/ads/click",
        {
          publicImpressionId: params.publicImpressionId,
          campaignId: params.campaignId,
          creativeId: params.creativeId,
          surface: params.surface || "VIDEO_FEED",
          sessionId: sessionId(),
        },
        { timeout: 8000 },
      );
      if (data?.publicClickId) {
        adsService.storeClickAttribution({
          publicClickId: data.publicClickId,
          publicImpressionId: params.publicImpressionId,
          campaignId: params.campaignId,
          creativeId: params.creativeId,
          surface: params.surface,
        });
      }
      return data;
    } catch {
      /* non-blocking */
    }
  },

  async recordRenderEvent(params: {
    publicImpressionId: string;
    eventType: AdRenderEventType;
    creativeId?: string;
    campaignId?: string;
    surface?: string;
    reason?: string;
    cpmMicro?: string;
  }): Promise<void> {
    if (!params.publicImpressionId || !params.eventType) return;
    const key = renderEventKey(params.publicImpressionId, params.eventType);
    if (renderEventSent.has(key)) return;
    renderEventSent.add(key);
    try {
      await api.post(
        "/ads/render-event",
        {
          ...params,
          surface: params.surface || "VIDEO_FEED",
        },
        { timeout: 8000 },
      );
    } catch {
      renderEventSent.delete(key);
    }
  },

  getSessionId: sessionId,

  async recordConversion(_params: {
    campaignId: string;
    conversionKind: "CLICK" | "LEAD_SIGNAL" | "PURCHASE_MACRO";
    conversionKey: string;
    impressionPublicId?: string;
    clickPublicId?: string;
  }): Promise<void> {
    // Outcome billing is server-side only — never bill from mobile client.
    return;
  },
};

export function isSponsoredVideo(v: {
  mixKind?: string;
  ad?: { publicImpressionId?: string };
  id?: string;
}): boolean {
  return (
    v.mixKind === "sponsored" ||
    !!v.ad?.publicImpressionId ||
    (typeof v.id === "string" && v.id.startsWith("ad-"))
  );
}

export function isSponsoredProvider(p: {
  mixKind?: string;
  is_sponsored?: boolean;
  ad?: { publicImpressionId?: string };
  id?: string;
}): boolean {
  return (
    p.mixKind === "sponsored" ||
    !!p.is_sponsored ||
    !!p.ad?.publicImpressionId ||
    (typeof p.id === "string" && p.id.startsWith("ad-"))
  );
}

function toBase64Url(raw: string): string {
  const b64 = btoa(raw);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function extractPromoEncoded(url: string): string | null {
  try {
    const parsed = url.startsWith("http")
      ? new URL(url)
      : new URL(url, "http://local");
    if (!parsed.pathname.includes("/promo/asset")) return null;
    return parsed.searchParams.get("u") || null;
  } catch {
    return null;
  }
}

/** Normalize any promo URL to same-origin relative path (Vite proxy in dev). */
export function normalizePromoUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("/api/promo/asset")) return raw;

  const encoded = extractPromoEncoded(raw);
  if (encoded) {
    return `/api/promo/asset?u=${encoded}`;
  }

  if (!raw.startsWith("http")) return raw;
  if (!raw.includes("/ads/")) return raw;

  const host =
    typeof window !== "undefined" ? window.location.host.toLowerCase() : "";
  if (host === "localhost:3000" || host === "127.0.0.1:3000") {
    return `/api/promo/asset?u=${toBase64Url(raw)}`;
  }
  const base = `${getBackendBase()}/api`;
  return `${base}/promo/asset?u=${toBase64Url(raw)}`;
}

/** @deprecated Use normalizePromoUrl */
export function promoMediaUrl(raw?: string | null): string | undefined {
  return normalizePromoUrl(raw);
}

export function isSameOriginPromoUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("/api/promo/");
}

const VIDEO_EXT = /\.(mp4|webm|mov|m3u8)(\?|$)/i;
const ADS_VIDEO_PATH = /\/ads\/videos\//i;
const ADS_IMAGE_PATH = /\/ads\/images\//i;

export type SponsoredMediaKind = "video" | "image";

export function isPlayableVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.includes("/api/promo/asset")) return true;
  if (VIDEO_EXT.test(url)) return true;
  return ADS_VIDEO_PATH.test(url) && url.startsWith("http");
}

/** Detect sponsored creative media — explicit mediaType first, then fallback. */
export function resolveSponsoredMediaKind(v: {
  mediaType?: string;
  ad?: { mediaType?: string; contentKind?: string };
  video_url?: string;
  thumbnail_url?: string;
}): SponsoredMediaKind {
  const explicit = v.mediaType || v.ad?.mediaType;
  if (explicit === "video" || explicit === "image") return explicit;

  const kind = v.ad?.contentKind || "";
  if (kind === "TALENT_VIDEO" || kind === "USER_STORY") return "video";
  if (kind === "IMAGE") return "image";

  const primary = v.video_url || "";
  const poster = v.thumbnail_url || "";
  if (isPlayableVideoUrl(primary)) return "video";
  if (ADS_VIDEO_PATH.test(primary)) return "video";
  if (ADS_IMAGE_PATH.test(primary) || ADS_IMAGE_PATH.test(poster)) return "image";
  if (poster && !ADS_VIDEO_PATH.test(poster)) return "image";
  return "image";
}

export function sponsoredMediaSources(v: {
  mediaType?: string;
  ad?: {
    mediaType?: string;
    contentKind?: string;
    playbackUrl?: string | null;
    posterUrl?: string | null;
    fallbackImageUrl?: string | null;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
  };
  video_url?: string;
  thumbnail_url?: string;
}): {
  kind: SponsoredMediaKind;
  videoSrc?: string;
  imageSrc?: string;
  posterSrc?: string;
  rawVideo?: string;
  rawImage?: string;
} {
  const kind = resolveSponsoredMediaKind(v);
  const rawVideo = v.ad?.playbackUrl || v.video_url;
  const rawPoster = v.ad?.posterUrl || v.ad?.thumbnailUrl || v.thumbnail_url;
  const rawImage =
    v.ad?.fallbackImageUrl ||
    v.ad?.imageUrl ||
    (rawPoster && !ADS_VIDEO_PATH.test(rawPoster) ? rawPoster : undefined) ||
    (kind === "image" ? v.video_url : undefined);
  const videoSrc = kind === "video" ? normalizePromoUrl(rawVideo) : undefined;
  const imageSrc = normalizePromoUrl(rawImage);
  const posterSrc =
    kind === "video" && rawPoster && !ADS_VIDEO_PATH.test(rawPoster)
      ? normalizePromoUrl(rawPoster)
      : undefined;
  return { kind, videoSrc, imageSrc, posterSrc, rawVideo, rawImage };
}

/** Image-based sponsored slot (not a real video file). */
export function sponsoredUsesImage(v: {
  mixKind?: string;
  mediaType?: string;
  ad?: { mediaType?: string; contentKind?: string; publicImpressionId?: string };
  id?: string;
  video_url?: string;
  thumbnail_url?: string;
}): boolean {
  if (!isSponsoredVideo(v)) return false;
  const explicit = v.mediaType || v.ad?.mediaType;
  if (explicit === "image") return true;
  if (explicit === "video") return false;
  if (v.ad?.contentKind === "IMAGE") return true;
  if (isPlayableVideoUrl(v.video_url)) return false;
  return !!(
    v.thumbnail_url ||
    v.video_url?.startsWith("http") ||
    v.video_url?.includes("/api/promo/")
  );
}
