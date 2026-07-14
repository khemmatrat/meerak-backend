import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PromoBannerHeroCarousel } from "./PromoBannerHeroCarousel";
import { PromoBannerFeed } from "./PromoBannerFeed";
import { BackendBannersErrorBoundary } from "./BackendBannersErrorBoundary";
import { MockApi } from "../services/mockApi";
import { claimPromoVoucherFromBanner } from "../services/promoVoucherService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { PortraitBannerInterstitial } from "./PortraitBannerInterstitial";
import {
  type HomeBannerItem,
  bannerVisibleForJobCategory,
  parseBannerSlideHeight,
} from "../utils/bannerDisplay";

export type BackendBannersVariant = "welcome" | "compact";

type Props = {
  variant: BackendBannersVariant;
  /**
   * Query placement= ให้ API กรอง
   * variant=welcome และไม่ส่ง placement → เรียก placement=welcome (มี fallback รายการเต็มเมื่อว่าง)
   */
  placement?: "welcome" | "job_detail" | "home";
  /** หน้ารายละเอียดงาน — กรองแบนเนอร์ที่จำกัดหมวด */
  jobCategory?: string;
  className?: string;
  /** ทับค่า hero/strip อัตโนมัติ (เช่น portrait สำหรับแคมเปญ 9:16) */
  slideHeight?: import("./PromoBannerHeroCarousel").PromoBannerSlideHeight;
};

/** รวม banners + สถานะหนึ่ง set — ไม่มี fetchDone ก่อน banners (กัน re-render ผิดลำดับ) */
type BannerBundle =
  | { phase: "loading"; banners: HomeBannerItem[]; fetchError: null }
  | { phase: "done"; banners: HomeBannerItem[]; fetchError: string | null };

