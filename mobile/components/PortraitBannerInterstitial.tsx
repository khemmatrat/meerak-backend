import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { HomeBannerItem } from "../utils/bannerDisplay";
import {
  pickBannerImageByAspect,
  resolveBannerImageResponsive,
} from "../utils/bannerDisplay";
import { useLanguage } from "../context/LanguageContext";

type Props = {
  banners: HomeBannerItem[];
  /** Close automatically after N seconds */
  autoCloseSeconds?: number;
  /** Called when user taps the banner body */
  onOpen: (b: HomeBannerItem) => void;
};

function pickPortraitCandidate(
  banners: HomeBannerItem[],
): HomeBannerItem | null {
  for (const b of banners || []) {
    // Prefer explicit portrait slideHeight or a 9:16 variant if present.
    const hasPortrait =
      b.slideHeight === "portrait" ||
      !!(
        b.imageVariants &&
        typeof b.imageVariants === "object" &&
        b.imageVariants["9:16"]
      );
    if (hasPortrait) return b;
  }
  return null;
}

export function PortraitBannerInterstitial({
  banners,
  autoCloseSeconds = 9,
  onOpen,
}: Props) {
  const { language } = useLanguage();
  const candidate = useMemo(() => pickPortraitCandidate(banners), [banners]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!candidate) return;
    // once-per-session per banner id
    const key = `aqond_portrait_interstitial_seen:${candidate.id}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setOpen(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setOpen(false),
      autoCloseSeconds * 1000,
    );
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [candidate, autoCloseSeconds]);

  if (!candidate || !open) return null;

  const portraitUrl = pickBannerImageByAspect(candidate, "9:16");
  const responsive = resolveBannerImageResponsive(portraitUrl, "carousel");
  const label =
    String(candidate.title || "").trim() ||
    String(candidate.discountDescription || "").trim() ||
    (language === "en" ? "Promotion" : "โปรโมชัน");

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={language === "en" ? "Close" : "ปิด"}
        onClick={() => setOpen(false)}
      />
      <div className="relative z-[1] w-full max-w-[420px]">
        <button
          type="button"
          onClick={() => onOpen(candidate)}
          className="relative block w-full overflow-hidden rounded-3xl bg-slate-900 shadow-2xl ring-1 ring-white/10"
          aria-label={label}
        >
          <div className="relative aspect-[9/16] w-full bg-black">
            {responsive.src ? (
              <img
                src={responsive.src}
                srcSet={responsive.srcSet}
                sizes={responsive.sizes}
                alt={label}
                className="absolute inset-0 h-full w-full object-contain"
                loading="eager"
                decoding="async"
              />
            ) : null}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-sm hover:bg-black/55"
          aria-label={language === "en" ? "Close" : "ปิด"}
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
