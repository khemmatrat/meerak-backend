import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronRight, Copy, Tag, X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { MockApi } from "../services/mockApi";
import {
  type BannerSlideHeight,
  type HomeBannerItem,
  bannerDiscountDescriptionDistinct,
  convertGDriveUrl,
  isPromoClaimWindowActive,
  parseBannerSlideHeight,
  pickBannerImageByAspect,
  resolveBannerActionPath,
  resolveBannerImageResponsive,
} from "../utils/bannerDisplay";

export type PromoBannerHeroLayout = "fullBleed" | "inset";

export type PromoBannerSlideHeight = BannerSlideHeight;

export type PromoBannerEngagementKind = "sheet_open" | "claim";

/** debug โหลดรูปแบนเนอร์ — ค้นใน Console ด้วย [AQOND][banner-image] */
function logBannerImageEvent(
  kind: "error" | "timeout",
  phase: "main" | "blur",
  bannerId: string,
  src: string,
  detail?: string,
) {
  const clip = src.length > 160 ? `${src.slice(0, 160)}…` : src;
  const extra = detail ? ` ${detail}` : "";
  console.warn(
    `[AQOND][banner-image] ${kind} phase=${phase} id=${String(bannerId)} src=${clip}${extra}`,
  );
}

export interface PromoBannerHeroCarouselProps {
  banners: HomeBannerItem[];
  bannerImageFailed: Record<string, boolean>;
  setBannerImageFailed: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  claimingCode: string | null;
  onClaimVoucher: (code: string) => Promise<boolean>;
  promoVouchersEnabled: boolean;
  layout: PromoBannerHeroLayout;
  slideHeight?: PromoBannerSlideHeight;
  /** เมื่อมีหลายแบนเนอร์ ให้เห็นขอบสไลด์ถัดไป (~88%) + align center */
  peekSlides?: boolean;
  /** classic = แตะแล้วเข้า detail ทันที, preview = เปิดเต็มจอก่อน */
  interactionMode?: "classic" | "preview";
  /** แจ้งเหตุการณ์เมื่อผู้ใช้แตะแบนเนอร์ */
  onBannerTap?: (banner: HomeBannerItem, mode: "classic" | "preview") => void;
  /** Welcome / inset — จำกัดความสูง portrait 9:16 ไม่ให้กินทั้งจอ */
  compactPortrait?: boolean;
  className?: string;
}

function slideFrameClassFor(
  h: PromoBannerSlideHeight,
  compactPortrait?: boolean,
): string {
  const isStrip = h === "strip";
  const isPortrait = h === "portrait";
  return isPortrait
    ? compactPortrait
      ? "relative isolate aspect-[9/16] w-full min-h-[140px] max-h-[min(36svh,240px)] mx-auto max-w-[min(100%,200px)] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900"
      : "relative isolate aspect-[9/16] w-full min-h-[220px] max-h-[min(78svh,560px)] mx-auto max-w-[min(100%,420px)] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900"
    : isStrip
      ? "relative isolate aspect-[21/9] w-full min-h-[72px] max-h-[120px] sm:min-h-[80px] sm:max-h-[132px] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900"
      : "relative isolate aspect-[16/9] w-full min-h-[150px] max-h-[min(52svh,400px)] sm:max-h-[min(48svh,440px)] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900";
}

/** Google Docs/Drive และ googleusercontent — ให้มี Referer แบบจำกัด; `no-referrer` ทำให้ thumbnail จาก Drive พังได้ในบางเบราว์เซอร์ */
function imgReferrerPolicyForBannerSrc(
  src: string,
): "strict-origin-when-cross-origin" | "no-referrer" {
  const s = String(src || "");
  if (
    /\b(?:drive|docs)\.google\.com\b/i.test(s) ||
    /\b(?:googleusercontent|ggpht)\.com\b/i.test(s)
  ) {
    return "strict-origin-when-cross-origin";
  }
  return "no-referrer";
}