export const BackendBannersSection: React.FC<Props> = ({
  variant,
  placement,
  jobCategory,
  className = "",
  slideHeight: slideHeightOverride,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig } = useMobileAppConfig();
  const [bundle, setBundle] = useState<BannerBundle>(() => ({
    phase: "loading",
    banners: [],
    fetchError: null,
  }));
  const [claimingCode, setClaimingCode] = useState<string | null>(null);
  const [bannerImageFailed, setBannerImageFailed] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    let cancelled = false;

    setBundle({ phase: "loading", banners: [], fetchError: null });

    const sortBanners = (list: HomeBannerItem[]) =>
      [...list].sort((a, b) => (a.order || 0) - (b.order || 0));

    const run = async () => {
      try {
        const placementParam =
          placement ?? (variant === "welcome" ? "welcome" : undefined);
        const primary = await MockApi.getBanners(placementParam, { signal });

        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
          console.log("[AQOND] Raw Banner Data:", primary);
          const rawLen = Array.isArray(
            (primary as { banners?: unknown }).banners,
          )
            ? (primary as { banners: unknown[] }).banners.length
            : -1;
          console.log(
            "[AQOND] Banner schema check: keys=",
            Object.keys(primary || {}),
            "banners.length=",
            rawLen,
          );
        }

        if (cancelled || signal.aborted) return;

        const sorted = sortBanners(
          (primary.banners || []) as unknown as HomeBannerItem[],
        );
        setBundle({ phase: "done", banners: sorted, fetchError: null });
      } catch (e: unknown) {
        if (cancelled || signal.aborted) return;
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "ไม่สามารถโหลดแบนเนอร์ได้";
        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
          console.warn("[AQOND] Banner fetch lifecycle error:", e);
        }
        setBundle({ phase: "done", banners: [], fetchError: msg });
      }
    };

    void run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [variant, placement]);

  const isCompact = variant === "compact";
  const visible = bundle.banners.filter((b) =>
    bannerVisibleForJobCategory(b, jobCategory),
  );
  /** Welcome + Home — feed layout (hero + horizontal rail) */
  const usePromoFeedLayout =
    variant === "welcome" ||
    (variant === "compact" && (placement === "home" || !placement));
  const contentMinHeightPx = isCompact ? (usePromoFeedLayout ? 200 : 118) : 168;

  useEffect(() => {
    if (
      (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV &&
      bundle.phase === "done"
    ) {
      console.log("[AQOND] Banner Payload:", visible);
    }
  }, [bundle.phase, visible]);

  const handleClaimVoucher = async (code: string): Promise<boolean> => {
    if (!user) {
      notify("กรุณาเข้าสู่ระบบก่อนรับโค้ดส่วนลด", "error");
      return false;
    }
    if (!mobileAppConfig.featureFlags.enablePromoVouchers) {
      notify("ระบบรับโค้ดส่วนลดถูกปิดชั่วคราว", "warning");
      return false;
    }
    setClaimingCode(code);
    try {
      const data = await claimPromoVoucherFromBanner(code);
      notify(
        data.message || "รับโค้ดส่วนลดสำเร็จ ใช้ได้เมื่อจ้างงาน (วงเงินจำกัด)",
        "success",
      );
      return true;
    } catch (e: unknown) {
      const ax = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const msg =
        ax?.response?.data?.error ||
        (e instanceof Error ? e.message : null) ||
        "รับโค้ดไม่สำเร็จ";
      notify(msg, "error");
      return false;
    } finally {
      setClaimingCode(null);
    }
  };

  const carouselRemote = mobileAppConfig.remote.bannerCarousel;
  const remoteDefault = parseBannerSlideHeight(
    carouselRemote?.defaultSlideHeight,
  );
  /**
   * UX/readability guard:
   * โหมด strip ทำให้ตัวหนังสือบนรูปเล็กและอ่านยากบนมือถือ (ตาม feedback ล่าสุด)
   * จึงยกเป็น hero เป็นค่าหลัก และให้ override ผ่าน prop ได้เสมอ
   */
  const effectiveRemoteDefault =
    remoteDefault === "strip" ? "hero" : remoteDefault;
  const slideHeightResolved =
    slideHeightOverride ?? effectiveRemoteDefault ?? "hero";
  const rawInteractionMode = String(carouselRemote?.interactionMode || "")
    .trim()
    .toLowerCase();
  const interactionMode: "classic" | "preview" =
    rawInteractionMode === "preview" ? "preview" : "classic";
  const peekSlides = carouselRemote?.peekSlides ?? true;

  // Portrait interstitial handles its own open/close.

  if (bundle.phase === "loading") {
    return (
      <section
        className={`${className} mb-2`}
        aria-busy="true"
        aria-label="โปรโมชัน"
      >
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          โปรโมชัน
        </p>
        <div
          className="flex w-full items-center justify-center rounded-[18px] bg-slate-100 text-center text-sm text-slate-400 ring-1 ring-slate-200/80 animate-pulse"
          style={{ minHeight: contentMinHeightPx }}
          role="status"
        >
          <span className="sr-only">กำลังโหลดโปรโมชัน</span>
          <span aria-hidden className="px-4">
            กำลังโหลด…
          </span>
        </div>
      </section>
    );
  }

  if (bundle.fetchError) {
    return (
      <section className={`${className} mb-2`} aria-label="โปรโมชัน">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          โปรโมชัน
        </p>
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-[18px] bg-amber-50 px-4 py-4 text-center text-sm text-amber-950 ring-1 ring-amber-200"
          style={{ minHeight: contentMinHeightPx }}
        >
          <span>โหลดโปรโมชันไม่สำเร็จ — ตรวจสอบเครือข่ายแล้วลองรีเฟรช</span>
          {(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? (
            <code className="max-w-full break-all text-[10px] text-amber-800/90">
              {bundle.fetchError}
            </code>
          ) : null}
        </div>
      </section>
    );
  }

  if (visible.length === 0) {
    return (
      <section className={`${className} mb-2`} aria-label="โปรโมชัน">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          โปรโมชัน
        </p>
        <div
          className="flex items-center justify-center rounded-[18px] bg-slate-100 px-4 text-center text-sm text-slate-500 ring-1 ring-slate-200/80"
          style={{ minHeight: contentMinHeightPx }}
        >
          ยังไม่มีโปรโมชันที่ใช้งานอยู่ในขณะนี้
        </div>
      </section>
    );
  }

  return (
    <BackendBannersErrorBoundary variant={variant}>
      <section className={`${className} mb-2`} aria-label="โปรโมชัน">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          โปรโมชัน
        </p>
        {/* Full-screen portrait interstitial (home after login) */}
        {placement === "home" && variant === "compact" ? (
          <PortraitBannerInterstitial
            banners={visible}
            autoCloseSeconds={9}
            onOpen={() => {
              /* open handled by carousel tap */
            }}
          />
        ) : null}
        {usePromoFeedLayout ? (
          <PromoBannerFeed
            banners={visible}
            bannerImageFailed={bannerImageFailed}
            setBannerImageFailed={setBannerImageFailed}
            claimingCode={claimingCode}
            onClaimVoucher={handleClaimVoucher}
            promoVouchersEnabled={
              mobileAppConfig.featureFlags.enablePromoVouchers
            }
          />
        ) : (
          <PromoBannerHeroCarousel
            banners={visible}
            bannerImageFailed={bannerImageFailed}
            setBannerImageFailed={setBannerImageFailed}
            claimingCode={claimingCode}
            onClaimVoucher={handleClaimVoucher}
            promoVouchersEnabled={
              mobileAppConfig.featureFlags.enablePromoVouchers
            }
            layout="inset"
            slideHeight={slideHeightResolved}
            interactionMode={interactionMode}
            peekSlides={peekSlides}
          />
        )}
        {mobileAppConfig.featureFlags.enablePromoVouchers && user ? (
          <div className="mt-2 flex justify-center px-1">
            <Link
              to="/dashboard/wallet"
              className="inline-flex max-w-full items-center gap-1 text-center text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              <span>{t("home.promo_wallet_row_hint")}</span>
            </Link>
          </div>
        ) : null}
      </section>
    </BackendBannersErrorBoundary>
  );
};
