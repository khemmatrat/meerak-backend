import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import { api, getBackendBase, forceHttpsBase } from "../services/api";
import type { DistancePricingSettingsResponse } from "../services/transportDistancePricingService";
import { seedDistancePricingCache } from "../services/transportDistancePricingService";
import { applyBootstrapComplianceVersions } from "../services/compliancePolicyService";
import {
  parseBannerSlideHeight,
  type BannerSlideHeight,
} from "../utils/bannerDisplay";

/** โพลเลขออนไลน์สาธารณะ — เดิม 60s เลยรู้สึกว่ายอดไม่ขยับ (จริงๆ เซิร์ฟเวอร์คิดใหม่จะเห็นหลังช่วงนี้) */
const DISPLAYED_ONLINE_POLL_MS = 25_000;
/** อัปเดต last_active_at ฝั่งเซิร์ฟเวอร์ให้ผู้ที่ล็อกอินถูกนับในกลุ่ม active (~15 นาที) */
const SESSION_PRESENCE_INTERVAL_MS = 60_000;

export type MobileAppFeatureFlags = {
  enableSignups: boolean;
  enablePayments: boolean;
  enableJobPosting: boolean;
  enableChat: boolean;
  enablePromoVouchers: boolean;
  maintenanceMode: boolean;
};

/** ค่าเริ่มต้น carousel แบนเนอร์ — ทับได้เป็นรายแบนเนอร์ (slideHeight จาก API) */
export type MobileAppBannerCarouselRemote = {
  defaultSlideHeight?: BannerSlideHeight;
  interactionMode?: "classic" | "preview";
  peekSlides?: boolean;
};

/** ข้อความ/สวิตช์ที่แอดมินแก้ได้ทันที — GET /api/app/bootstrap (+ overlay จาก /api/app/config เมื่อจำเป็น) */
export type MobileAppRemote = {
  paymentNoticeTh: string;
  paymentNoticeEn: string;
  transportNoticeTh: string;
  transportNoticeEn: string;
  promoNoticeTh: string;
  promoNoticeEn: string;
  showPromoFundBalance: boolean;
  complianceSupportEmail: string;
  bannerCarousel?: MobileAppBannerCarouselRemote;
  /** แสดงเมื่อ ≥ 1 — เซิร์ฟเวอร์ใส่เป็น max(ขั้นต่ำแอดมิน, ผู้ใช้ที่ active ~15 นาที) */
  homeDisplayedOnlineUsers?: number;
  /** ปรับน้ำหนัก auto-route ราย vertical ได้จาก config โดยไม่แก้โค้ด */
  routingWeightOverrides?: Record<
    string,
    Partial<Record<"booking" | "match_job" | "jobboard" | "videofeed", number>>
  >;
  /** ข้อความช่วยเหลือ Job Board / Advance Job — แก้ได้จากแอดมินโดยไม่ deploy */
  jobBoardCopy?: {
    experimentId?: string;
    variant?: string;
    smartMatchTitle?: string;
    smartMatchTooltip?: string;
    emptyAllBullets?: string[];
    emptyMyJobsBullets?: string[];
    emptyApplicationsBullets?: string[];
    emptySavedBullets?: string[];
    appliedModalBody?: string;
    manageNoApplicantsBullets?: string[];
    createJobDescPlaceholder?: string;
    hireSummarySteps?: string[];
    /** จังหวัดเสริมสำหรับ smart match (นอกจากโปรไฟล์ user) */
    smartMatchProvinces?: string[];
    smartMatchReasonLabels?: {
      saved?: string;
      applied?: string;
      profileProvince?: string;
      nearProvince?: string;
      routing?: string;
      categoryHistory?: string;
    };
  };
};

export type MobileAppConfig = {
  iosMinVersion: string;
  androidMinVersion: string;
  welcomeMessage: string;
  forceUpdateMessage: string;
  iosStoreUrl: string;
  playStoreUrl: string;
  pushNotificationEnabled: boolean;
  remote: MobileAppRemote;
  featureFlags: MobileAppFeatureFlags;
};

/** สถิติเป้าหมายร่วม — GET /api/app/bootstrap + /api/app/community-challenge */
export type CommunityChallengeStats = {
  onlineUsers: number;
  jobsPosted: number;
  hiresTotal: number;
  completedTotal: number;
  hiresMatch: number;
  hiresAdvance: number;
  completedMatch: number;
  completedAdvance: number;
  progress: {
    onlinePct: number;
    postedPct: number;
    hiresPct: number;
    completedPct: number;
  };
  targets: {
    onlineUsers: number;
    jobsPosted: number;
    hires: number;
    completed: number;
  };
  allTargetsMet: boolean;
  onlineWindowMinutes: number;
};