function BannerSlideImage({
  bannerId,
  src,
  srcSet,
  sizes,
  lowResSrc,
  imgClassName,
  onError,
  resetKey,
  loading,
}: {
  bannerId: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  lowResSrc?: string;
  imgClassName: string;
  onError: () => void;
  resetKey: string;
  loading?: "eager" | "lazy";
}) {
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const onFailRef = useRef(onError);
  const blurSrc = lowResSrc ?? src;

  useEffect(() => {
    onFailRef.current = onError;
  }, [onError]);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    setLoaded(false);
    loadedRef.current = false;
  }, [resetKey]);

  /** หมดเวลาโหลดรูปหลัก — ถือว่าล้มเหลือเพื่อให้ fallback ข้อความขึ้น */
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!loadedRef.current) {
        logBannerImageEvent("timeout", "main", bannerId, src);
        onFailRef.current();
      }
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [resetKey, bannerId, src]);

  /** ภาพเบลอล้มเหลว — เอา overlay ที่บังออก ไม่งั้นอาจเหมือน “ว่าง” ถาวร */
  const onBlurError = () => {
    logBannerImageEvent("error", "blur", bannerId, blurSrc);
    setLoaded(true);
  };

  const onMainError: React.ReactEventHandler<HTMLImageElement> = (e) => {
    logBannerImageEvent(
      "error",
      "main",
      bannerId,
      src,
      (e.nativeEvent as Event)?.type || "",
    );
    onError();
  };

  return (
    <>
      <div
        className={`absolute inset-0 z-0 bg-gradient-to-br from-slate-300/95 via-slate-100/90 to-emerald-50/70 transition-opacity duration-500 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/40 ${
          loaded ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden
      />
      {!loaded ? (
        <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <img
            src={blurSrc}
            alt=""
            className="h-full w-full object-cover opacity-55 blur-2xl scale-[1.12] saturate-110"
            decoding="async"
            referrerPolicy={imgReferrerPolicyForBannerSrc(blurSrc)}
            onError={onBlurError}
          />
        </div>
      ) : null}
      <img
        key={resetKey}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        loading={loading ?? "lazy"}
        decoding="async"
        referrerPolicy={imgReferrerPolicyForBannerSrc(src)}
        className={`absolute inset-0 z-[1] h-full w-full object-center transition-opacity duration-700 ease-out ${
          imgClassName.includes("object-contain")
            ? "object-contain"
            : "object-cover"
        } ${imgClassName} ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => {
          loadedRef.current = true;
          setLoaded(true);
        }}
        onError={onMainError}
      />
    </>
  );
}

const CAROUSEL_CHROME =
  "relative z-[1] isolate w-full min-w-0 overflow-hidden rounded-[18px] bg-slate-100 shadow-[0_8px_28px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.06] dark:bg-slate-800/40 dark:ring-white/[0.08] dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)]";

