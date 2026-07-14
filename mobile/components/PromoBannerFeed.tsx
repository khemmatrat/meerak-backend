import React, { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { MockApi } from "../services/mockApi";
import { PromoBannerHeroDetailSheet } from "./PromoBannerHeroCarousel";
import {
  type HomeBannerItem,
  aspectToCssRatio,
  bannerHeroUsesDirectVariant,
  resolveBannerHeroAspect,
  resolveBannerHeroImage,
  resolveBannerListImage,
} from "../utils/bannerDisplay";

const FEED_ROW_H = 88;
const TITLE_MAX = 40;

function imgReferrerPolicy(
  src: string,
): "strict-origin-when-cross-origin" | "no-referrer" {
  if (/\b(?:drive|docs)\.google\.com\b/i.test(src)) {
    return "strict-origin-when-cross-origin";
  }
  return "no-referrer";
}

/** ชื่อสั้นสำหรับการ์ดรายการ — ไม่ใช้ discountDescription (มักเป็นกติกายาว) */
function shortBannerTitle(banner: HomeBannerItem): string {
  const t = String(banner.title || "").trim();
  if (!t) return "โปรโมชัน";
  if (t.length <= TITLE_MAX) return t;
  return `${t.slice(0, TITLE_MAX).trim()}…`;
}

function listRowHint(banner: HomeBannerItem): string {
  if (banner.promoCode?.trim() && banner.promoClaimsEnabled !== false) {
    return "มีโค้ด · แตะดูเงื่อนไข";
  }
  return "แตะดูรายละเอียด";
}

type Props = {
  banners: HomeBannerItem[];
  bannerImageFailed: Record<string, boolean>;
  setBannerImageFailed: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  claimingCode: string | null;
  onClaimVoucher: (code: string) => Promise<boolean>;
  promoVouchersEnabled: boolean;
  className?: string;
};

/** Hero ด้านบน — สัดส่วนตาม variant จริง ไม่ crop (Method B) */
function PromoFeedHero({
  banner,
  failed,
  onOpen,
  onImageError,
}: {
  banner: HomeBannerItem;
  failed: boolean;
  onOpen: () => void;
  onImageError: () => void;
}) {
  const aspect = resolveBannerHeroAspect(banner);
  const image = resolveBannerHeroImage(banner, aspect);
  const src = image.src;
  const label = shortBannerTitle(banner);
  const showImg = !!src && !failed;
  const isPortraitTall = aspect === "9:16" || aspect === "3:4";
  const directMatch = bannerHeroUsesDirectVariant(banner, aspect);
  const imgFit =
    isPortraitTall || !directMatch ? "object-contain" : "object-cover";

  const heroButton = (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative block w-full overflow-hidden rounded-2xl bg-slate-100 text-left shadow-[0_4px_20px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:ring-white/10 ${
        isPortraitTall ? "max-h-[min(62svh,520px)]" : ""
      }`}
      style={{ aspectRatio: aspectToCssRatio(aspect) }}
      aria-label={`เปิดโปรโมชัน: ${label}`}
    >
      {showImg ? (
        <img
          src={src!}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt=""
          className={`absolute inset-0 h-full w-full ${imgFit} object-center transition duration-300 group-active:scale-[1.01]`}
          loading="eager"
          decoding="async"
          referrerPolicy={imgReferrerPolicy(src!)}
          onError={onImageError}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 px-4">
          <p className="text-center text-sm font-bold leading-snug text-white line-clamp-2">
            {label}
          </p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]" />
    </button>
  );

  if (isPortraitTall) {
    return (
      <div className="mx-auto w-full max-w-[min(100%,360px)]">{heroButton}</div>
    );
  }

  return heroButton;
}

/** แถวรายการแนว LINE MAN — รูปซ้าย ชื่อสั้น ลูกศรขวา */
function PromoFeedListRow({
  banner,
  failed,
  onOpen,
  onImageError,
}: {
  banner: HomeBannerItem;
  failed: boolean;
  onOpen: () => void;
  onImageError: () => void;
}) {
  const listImage = resolveBannerListImage(banner);
  const src = listImage.src;
  const title = shortBannerTitle(banner);
  const hint = listRowHint(banner);
  const showImg = !!src && !failed;
  const imgFit = listImage.useContain ? "object-contain" : "object-cover";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-stretch overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-left shadow-sm transition active:scale-[0.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-600/50 dark:bg-charcoal-900"
      style={{ minHeight: FEED_ROW_H }}
      aria-label={`เปิดโปรโมชัน: ${title}`}
    >
      <div
        className="relative shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800"
        style={{ width: FEED_ROW_H, minHeight: FEED_ROW_H }}
      >
        {showImg ? (
          <img
            src={src!}
            srcSet={listImage.srcSet}
            sizes={listImage.sizes}
            alt=""
            className={`h-full w-full ${imgFit} object-center`}
            loading="lazy"
            decoding="async"
            referrerPolicy={imgReferrerPolicy(src!)}
            onError={onImageError}
          />
        ) : (
          <div className="flex h-full min-h-[88px] w-full items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 p-2">
            <span className="text-center text-[10px] font-bold leading-tight text-white line-clamp-2">
              {title}
            </span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
            {title}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50">
          <ChevronRight size={18} aria-hidden />
        </span>
      </div>
    </button>
  );
}

/**
 * โปรโมชันแบบ feed — hero รูปล้วน + รายการแนวตั้งสั้นๆ (LINE MAN style)
 */
export const PromoBannerFeed: React.FC<Props> = ({
  banners,
  bannerImageFailed,
  setBannerImageFailed,
  claimingCode,
  onClaimVoucher,
  promoVouchersEnabled,
  className = "",
}) => {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<HomeBannerItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!detail?.id) return;
    setCopied(false);
  }, [detail?.id]);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [detail]);

  const openDetail = useCallback((banner: HomeBannerItem) => {
    setDetail(banner);
    void MockApi.recordBannerEvent(banner.id, "sheet_open");
  }, []);

  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }, []);

  const markFailed = useCallback(
    (id: string) => {
      setBannerImageFailed((prev) => ({ ...prev, [id]: true }));
    },
    [setBannerImageFailed],
  );

  if (banners.length === 0) return null;

  const featured = banners[0]!;
  const moreBanners = banners.slice(1);

  return (
    <>
      <div className={`space-y-3 ${className}`.trim()}>
        <PromoFeedHero
          banner={featured}
          failed={!!bannerImageFailed[featured.id]}
          onOpen={() => openDetail(featured)}
          onImageError={() => markFailed(String(featured.id))}
        />

        {moreBanners.length > 0 ? (
          <div className="space-y-2 pt-0.5">
            <div className="px-0.5">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                โปรอื่นๆ
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {moreBanners.length + 1} รายการ · กติกาและรายละเอียดเต็มเมื่อแตะ
              </p>
            </div>
            <div className="flex flex-col gap-2.5" role="list">
              {moreBanners.map((banner) => (
                <PromoFeedListRow
                  key={banner.id}
                  banner={banner}
                  failed={!!bannerImageFailed[banner.id]}
                  onOpen={() => openDetail(banner)}
                  onImageError={() => markFailed(String(banner.id))}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <PromoBannerHeroDetailSheet
        detail={detail}
        setDetail={setDetail}
        bannerImageFailed={bannerImageFailed}
        claimingCode={claimingCode}
        onClaimVoucher={onClaimVoucher}
        promoVouchersEnabled={promoVouchersEnabled}
        copied={copied}
        copyCode={copyCode}
        t={t}
      />
    </>
  );
};