export type CommunityChallengeBootstrap = {
  enabled: boolean;
  config?: Record<string, unknown>;
  stats?: CommunityChallengeStats;
};

export type AppBootstrapPayload = {
  paymentProvider: Record<string, unknown> | null;
  transportPricing: DistancePricingSettingsResponse | null;
  promoFund: {
    balance_thb: number;
    visible: boolean;
    updated_at: string | null;
  };
  complianceVersions: { terms: string | null; privacy: string | null };
  /** เป้าหมายร่วม (ออนไลน์ / จ้างงาน / สำเร็จ) — แอดมินควบคุม */
  communityChallenge: CommunityChallengeBootstrap;
  fetchedAt: string | null;
};

const DEFAULT_FLAGS: MobileAppFeatureFlags = {
  enableSignups: true,
  enablePayments: true,
  enableJobPosting: true,
  enableChat: true,
  enablePromoVouchers: true,
  maintenanceMode: false,
};

const DEFAULT_REMOTE: MobileAppRemote = {
  paymentNoticeTh: "",
  paymentNoticeEn: "",
  transportNoticeTh: "",
  transportNoticeEn: "",
  promoNoticeTh: "",
  promoNoticeEn: "",
  showPromoFundBalance: false,
  complianceSupportEmail: "",
  homeDisplayedOnlineUsers: 1240,
};

/** เมื่อ API ไม่ส่งค่า — ใช้เป็นฐานโชว์หน้าแรก (ไม่ใช้เมื่อแอดมินตั้งเป็น 0) */
export const HOME_DISPLAYED_ONLINE_FALLBACK = 1240;

const DEFAULT_CONFIG: MobileAppConfig = {
  iosMinVersion: "1.2.0",
  androidMinVersion: "1.4.5",
  welcomeMessage: "ยินดีต้อนรับสู่ aqond! โปรโมชั่นใหม่รอคุณอยู่",
  forceUpdateMessage:
    "แอปเวอร์ชันนี้ไม่รองรับแล้ว กรุณาอัปเดตจาก App Store / Play Store เพื่อใช้งานต่อ",
  iosStoreUrl: "",
  playStoreUrl: "",
  pushNotificationEnabled: true,
  remote: { ...DEFAULT_REMOTE },
  featureFlags: { ...DEFAULT_FLAGS },
};

function mergeBannerCarouselRemote(
  raw: MobileAppRemote["bannerCarousel"] | null | undefined,
): MobileAppBannerCarouselRemote | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const out: MobileAppBannerCarouselRemote = {};
  const parsed = parseBannerSlideHeight(
    (raw as { defaultSlideHeight?: unknown }).defaultSlideHeight,
  );
  if (parsed) out.defaultSlideHeight = parsed;

  const imRaw = String(
    (raw as { interactionMode?: unknown }).interactionMode || "",
  )
    .trim()
    .toLowerCase();
  if (imRaw === "preview" || imRaw === "classic") {
    out.interactionMode = imRaw;
  }

  if (typeof (raw as { peekSlides?: unknown }).peekSlides === "boolean") {
    out.peekSlides = (raw as { peekSlides: boolean }).peekSlides;
  }

  return Object.keys(out).length ? out : undefined;
}

