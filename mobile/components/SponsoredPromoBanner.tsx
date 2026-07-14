import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { adsService } from "../services/adsService";
import { useAdViewability } from "../hooks/useAdViewability";

export type SponsoredPromoItem = {
  id: string;
  headline?: string;
  bodyPreview?: string;
  imageUrl?: string | null;
  ad?: {
    publicImpressionId?: string;
    creativeId?: string;
    campaignId?: string;
    destinationUrl?: string;
    imageUrl?: string | null;
  };
};

type Props = {
  item: SponsoredPromoItem;
  surface: "SEARCH_RESULTS" | "PROVIDER_PROFILE_PROMO";
  language?: string;
  className?: string;
};

export const SponsoredPromoBanner: React.FC<Props> = ({
  item,
  surface,
  language = "th",
  className = "",
}) => {
  const navigate = useNavigate();
  const impressionId = item.ad?.publicImpressionId || "";
  const isEn = language === "en";
  const { rootRef } = useAdViewability({
    impressionId,
    campaignId: item.ad?.campaignId,
    creativeId: item.ad?.creativeId,
    surface,
    enabled: !!impressionId,
  });

  const handleCta = useCallback(async () => {
    let clickId: string | undefined;
    if (impressionId) {
      const out = await adsService.recordClick({
        publicImpressionId: impressionId,
        campaignId: item.ad?.campaignId,
        creativeId: item.ad?.creativeId,
        surface,
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
  }, [impressionId, item.ad, surface, navigate]);

  if (!impressionId) return null;

  const img = item.ad?.imageUrl || item.imageUrl;

  return (
    <div
      ref={rootRef as React.RefObject<HTMLDivElement>}
      className={`rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white overflow-hidden shadow-sm ${className}`}
    >
      <div className="flex items-stretch gap-3 p-3">
        {img ? (
          <img
            src={img}
            alt=""
            className="w-20 h-20 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-amber-200 shrink-0 flex items-center justify-center text-xs font-bold text-amber-900">
            Ad
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
            {isEn ? "Sponsored" : "โปรโมต"}
          </span>
          <p className="font-bold text-slate-900 text-sm line-clamp-1 mt-0.5">
            {item.headline || (isEn ? "Special offer" : "โปรโมชันพิเศษ")}
          </p>
          {item.bodyPreview ? (
            <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{item.bodyPreview}</p>
          ) : null}
          <button
            type="button"
            onClick={handleCta}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-900"
          >
            <ExternalLink size={12} />
            {isEn ? "Learn more" : "ดูเพิ่มเติม"}
          </button>
        </div>
      </div>
    </div>
  );
};