function PromoBannerHeroSlide({
  banner,
  slideIndex,
  slideHeight,
  compactPortrait,
  bannerImageFailed,
  setBannerImageFailed,
  onOpen,
}: {
  banner: HomeBannerItem;
  slideIndex: number;
  slideHeight: PromoBannerSlideHeight;
  compactPortrait?: boolean;
  bannerImageFailed: Record<string, boolean>;
  setBannerImageFailed: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onOpen: (b: HomeBannerItem, i: number) => void;
}) {
  const slideHeightEff =
    parseBannerSlideHeight(banner.slideHeight) ?? slideHeight;
  const slideFrameClass = slideFrameClassFor(slideHeightEff, compactPortrait);
  const isStripSlide = slideHeightEff === "strip";
  const isPortraitSlide = slideHeightEff === "portrait";
  const failed = !!bannerImageFailed[banner.id];
  const aspectKey =
    slideHeightEff === "portrait"
      ? "9:16"
      : slideHeightEff === "strip"
        ? "2:1"
        : "16:9";
  const picked = pickBannerImageByAspect(banner, aspectKey);
  const rawImg = String(picked ?? "").trim();
  const pipelineRaw = rawImg ? convertGDriveUrl(rawImg) || rawImg : rawImg;
  const responsive = resolveBannerImageResponsive(
    pipelineRaw || rawImg,
    "carousel",
  );
  const showImg = !!responsive.src && !failed;
  const fallbackLabel =
    String(banner.title || "").trim() ||
    String(banner.discountDescription || "")
      .trim()
      .slice(0, 120) ||
    "โปรโมชัน";

  return (
    <button
      type="button"
      onClick={() => onOpen(banner, slideIndex)}
      className="group relative z-0 block w-full overflow-hidden self-stretch text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-charcoal-900"
      aria-label={`เปิดรายละเอียดโปรโมชัน: ${fallbackLabel}`}
    >
      <div className={slideFrameClass}>
        {showImg ? (
          <BannerSlideImage
            bannerId={String(banner.id)}
            src={responsive.src!}
            srcSet={responsive.srcSet}
            sizes={responsive.sizes}
            lowResSrc={responsive.lowResSrc}
            resetKey={`${banner.id}-${responsive.src}`}
            loading={slideIndex === 0 ? "eager" : "lazy"}
            imgClassName={
              isStripSlide
                ? ""
                : isPortraitSlide
                  ? "object-contain bg-slate-100 dark:bg-slate-900 transition duration-300 group-active:scale-[1.01]"
                  : "transition duration-300 group-active:scale-[1.01]"
            }
            onError={() =>
              setBannerImageFailed((prev) => ({
                ...prev,
                [banner.id]: true,
              }))
            }
          />
        ) : (
          <div
            className={`absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 ${
              isStripSlide ? "px-2" : "px-4"
            }`}
          >
            <p
              className={`text-center font-bold leading-snug text-white ${
                isStripSlide
                  ? "text-[10px] line-clamp-2 sm:text-xs"
                  : "text-sm sm:text-base"
              }`}
            >
              {fallbackLabel}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 z-[2] ring-1 ring-black/[0.04] dark:ring-white/[0.08]" />
      </div>
    </button>
  );
}

type PromoBannerDetailSheetProps = {
  detail: HomeBannerItem | null;
  setDetail: React.Dispatch<React.SetStateAction<HomeBannerItem | null>>;
  bannerImageFailed: Record<string, boolean>;
  claimingCode: string | null;
  onClaimVoucher: (code: string) => Promise<boolean>;
  promoVouchersEnabled: boolean;
  copied: boolean;
  copyCode: (code: string) => void;
  t: (key: string) => string;
};

type PromoBannerPreviewProps = {
  preview: HomeBannerItem | null;
  setPreview: React.Dispatch<React.SetStateAction<HomeBannerItem | null>>;
  onOpenDetail: (b: HomeBannerItem) => void;
};

function PromoBannerFullScreenPreview({
  preview,
  setPreview,
  onOpenDetail,
}: PromoBannerPreviewProps) {
  return (
    <AnimatePresence>
      {preview ? (
        <>
          <motion.button
            type="button"
            aria-label="ปิดภาพโปรโมชัน"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] border-0 bg-black/88"
            onClick={() => setPreview(null)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[121] flex flex-col"
            onClick={() => setPreview(null)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
              }}
              aria-label="ปิด"
              className="absolute right-3 top-3 z-[2] inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/30 backdrop-blur-sm"
            >
              <X size={20} />
            </button>

            {(() => {
              const picked = pickBannerImageByAspect(preview, "9:16");
              const rs = resolveBannerImageResponsive(picked, "carousel");
              const label =
                String(preview.title || "").trim() ||
                String(preview.discountDescription || "")
                  .trim()
                  .slice(0, 120) ||
                "โปรโมชัน";
              return rs.src ? (
                <img
                  src={rs.src}
                  srcSet={rs.srcSet}
                  sizes={rs.sizes}
                  alt={label}
                  className="h-full w-full object-contain"
                  loading="eager"
                  decoding="async"
                  referrerPolicy={imgReferrerPolicyForBannerSrc(rs.src)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 px-6">
                  <p className="text-center text-xl font-bold leading-snug text-white">
                    {label}
                  </p>
                </div>
              );
            })()}

            <div
              className="absolute inset-x-0 bottom-0 z-[2] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onOpenDetail(preview)}
                className="inline-flex w-full items-center justify-center gap-1 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-lg"
              >
                ดูรายละเอียดและเงื่อนไข
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export function PromoBannerHeroDetailSheet({
  detail,
  setDetail,
  bannerImageFailed,
  claimingCode,
  onClaimVoucher,
  promoVouchersEnabled,
  copied,
  copyCode,
  t,
}: PromoBannerDetailSheetProps) {
  const [justClaimed, setJustClaimed] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    setJustClaimed(false);
    setShowLegal(false);
    setShowAllCategories(false);
  }, [detail?.id]);

  const claimable =
    !!detail?.promoCode &&
    promoVouchersEnabled &&
    detail.promoClaimsEnabled !== false &&
    detail.discountMaxBaht != null &&
    detail.discountMaxBaht > 0 &&
    isPromoClaimWindowActive(detail);

  const categories = detail?.allowedJobCategories?.length
    ? detail.allowedJobCategories
    : [];
  const catsText = categories.join(", ");
  const catsTruncated =
    catsText.length > 120 && !showAllCategories
      ? `${catsText.slice(0, 120).trim()}…`
      : catsText;

  const handleClaim = async () => {
    if (!detail?.promoCode) return;
    const code = detail.promoCode;
    const id = detail.id;
    const ok = await onClaimVoucher(code);
    if (ok) {
      setJustClaimed(true);
      void MockApi.recordBannerEvent(id, "claim");
    }
  };

  return (
    <AnimatePresence>
      {detail ? (
        <>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="promo-banner-sheet-title"
            initial={{ y: "104%" }}
            animate={{ y: 0 }}
            exit={{ y: "104%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
            className="fixed inset-0 z-[101] overflow-y-auto bg-white dark:bg-charcoal-900 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:max-h-[88dvh] sm:w-full sm:max-w-md sm:rounded-2xl sm:border sm:border-slate-200/90 sm:shadow-[0_-12px_48px_rgba(0,0,0,0.18)] sm:dark:border-slate-600/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-700 dark:bg-charcoal-900 sm:rounded-t-2xl">
              <h2
                id="promo-banner-sheet-title"
                className="min-w-0 flex-1 text-base font-bold leading-snug text-slate-900 dark:text-slate-50 sm:text-lg"
              >
                {String(detail.title || "").trim() ||
                  String(detail.discountDescription || "")
                    .trim()
                    .slice(0, 80) ||
                  "โปรโมชัน"}
              </h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="ปิด"
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4 px-4 pb-6 pt-4">
              {(() => {
                const picked = pickBannerImageByAspect(detail, "16:9");
                const thumbRaw = convertGDriveUrl(picked) || picked;
                const thumb = resolveBannerImageResponsive(
                  thumbRaw,
                  "carousel",
                );
                const failed = !!bannerImageFailed[detail.id];
                if (!thumb.src || failed) return null;
                return (
                  <div className="overflow-hidden rounded-2xl ring-1 ring-black/[0.06] dark:ring-white/10">
                    <img
                      src={thumb.src}
                      srcSet={thumb.srcSet}
                      sizes={thumb.sizes}
                      alt=""
                      className="w-full max-h-[52dvh] object-contain bg-slate-100 dark:bg-slate-800/60"
                      loading="eager"
                      decoding="async"
                      referrerPolicy={imgReferrerPolicyForBannerSrc(thumb.src)}
                    />
                  </div>
                );
              })()}

              {(() => {
                const desc = bannerDiscountDescriptionDistinct(
                  detail.title,
                  detail.discountDescription,
                );
                return desc ? (
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {desc}
                  </p>
                ) : null;
              })()}

              {claimable && (
                <button
                  type="button"
                  onClick={() => void handleClaim()}
                  disabled={!!claimingCode}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <Tag size={16} />
                  {claimingCode === detail.promoCode
                    ? "กำลังรับ..."
                    : "รับโค้ดส่วนลด"}
                </button>
              )}

              {justClaimed && (
                <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50 px-4 py-3 dark:border-emerald-800/70 dark:bg-emerald-950/40">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    {t("home.promo_claim_saved")}
                  </p>
                  <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/90">
                    {t("home.promo_use_when_hiring")}
                  </p>
                  <Link
                    to="/dashboard/wallet"
                    onClick={() => setDetail(null)}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 sm:w-auto"
                  >
                    {t("home.promo_open_wallet")}
                  </Link>
                </div>
              )}

              {detail.promoCode ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-600 dark:bg-slate-800/50">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    โค้ดส่วนลด
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold tracking-wide text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-emerald-300 dark:ring-slate-600">
                      {detail.promoCode}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyCode(detail.promoCode!)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80"
                    >
                      {copied ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                    </button>
                  </div>
                </div>
              ) : null}

              {(detail.minCumulativeTopupThb ?? 0) > 0 ||
              detail.firstPaidJobOnly ? (
                <p className="text-xs leading-snug text-amber-800 dark:text-amber-200/95">
                  {(detail.minCumulativeTopupThb ?? 0) > 0
                    ? `ต้องเติมเงินสะสมอย่างน้อย ${detail.minCumulativeTopupThb} บาทก่อนรับโค้ด`
                    : null}
                  {(detail.minCumulativeTopupThb ?? 0) > 0 &&
                  detail.firstPaidJobOnly
                    ? " · "
                    : ""}
                  {detail.firstPaidJobOnly
                    ? "ใช้ได้เฉพาะการชำระงานจ้างครั้งแรก"
                    : ""}
                </p>
              ) : null}

              {detail.promoCode && detail.promoClaimsEnabled === false && (
                <p className="text-xs text-amber-700 dark:text-amber-300/90">
                  โปรโมชันแสดงอยู่ — การรับโค้ดถูกระงับชั่วคราวโดยแอดมิน
                </p>
              )}

              {detail.promoCode &&
                detail.promoClaimsEnabled !== false &&
                !isPromoClaimWindowActive(detail) && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {detail.promoValidFrom &&
                    Date.now() < new Date(detail.promoValidFrom).getTime()
                      ? `โค้ดจะใช้ได้เมื่อ: ${new Date(detail.promoValidFrom).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`
                      : `โค้ดหมดอายุแล้ว${detail.promoValidUntil ? ` (${new Date(detail.promoValidUntil).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})` : ""}`}
                  </p>
                )}

              {categories.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  <p>
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {t("home.promo_categories_label")}
                    </span>{" "}
                    {catsText.length > 120 && !showAllCategories
                      ? catsTruncated
                      : catsText}
                  </p>
                  {catsText.length > 120 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories((v) => !v)}
                      className="view-all-gold mt-1 text-[11px] font-semibold"
                    >
                      {showAllCategories
                        ? t("home.promo_categories_less")
                        : t("home.promo_categories_more")}
                    </button>
                  ) : null}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {detail.actionUrl ? (
                  <Link
                    to={resolveBannerActionPath(detail.actionUrl)}
                    onClick={() => setDetail(null)}
                    className="view-all-gold inline-flex flex-1 items-center justify-center gap-1 rounded-2xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm font-semibold transition hover:opacity-90 sm:flex-initial sm:min-w-[140px]"
                  >
                    {t("home.view_all")}
                    <ArrowRight size={16} className="ml-0.5" color="#D4AF37" />
                  </Link>
                ) : null}
              </div>

              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                onClick={() => setShowLegal((v) => !v)}
                aria-expanded={showLegal}
              >
                {showLegal ? "▼ " : "▶ "}
                {t("home.promo_disclaimer_toggle")}
              </button>
              {showLegal ? (
                <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                  {t("home.promo_disclaimer_body")}
                </p>
              ) : null}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * แบนเนอร์ 1 รายการ — ไม่ใช้ Embla (หลีกเลี่ยงสไลด์กว้าง 0 / ความสูง 0 บนมือถือ)
 */
function PromoBannerHeroCarouselOne({
  banners,
  bannerImageFailed,
  setBannerImageFailed,
  claimingCode,
  onClaimVoucher,
  promoVouchersEnabled,
  layout,
  slideHeight = "hero",
  interactionMode = "classic",
  compactPortrait = false,
  onBannerTap,
  className = "",
}: PromoBannerHeroCarouselProps) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<HomeBannerItem | null>(null);
  const [detail, setDetail] = useState<HomeBannerItem | null>(null);
  const [copied, setCopied] = useState(false);
  const banner = banners[0]!;

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

  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }, []);

  const openPreview = useCallback((b: HomeBannerItem, _slideIndex: number) => {
    setPreview(b);
  }, []);

  const openDetail = useCallback((b: HomeBannerItem) => {
    setPreview(null);
    setDetail(b);
    void MockApi.recordBannerEvent(b.id, "sheet_open");
  }, []);

  const bleed = layout === "fullBleed" ? "-mx-4 sm:-mx-6 lg:-mx-8" : "";
  const oneFailed = !!bannerImageFailed[banner.id];
  const baseAspect =
    (parseBannerSlideHeight(banner.slideHeight) ?? slideHeight) === "portrait"
      ? "9:16"
      : "16:9";
  const onePicked = pickBannerImageByAspect(banner, baseAspect);
  const oneRawImg = String(onePicked ?? "").trim();
  const onePipelineRaw = oneRawImg
    ? convertGDriveUrl(oneRawImg) || oneRawImg
    : oneRawImg;
  const oneResponsive = resolveBannerImageResponsive(
    onePipelineRaw || oneRawImg,
    "carousel",
  );
  const oneSrc = oneResponsive.src;
  const oneLabel =
    String(banner.title || "").trim() ||
    String(banner.discountDescription || "")
      .trim()
      .slice(0, 120) ||
    "โปรโมชัน";
  const oneHeightPx = (() => {
    const h = parseBannerSlideHeight(banner.slideHeight) ?? slideHeight;
    if (h === "strip") return 118;
    if (h === "portrait") return compactPortrait ? 240 : 300;
    return 176;
  })();
  const oneIsPortrait =
    (parseBannerSlideHeight(banner.slideHeight) ?? slideHeight) === "portrait";
  const isOverlayOpen =
    detail != null || (interactionMode === "preview" && preview != null);

  return (
    <>
      <div
        className={`${bleed} ${className} transition-opacity duration-150 ${
          isOverlayOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`.trim()}
        aria-hidden={isOverlayOpen}
      >
        <div className={CAROUSEL_CHROME}>
          <button
            type="button"
            onClick={() => {
              onBannerTap?.(banner, interactionMode);
              if (interactionMode === "preview") openPreview(banner, 0);
              else openDetail(banner);
            }}
            className="group relative block w-full overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-charcoal-900"
            aria-label={`เปิดโปรโมชัน: ${oneLabel}`}
          >
            <div
              className={`relative w-full overflow-hidden ${
                oneIsPortrait ? "mx-auto max-w-[min(100%,200px)]" : ""
              }`}
              style={{ height: oneHeightPx }}
            >
              {oneSrc && !oneFailed ? (
                <img
                  src={oneSrc}
                  srcSet={oneResponsive.srcSet}
                  sizes={oneResponsive.sizes}
                  alt=""
                  className={`absolute inset-0 h-full w-full object-center ${
                    oneIsPortrait
                      ? "object-contain bg-slate-100 dark:bg-slate-900"
                      : "object-cover"
                  }`}
                  loading="eager"
                  decoding="async"
                  referrerPolicy={imgReferrerPolicyForBannerSrc(oneSrc)}
                  onError={() => {
                    logBannerImageEvent(
                      "error",
                      "main",
                      String(banner.id),
                      String(oneSrc),
                      "one-card",
                    );
                    setBannerImageFailed((prev) => ({
                      ...prev,
                      [banner.id]: true,
                    }));
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-800 px-4">
                  <p className="text-center text-sm font-bold leading-snug text-white sm:text-base">
                    {oneLabel}
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 ring-1 ring-black/[0.04]" />
            </div>
          </button>
        </div>
      </div>

      {interactionMode === "preview" ? (
        <PromoBannerFullScreenPreview
          preview={preview}
          setPreview={setPreview}
          onOpenDetail={openDetail}
        />
      ) : null}

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
}

/** หลายแบนเนอร์ — Embla + จุด + peek */
function PromoBannerHeroCarouselMany({
  banners,
  bannerImageFailed,
  setBannerImageFailed,
  claimingCode,
  onClaimVoucher,
  promoVouchersEnabled,
  layout,
  slideHeight = "hero",
  peekSlides = true,
  interactionMode = "classic",
  compactPortrait = false,
  onBannerTap,
  className = "",
}: PromoBannerHeroCarouselProps) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<HomeBannerItem | null>(null);
  const [detail, setDetail] = useState<HomeBannerItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const lastSheetSnapRef = useRef<number | null>(null);

  const peek = peekSlides && banners.length > 1;

  const bannerIdentityKey = useMemo(
    () =>
      banners
        .map(
          (b) =>
            `${String(b.id)}:${String(b.imageUrl ?? "")}:${String(b.title ?? "")}`,
        )
        .join("|"),
    [banners],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: peek ? "center" : "start",
    containScroll: "trimSnaps",
    dragFree: false,
  });

  useLayoutEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
  }, [emblaApi, peek, bannerIdentityKey]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
    const id = window.requestAnimationFrame(() => {
      emblaApi.reInit();
    });
    return () => window.cancelAnimationFrame(id);
  }, [emblaApi, peek, bannerIdentityKey]);

  useEffect(() => {
    if (!detail?.id) return;
    setCopied(false);
  }, [detail?.id]);

  useEffect(() => {
    if (detail != null) return;
    const i = lastSheetSnapRef.current;
    if (i == null || !emblaApi) return;
    const tmr = window.setTimeout(() => {
      emblaApi.scrollTo(i, true);
    }, 0);
    return () => clearTimeout(tmr);
  }, [detail, emblaApi]);

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

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, bannerIdentityKey]);

  const scrollTo = useCallback(
    (i: number) => {
      emblaApi?.scrollTo(i);
    },
    [emblaApi],
  );

  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }, []);

  const openPreview = useCallback(
    (banner: HomeBannerItem, slideIndex: number) => {
      lastSheetSnapRef.current = slideIndex;
      onBannerTap?.(banner, interactionMode);
      if (interactionMode === "preview") {
        setPreview(banner);
      } else {
        setDetail(banner);
        scrollTo(slideIndex);
        void MockApi.recordBannerEvent(banner.id, "sheet_open");
      }
    },
    [interactionMode, onBannerTap, scrollTo],
  );

  const openDetail = useCallback(
    (banner: HomeBannerItem) => {
      const i = lastSheetSnapRef.current;
      setPreview(null);
      setDetail(banner);
      if (typeof i === "number") scrollTo(i);
      void MockApi.recordBannerEvent(banner.id, "sheet_open");
    },
    [scrollTo],
  );

  const selectedHeight =
    parseBannerSlideHeight(banners[selectedIndex]?.slideHeight) ?? slideHeight;
  const isStripDots = selectedHeight === "strip";

  const bleed = layout === "fullBleed" ? "-mx-4 sm:-mx-6 lg:-mx-8" : "";

  const slideFlex = peek
    ? "min-w-0 flex-[0_0_88%] sm:flex-[0_0_88%]"
    : "w-full min-w-full flex-[0_0_100%] shrink-0";
  const slideGap = peek ? "mr-3 last:mr-0" : "";
  const isOverlayOpen =
    detail != null || (interactionMode === "preview" && preview != null);

  return (
    <>
      <div
        className={`${bleed} ${className} transition-opacity duration-150 ${
          isOverlayOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`.trim()}
        aria-hidden={isOverlayOpen}
      >
        <div
          className={CAROUSEL_CHROME}
          ref={emblaRef}
          style={{
            minHeight:
              selectedHeight === "portrait"
                ? 220
                : selectedHeight === "strip"
                  ? 88
                  : 168,
          }}
        >
          <div
            className={`flex w-full min-w-0 touch-pan-y ${peek ? "py-0.5" : ""}`}
          >
            {banners.map((banner, slideIndex) => (
              <div
                key={banner.id}
                className={`${slideFlex} ${slideGap} ${peek ? "min-w-0" : ""}`.trim()}
              >
                <PromoBannerHeroSlide
                  banner={banner}
                  slideIndex={slideIndex}
                  slideHeight={slideHeight}
                  compactPortrait={compactPortrait}
                  bannerImageFailed={bannerImageFailed}
                  setBannerImageFailed={setBannerImageFailed}
                  onOpen={openPreview}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          className={`flex justify-center gap-1.5 ${isStripDots ? "mt-2" : "mt-3"}`}
          role="tablist"
          aria-label="เลือกสไลด์โปรโมชัน"
        >
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === selectedIndex}
              aria-label={`สไลด์ ${i + 1} จาก ${banners.length}`}
              onClick={() => scrollTo(i)}
              className={`rounded-full transition-all ${
                isStripDots ? "h-1.5" : "h-2"
              } ${
                i === selectedIndex
                  ? isStripDots
                    ? "w-5 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                    : "w-6 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                  : isStripDots
                    ? "w-1.5 bg-white/35 hover:bg-white/50 dark:bg-slate-500 dark:hover:bg-slate-400"
                    : "w-2 bg-white/35 hover:bg-white/50 dark:bg-slate-500 dark:hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      </div>

      {interactionMode === "preview" ? (
        <PromoBannerFullScreenPreview
          preview={preview}
          setPreview={setPreview}
          onOpenDetail={openDetail}
        />
      ) : null}

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
}

/**
 * Router: ไม่มีสถานะ isLoading ภายใน — รายการส่งมาจาก BackendBannersSection หลัง fetch เสร็จแล้ว
 * คืน null เมื่อ banners.length === 0 เท่านั้น (ไม่ขัดแย้งกับส่วนโหลดข้อมูลภายนอก)
 */
export const PromoBannerHeroCarousel: React.FC<PromoBannerHeroCarouselProps> = (
  props,
) => {
  if (props.banners.length === 0) return null;
  if (props.banners.length === 1)
    return <PromoBannerHeroCarouselOne {...props} />;
  return <PromoBannerHeroCarouselMany {...props} />;
};