function mergeRemote(
  raw: Partial<MobileAppRemote> | null | undefined,
): MobileAppRemote {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_REMOTE };
  const bc = mergeBannerCarouselRemote(raw.bannerCarousel);
  const hoRawUnknown = raw.homeDisplayedOnlineUsers as unknown;
  const hoParsed =
    typeof hoRawUnknown === "number"
      ? hoRawUnknown
      : typeof hoRawUnknown === "string" && String(hoRawUnknown).trim() !== ""
        ? Number(String(hoRawUnknown).trim())
        : NaN;
  const ho =
    Number.isFinite(hoParsed) && hoParsed >= 1
      ? Math.min(Math.floor(hoParsed), 99_999_999)
      : undefined;
  const rw =
    raw.routingWeightOverrides &&
    typeof raw.routingWeightOverrides === "object"
      ? (raw.routingWeightOverrides as MobileAppRemote["routingWeightOverrides"])
      : undefined;
  return {
    paymentNoticeTh:
      typeof raw.paymentNoticeTh === "string"
        ? raw.paymentNoticeTh
        : DEFAULT_REMOTE.paymentNoticeTh,
    paymentNoticeEn:
      typeof raw.paymentNoticeEn === "string"
        ? raw.paymentNoticeEn
        : DEFAULT_REMOTE.paymentNoticeEn,
    transportNoticeTh:
      typeof raw.transportNoticeTh === "string"
        ? raw.transportNoticeTh
        : DEFAULT_REMOTE.transportNoticeTh,
    transportNoticeEn:
      typeof raw.transportNoticeEn === "string"
        ? raw.transportNoticeEn
        : DEFAULT_REMOTE.transportNoticeEn,
    promoNoticeTh:
      typeof raw.promoNoticeTh === "string"
        ? raw.promoNoticeTh
        : DEFAULT_REMOTE.promoNoticeTh,
    promoNoticeEn:
      typeof raw.promoNoticeEn === "string"
        ? raw.promoNoticeEn
        : DEFAULT_REMOTE.promoNoticeEn,
    showPromoFundBalance:
      typeof raw.showPromoFundBalance === "boolean"
        ? raw.showPromoFundBalance
        : DEFAULT_REMOTE.showPromoFundBalance,
    complianceSupportEmail:
      typeof raw.complianceSupportEmail === "string"
        ? raw.complianceSupportEmail
        : DEFAULT_REMOTE.complianceSupportEmail,
    ...(bc ? { bannerCarousel: bc } : {}),
    ...(typeof ho === "number" && ho >= 1
      ? { homeDisplayedOnlineUsers: ho }
      : {}),
    ...(rw ? { routingWeightOverrides: rw } : {}),
  };
}

function mergeConfig(
  raw: Partial<MobileAppConfig> | null | undefined,
): MobileAppConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG };
  const ff = (
    raw.featureFlags && typeof raw.featureFlags === "object"
      ? raw.featureFlags
      : {}
  ) as Partial<MobileAppFeatureFlags>;
  return {
    iosMinVersion:
      typeof raw.iosMinVersion === "string"
        ? raw.iosMinVersion
        : DEFAULT_CONFIG.iosMinVersion,
    androidMinVersion:
      typeof raw.androidMinVersion === "string"
        ? raw.androidMinVersion
        : DEFAULT_CONFIG.androidMinVersion,
    welcomeMessage:
      typeof raw.welcomeMessage === "string"
        ? raw.welcomeMessage
        : DEFAULT_CONFIG.welcomeMessage,
    forceUpdateMessage:
      typeof raw.forceUpdateMessage === "string"
        ? raw.forceUpdateMessage
        : DEFAULT_CONFIG.forceUpdateMessage,
    iosStoreUrl:
      typeof raw.iosStoreUrl === "string"
        ? raw.iosStoreUrl
        : DEFAULT_CONFIG.iosStoreUrl,
    playStoreUrl:
      typeof raw.playStoreUrl === "string"
        ? raw.playStoreUrl
        : DEFAULT_CONFIG.playStoreUrl,
    pushNotificationEnabled:
      typeof raw.pushNotificationEnabled === "boolean"
        ? raw.pushNotificationEnabled
        : DEFAULT_CONFIG.pushNotificationEnabled,
    remote: mergeRemote(raw.remote),
    featureFlags: {
      enableSignups:
        typeof ff.enableSignups === "boolean"
          ? ff.enableSignups
          : DEFAULT_FLAGS.enableSignups,
      enablePayments:
        typeof ff.enablePayments === "boolean"
          ? ff.enablePayments
          : DEFAULT_FLAGS.enablePayments,
      enableJobPosting:
        typeof ff.enableJobPosting === "boolean"
          ? ff.enableJobPosting
          : DEFAULT_FLAGS.enableJobPosting,
      enableChat:
        typeof ff.enableChat === "boolean"
          ? ff.enableChat
          : DEFAULT_FLAGS.enableChat,
      enablePromoVouchers:
        typeof ff.enablePromoVouchers === "boolean"
          ? ff.enablePromoVouchers
          : DEFAULT_FLAGS.enablePromoVouchers,
      maintenanceMode:
        typeof ff.maintenanceMode === "boolean"
          ? ff.maintenanceMode
          : DEFAULT_FLAGS.maintenanceMode,
    },
  };
}

const DEFAULT_BOOTSTRAP: AppBootstrapPayload = {
  paymentProvider: null,
  transportPricing: null,
  promoFund: { balance_thb: 0, visible: false, updated_at: null },
  complianceVersions: { terms: null, privacy: null },
  communityChallenge: { enabled: false },
  fetchedAt: null,
};

type MobileAppConfigContextValue = {
  config: MobileAppConfig;
  /** รวม payment gate, ราคาเดินทาง, กองทุนโปร, เวอร์ชัน compliance — โหลดครั้งเดียวกับ config */
  bootstrap: AppBootstrapPayload;
  loading: boolean;
  updatedAt: string | null;
  refresh: () => Promise<void>;
};

const MobileAppConfigContext =
  createContext<MobileAppConfigContextValue | null>(null);

/** ฐานเดียวกับ resolveAxiosBaseURL — ไม่มี slash ท้าย */
function getApiRoot(): string {
  const base = getBackendBase().replace(/\/$/, "");
  const httpsBase = forceHttpsBase();
  const apiRoot = httpsBase ? httpsBase : `${base}/api`;
  return apiRoot.replace(/\/$/, "");
}

export const MobileAppConfigProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [config, setConfig] = useState<MobileAppConfig>(DEFAULT_CONFIG);
  const [bootstrap, setBootstrap] =
    useState<AppBootstrapPayload>(DEFAULT_BOOTSTRAP);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const apiRoot = getApiRoot();
    type BootstrapResp = {
      config?: unknown;
      updatedAt?: string | null;
      paymentProvider?: unknown;
      transportPricing?: DistancePricingSettingsResponse | null;
      promoFund?: AppBootstrapPayload["promoFund"];
      complianceVersions?: AppBootstrapPayload["complianceVersions"];
      communityChallenge?: AppBootstrapPayload["communityChallenge"];
      fetchedAt?: string;
    };
    try {
      // ไม่ throw เมื่อ 404 — บาง deploy ของ api.aqond.com ยังไม่มี /app/bootstrap
      const boot = await axios.get<BootstrapResp>(`${apiRoot}/app/bootstrap`, {
        timeout: 15000,
        validateStatus: (s) => s >= 200 && s < 600,
      });
      if (boot.status === 200 && boot.data) {
        const data = boot.data;
        let partial = data?.config as Partial<MobileAppConfig> | undefined;
        const partialRemote =
          partial?.remote && typeof partial.remote === "object"
            ? partial.remote
            : undefined;
        const remoteHasOnlineKey =
          !!partialRemote &&
          Object.prototype.hasOwnProperty.call(
            partialRemote,
            "homeDisplayedOnlineUsers",
          );
        if (!remoteHasOnlineKey) {
          try {
            const cfgPub = await axios.get<{
              config?: unknown;
              updatedAt?: string | null;
            }>(`${apiRoot}/app/config`, {
              timeout: 12000,
              validateStatus: (s) => s >= 200 && s < 600,
            });
            const pubCfg = cfgPub.data?.config as
              | Partial<MobileAppConfig>
              | undefined;
            const pubRemote =
              pubCfg?.remote && typeof pubCfg.remote === "object"
                ? pubCfg.remote
                : undefined;
            const ho = (pubRemote as { homeDisplayedOnlineUsers?: unknown })
              ?.homeDisplayedOnlineUsers;
            if (
              typeof ho === "number" &&
              Number.isFinite(ho) &&
              ho >= 0 &&
              ho <= 99_999_999
            ) {
              partial = {
                ...(partial && typeof partial === "object" ? partial : {}),
                remote: {
                  ...(partialRemote && typeof partialRemote === "object"
                    ? partialRemote
                    : {}),
                  homeDisplayedOnlineUsers: ho,
                },
              } as Partial<MobileAppConfig>;
            }
          } catch (_) {
            /* ignore — mergeConfig uses defaults */
          }
        }

        const merged = mergeConfig(partial);
        setConfig(merged);
        applyBootstrapComplianceVersions({
          terms: data?.complianceVersions?.terms ?? null,
          privacy: data?.complianceVersions?.privacy ?? null,
        });
        const tp = data?.transportPricing ?? null;
        if (tp && typeof tp === "object") {
          seedDistancePricingCache(tp);
        }
        const pf = data?.promoFund as
          | AppBootstrapPayload["promoFund"]
          | undefined;
        setBootstrap({
          paymentProvider:
            data?.paymentProvider && typeof data.paymentProvider === "object"
              ? (data.paymentProvider as Record<string, unknown>)
              : null,
          transportPricing: tp,
          promoFund: {
            balance_thb:
              typeof pf?.balance_thb === "number" ? pf.balance_thb : 0,
            visible: !!pf?.visible,
            updated_at: pf?.updated_at ?? null,
          },
          complianceVersions: {
            terms: data?.complianceVersions?.terms ?? null,
            privacy: data?.complianceVersions?.privacy ?? null,
          },
          communityChallenge:
            data?.communityChallenge &&
            typeof data.communityChallenge === "object"
              ? {
                  enabled: !!data.communityChallenge.enabled,
                  config: data.communityChallenge.config as
                    | Record<string, unknown>
                    | undefined,
                  stats: data.communityChallenge.stats as
                    | CommunityChallengeStats
                    | undefined,
                }
              : { enabled: false },
          fetchedAt:
            typeof data?.fetchedAt === "string" ? data.fetchedAt : null,
        });
        setUpdatedAt(data?.updatedAt ?? null);
        return;
      }

      // Fallback: endpoint เก่า — มีแค่ config (ไม่มี transport / promo / challenge รวม)
      const cfg = await axios.get<{
        config?: unknown;
        updatedAt?: string | null;
      }>(`${apiRoot}/app/config`, {
        timeout: 15000,
        validateStatus: (s) => s >= 200 && s < 600,
      });
      if (cfg.status === 200 && cfg.data) {
        const merged = mergeConfig(cfg.data.config as Partial<MobileAppConfig>);
        setConfig(merged);
        applyBootstrapComplianceVersions({ terms: null, privacy: null });
        setBootstrap({ ...DEFAULT_BOOTSTRAP, fetchedAt: null });
        setUpdatedAt(cfg.data.updatedAt ?? null);
      }
    } catch {
      setConfig((c) => c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [refresh]);

  /** โพลแค่ตัวเลขออนไลน์จาก public config — ให้แถบหน้าแรกขยับตามฐานข้อมูลโดยไม่ต้องสลับแอป */
  useEffect(() => {
    const tick = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      const apiRoot = getApiRoot();
      void axios
        .get<{ config?: { remote?: { homeDisplayedOnlineUsers?: unknown } } }>(
          `${apiRoot}/app/config`,
          {
            timeout: 12000,
            validateStatus: (s) => s >= 200 && s < 600,
          },
        )
        .then((r) => {
          if (r.status !== 200 || !r.data?.config?.remote) return;
          const ho = r.data.config.remote.homeDisplayedOnlineUsers;
          if (typeof ho !== "number" || !Number.isFinite(ho) || ho < 0) return;
          setConfig((prev) => {
            const nextRemote = { ...prev.remote };
            if (ho >= 1) {
              nextRemote.homeDisplayedOnlineUsers = Math.min(
                Math.floor(ho),
                99_999_999,
              );
            } else {
              delete nextRemote.homeDisplayedOnlineUsers;
            }
            return { ...prev, remote: nextRemote };
          });
        })
        .catch(() => {});
    };
    tick();
    const iv = setInterval(tick, DISPLAYED_ONLINE_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /** มีชีวิตในเซสชัน — ให้ผู้ใช้ที่ล็อกอินนับใน active users (ส่งคู่กับโพลด้านบน) */
  useEffect(() => {
    const ping = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      try {
        if (!localStorage.getItem("meerak_token")) return;
      } catch {
        return;
      }
      void api.post("/app/presence", {}).catch(() => {});
    };
    ping();
    const iv = setInterval(ping, SESSION_PRESENCE_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const value = useMemo(
    () => ({ config, bootstrap, loading, updatedAt, refresh }),
    [config, bootstrap, loading, updatedAt, refresh],
  );

  return (
    <MobileAppConfigContext.Provider value={value}>
      {children}
    </MobileAppConfigContext.Provider>
  );
};

export function useMobileAppConfig(): MobileAppConfigContextValue {
  const ctx = useContext(MobileAppConfigContext);
  if (!ctx) {
    throw new Error(
      "useMobileAppConfig must be used within MobileAppConfigProvider",
    );
  }
  return ctx;
}

/** ใช้เมื่อ context อาจไม่มี (เช่น unit test) — คืนค่า default */
export function useMobileAppConfigSafe(): MobileAppConfigContextValue {
  const ctx = useContext(MobileAppConfigContext);
  const noop = useCallback(async () => {}, []);
  if (!ctx) {
    return {
      config: DEFAULT_CONFIG,
      bootstrap: DEFAULT_BOOTSTRAP,
      loading: false,
      updatedAt: null,
      refresh: noop,
    };
  }
  return ctx;
}

export const DEFAULT_MOBILE_APP_CONFIG = DEFAULT_CONFIG;
