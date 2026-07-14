import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { MockApi } from "../services/mockApi";
import { Job, JobStatus, type UserProfile } from "../types";
import {
  BadgeCheck,
  Briefcase,
  Wallet,
  Search,
  ArrowRight,
  Heart,
  Sparkles,
  Users,
  Bell,
  X,
  Video,
  Play,
  Gift,
  UserPlus,
  Car,
  Wrench,
  Shield,
  ShieldCheck,
  QrCode,
  PartyPopper,
  Sailboat,
  GraduationCap,
  Globe2,
  LayoutGrid,
  Lock,
  ShoppingBag,
  UtensilsCrossed,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { CommunityChallengeCard } from "../components/CommunityChallengeCard";
import { HomeEsimFeaturedBanner } from "../components/HomeEsimFeaturedBanner";
import { GrandOpeningOverlay } from "../components/GrandOpeningOverlay";
import { BackendBannersSection } from "../components/BackendBannersSection";
import { StoryRingsRow } from "../components/StoryRingsRow";
import {
  getContinueLearningCourses,
  listMarketplaceCourses,
  type ContinueLearningCourse,
  type MarketplaceCourse,
} from "../services/courseMarketplaceService";
import { trackCourseFunnelBatch } from "../utils/courseFunnelAnalytics";
import { getNotificationJobNavigatePath } from "../utils/notificationDeepLink";
import { useVIPTheme } from "../context/VIPThemeContext";
import { useGrandOpeningCountdown } from "../../shared/useGrandOpeningCountdown";
import {
  playNotificationSound,
  unlockNotificationSound,
  isNotificationSoundMuted,
  setNotificationSoundMuted,
} from "../services/notificationSound";
import { navigateToMarketplace } from "../services/marketplaceHandoff";
import { ContextualHomeBanner } from "../components/growth/ContextualHomeBanner";
import { IntentDwellTracker } from "../components/growth/IntentDwellTracker";

export interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  target?: string;
  sentAt: string;
  source?: string;
  jobId?: string | null;
  notificationType?: string;
  data?: Record<string, unknown> | null;
}

function isIdentityVerified(u: UserProfile | null): boolean {
  if (!u) return false;
  const st = String(u.kyc_status ?? "")
    .toLowerCase()
    .trim();
  const lvl = String(u.kyc_level ?? "")
    .toLowerCase()
    .trim();
  if (st === "approved" || st === "verified") return true;
  if (lvl === "verified") return true;
  return false;
}

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { themeId } = useVIPTheme();
  const isStandardTheme = themeId === "standard";
  const { t, language } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig, bootstrap } = useMobileAppConfig();
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<
    AdminNotificationItem[]
  >([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(
    () => {
      try {
        const raw = localStorage.getItem("home_dismissed_admin_notif_ids");
        if (raw) return new Set(JSON.parse(raw));
      } catch (_) {}
      return new Set();
    },
  );
  const [nearbyProviders, setNearbyProviders] = useState<
    Array<{
      id: string;
      name: string;
      avatarUrl?: string;
      rating: number;
      distance: string;
    }>
  >([]);
  const [featuredCourses, setFeaturedCourses] = useState<MarketplaceCourse[]>(
    [],
  );
  const [continueCourses, setContinueCourses] = useState<ContinueLearningCourse[]>([]);
  const seenNotifIdsRef = useRef<Set<string> | null>(null);
  const [soundMuted, setSoundMuted] = useState(isNotificationSoundMuted);

  const isPlatinum = (user?.vip_tier || "").toLowerCase() === "platinum";
  const greetingFirstName = user?.name?.trim()
    ? user.name.split(/\s+/)[0]
    : t("home.guest_display");
  const identityVerified = user ? isIdentityVerified(user) : false;

  /** GET /api/app/config (และ bootstrap ที่ส่งครบ) ใส่แล้ว = max(floor แอดมิน, ผู้ใช้ active ~15 นาที) — ไม่ max ซ้ำกับ challenge */
  const displayedOnlineUsersCount = useMemo(() => {
    const n = mobileAppConfig.remote.homeDisplayedOnlineUsers;
    if (
      typeof n === "number" &&
      Number.isFinite(n) &&
      n >= 1 &&
      n <= 99_999_999
    ) {
      return Math.floor(n);
    }
    return null;
  }, [mobileAppConfig.remote.homeDisplayedOnlineUsers]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const allMyJobs = await MockApi.getYourJobs();
        const active = allMyJobs.filter(
          (j) =>
            j.status === JobStatus.ACCEPTED ||
            j.status === JobStatus.IN_PROGRESS ||
            j.status === JobStatus.WAITING_FOR_PAYMENT ||
            j.status === JobStatus.WAITING_FOR_APPROVAL,
        );
        setActiveJobs(active);
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    let alive = true;
    listMarketplaceCourses({ sort: "featured" })
      .then((courses) => {
        if (!alive) return;
        const slice = courses.slice(0, 6);
        setFeaturedCourses(slice);
        if (slice.length) {
          trackCourseFunnelBatch(
            slice.map((course) => ({
              courseId: course.id,
              eventType: "course_impression" as const,
              metadata: { placement: "home_featured_rail" },
            })),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setContinueCourses([]);
      return;
    }
    let alive = true;
    getContinueLearningCourses(4)
      .then((rows) => {
        if (alive) setContinueCourses(rows);
      })
      .catch(() => {
        if (alive) setContinueCourses([]);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const loadAdminNotifications = React.useCallback(
    async (silent = false) => {
      if (!silent) {
        setNotifError(null);
        setNotifLoading(true);
      }
      try {
        const list = await MockApi.getLatestAdminNotifications(5, user?.id);
        setAdminNotifications(list || []);
        if (list?.length) {
          const newIds = new Set(list.map((n: AdminNotificationItem) => n.id));
          const prev = seenNotifIdsRef.current;
          if (prev !== null) {
            const hasNew = list.some(
              (n: AdminNotificationItem) => !prev.has(n.id),
            );
            if (hasNew) void playNotificationSound();
          }
          seenNotifIdsRef.current = newIds;
        }
      } catch (e) {
        if (!silent) setNotifError("โหลดข้อความจากแอดมินไม่สำเร็จ");
      } finally {
        if (!silent) setNotifLoading(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    loadAdminNotifications();
  }, [loadAdminNotifications]);

  // โพล notifications ทุก 30 วินาที เมื่อ login — เพื่อให้เห็น "มีคนรับงานแล้ว" ทันที (silent = ไม่แสดง loading)
  useEffect(() => {
    if (!user?.id) return;
    const iv = setInterval(() => loadAdminNotifications(true), 30000);
    return () => clearInterval(iv);
  }, [loadAdminNotifications, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          const pos = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 120000,
              });
            },
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        /* fallback: mockApi uses non-GPS list */
      }
      try {
        const list = await MockApi.getNearbyProviders(8, {
          lat,
          lng,
          category: "all",
        });
        if (!cancelled) setNearbyProviders(list);
      } catch {
        if (!cancelled) setNearbyProviders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.welcome");
    if (hour < 18) return t("home.welcome_gen");
    return t("home.welcome_gen");
  };

  const dismissAdminNotif = (id: string) => {
    setDismissedNotifIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          "home_dismissed_admin_notif_ids",
          JSON.stringify([...next]),
        );
      } catch (_) {}
      return next;
    });
  };

  const latestAdminNotif = adminNotifications.find(
    (n) => !dismissedNotifIds.has(n.id),
  );

  const go = useGrandOpeningCountdown();
  const [homeSearchQuery, setHomeSearchQuery] = useState("");

  const submitHomeSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!go.isLive) {
      notify("เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)", "info");
      return;
    }
    const q = homeSearchQuery.trim();
    if (q) {
      navigate(`/jobs?search=${encodeURIComponent(q)}`);
    } else {
      navigate("/jobs");
    }
  };

  const driverCard = {
    id: "Driver",
    category: "Driver",
    titleKey: "home.svc_driver_title",
    subtitleKey: "home.svc_driver_sub",
    icon: Car,
    className: "home-svc-card-driver",
  };
  const cleaningCard = {
    id: "Cleaning",
    category: "Cleaning",
    titleKey: "home.svc_cleaning_title",
    subtitleKey: "home.svc_cleaning_sub",
    icon: Sparkles,
    className: "home-svc-card-cleaning",
  };
  const technicalCard = {
    id: "Plumbing",
    category: "Plumbing",
    titleKey: "home.svc_technical_title",
    subtitleKey: "home.svc_technical_sub",
    icon: Wrench,
    className: "home-svc-card-technical",
  };
  const quickSvcLabelClass = isStandardTheme
    ? "mt-auto line-clamp-2 px-0.5 text-[11px] sm:text-xs font-semibold leading-snug text-neutral-900"
    : "mt-auto line-clamp-2 px-0.5 text-[11px] sm:text-xs font-semibold leading-snug text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.45)]";

  const partyCard = {
    id: "Party_Guest",
    category: "Party_Guest",
    titleKey: "home.svc_party_title",
    subtitleKey: "home.svc_party_sub",
    descKey: "home.svc_party_desc",
    icon: PartyPopper,
    className: "home-svc-card-party",
  };
  const marineCard = {
    id: "Marine",
    category: "Marine",
    titleKey: "home.svc_marine_title",
    subtitleKey: "home.svc_marine_sub",
    icon: Sailboat,
    className: "home-svc-card-marine",
  };

  const walletHeroChip = (
    <Link
      to="/profile"
      aria-label={`${t("home.wallet")}${
        user?.wallet_balance != null
          ? ` ${Number(user.wallet_balance).toLocaleString()} ฿`
          : ""
      }`}
      className={
        isPlatinum
          ? "platinum-card-premium rounded-2xl flex items-center gap-2 shrink-0 px-2 py-2 platinum-glow hover:opacity-95 transition-opacity"
          : [
              "rounded-2xl flex items-center gap-2 shrink-0 px-2 py-2 sm:px-2.5 transition-colors border",
              isStandardTheme
                ? "border-emerald-200/90 bg-white shadow-sm hover:border-emerald-400/70 hover:bg-emerald-50/95"
                : "luxury-card border-white/10 hover:border-gold/20",
            ].join(" ")
      }
    >
      <div
        className={
          isStandardTheme && !isPlatinum
            ? "w-9 h-9 rounded-xl bg-emerald-50/90 flex items-center justify-center border border-emerald-200/90 shadow-inner"
            : "w-9 h-9 rounded-xl bg-charcoal-800 flex items-center justify-center border border-amber-500/35"
        }
      >
        <Wallet size={18} color="#D4AF37" />
      </div>
      <div className="hidden sm:flex flex-col text-right leading-tight min-w-[4.5rem]">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 font-wallet-title">
          {t("home.wallet")}
        </span>
        <span className="text-sm font-bold tabular-nums number-wallet number-wallet-gold">
          {user?.wallet_balance != null
            ? `${Number(user.wallet_balance).toLocaleString()} ฿`
            : "—"}
        </span>
      </div>
    </Link>
  );

  return (
    <div
      className="space-y-10 sm:space-y-12 pb-24 sm:pb-20 px-0"
      onClickCapture={unlockNotificationSound}
      onTouchStartCapture={unlockNotificationSound}
    >
      <GrandOpeningOverlay />
      {!go.isLive && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-center text-amber-100 text-sm">
          <span className="font-semibold">
            กำลังเปิดระบบ 24 เม.ย. 2569 เวลา 01:00 น. (เวลาไทย)
          </span>
          <span className="block text-amber-200/90 text-xs mt-1">
            สมัครและยืนยันตัวตน (KYC) ได้ก่อน —
            รับงาน/จองรถเมื่อถึงเวลาเปิดใช้งาน
          </span>
        </div>
      )}
      {/* Admin broadcast */}
      {notifLoading && (
        <div className="luxury-card px-4 py-3 text-slate-400 text-sm flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-slate-300 rounded-full animate-spin" />
          กำลังโหลดข้อความจากแอดมิน...
        </div>
      )}
      {!notifLoading && notifError && (
        <div className="luxury-card px-4 py-3 flex items-center justify-between gap-2 border-amber-500/30">
          <span className="text-amber-200 text-sm">{notifError}</span>
          <button
            type="button"
            onClick={loadAdminNotifications}
            className="text-gray-400 text-sm font-medium hover:underline"
          >
            โหลดอีกครั้ง
          </button>
        </div>
      )}
      {(language === "en"
        ? mobileAppConfig.remote.promoNoticeEn
        : mobileAppConfig.remote.promoNoticeTh
      )?.trim() ? (
        <div className="luxury-card px-4 py-3 border border-violet-500/30 bg-violet-950/25 text-violet-100 text-sm whitespace-pre-wrap">
          {language === "en"
            ? mobileAppConfig.remote.promoNoticeEn
            : mobileAppConfig.remote.promoNoticeTh}
          {bootstrap.promoFund?.visible &&
          typeof bootstrap.promoFund.balance_thb === "number" ? (
            <p className="mt-2 text-xs text-violet-200/90">
              {language === "en"
                ? "Promo fund pool (approx.)"
                : "งบกองทุนโปร (โดยประมาณ)"}
              :{" "}
              <span className="font-semibold text-white">
                {Number(bootstrap.promoFund.balance_thb).toLocaleString()} ฿
              </span>
            </p>
          ) : null}
        </div>
      ) : bootstrap.promoFund?.visible &&
        typeof bootstrap.promoFund.balance_thb === "number" ? (
        <div className="luxury-card px-4 py-3 border border-violet-500/30 bg-violet-950/25 text-violet-100 text-sm">
          <span className="text-violet-200/90">
            {language === "en"
              ? "Promo fund pool (approx.)"
              : "งบกองทุนโปร (โดยประมาณ)"}
          </span>
          <span className="ml-2 font-semibold text-white">
            {Number(bootstrap.promoFund.balance_thb).toLocaleString()} ฿
          </span>
        </div>
      ) : null}
      {!notifLoading &&
        latestAdminNotif &&
        (() => {
          const notificationPath = getNotificationJobNavigatePath({
            source: latestAdminNotif.source,
            jobId: latestAdminNotif.jobId ?? null,
            notificationType: latestAdminNotif.notificationType,
            data: latestAdminNotif.data ?? null,
          });
          return (
            <div
              role={notificationPath ? "button" : undefined}
              tabIndex={notificationPath ? 0 : undefined}
              onClick={() => {
                if (notificationPath) navigate(notificationPath);
              }}
              onKeyDown={(e) => {
                if (notificationPath && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  navigate(notificationPath);
                }
              }}
              className={
                "luxury-card home-admin-notif-card p-4 flex items-start gap-3 " +
                (notificationPath
                  ? "cursor-pointer hover:border-violet-500/35 transition-colors"
                  : "")
              }
            >
              <div className="home-admin-notif-bell bg-indigo-600 p-2.5 rounded-2xl shrink-0 shadow-md">
                <Bell size={22} className="text-white" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="home-admin-notif-title font-semibold text-slate-100">
                  {latestAdminNotif.title}
                </p>
                <p className="home-admin-notif-message text-slate-300 text-sm mt-0.5 leading-relaxed">
                  {latestAdminNotif.message}
                </p>
                <p className="home-admin-notif-time text-slate-400 text-xs mt-1">
                  {latestAdminNotif.sentAt
                    ? new Date(latestAdminNotif.sentAt).toLocaleString("th-TH")
                    : ""}
                </p>
                {notificationPath ? (
                  <p className="text-[11px] text-violet-300/90 mt-1.5">
                    แตะเพื่อเปิดงานที่เกี่ยวข้อง
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  dismissAdminNotif(latestAdminNotif.id);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-white/15 hover:text-white transition-colors shrink-0"
                aria-label="ปิด"
              >
                <X size={18} />
              </button>
            </div>
          );
        })()}

      <StoryRingsRow />

      {/* Hero greeting, wallet chip beside identity CTAs, search */}
      <div className="space-y-5">
        <div className="home-header flex flex-col gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h1 className="home-greeting text-2xl sm:text-3xl font-bold text-slate-50 font-sans leading-tight">
                <span className="block sm:inline text-inherit">
                  {getTimeGreeting()},{" "}
                </span>
                <span className="text-inherit">{greetingFirstName}</span>
                <span className="text-inherit" aria-hidden>
                  !
                </span>
              </h1>
              <button
                type="button"
                onClick={() => {
                  const next = !soundMuted;
                  setNotificationSoundMuted(next);
                  setSoundMuted(next);
                }}
                className={
                  "shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors relative z-10 shadow-sm " +
                  (soundMuted
                    ? "text-white border-slate-500 bg-slate-700 hover:bg-slate-600"
                    : "text-white border-emerald-500 bg-emerald-600 hover:bg-emerald-500")
                }
              >
                {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span>{soundMuted ? "เสียงปิด" : "เสียงเปิด"}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!user ? (
                <>
                  <Link
                    to="/register"
                    className={
                      isStandardTheme
                        ? "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-800/35 bg-amber-50 px-3 py-1 text-[11px] sm:text-xs font-semibold text-amber-950 shadow-sm transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] hover:border-amber-900/45 hover:bg-amber-100"
                        : "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-400/35 bg-gradient-to-r from-amber-500/25 via-emerald-500/15 to-emerald-600/25 px-3 py-1 text-[11px] sm:text-xs font-semibold text-amber-100 shadow-sm shadow-black/20 backdrop-blur-sm transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] hover:border-amber-300/55 hover:shadow-md"
                    }
                  >
                    <UserPlus
                      size={14}
                      className={
                        isStandardTheme
                          ? "shrink-0 text-amber-800 group-hover:text-amber-950"
                          : "shrink-0 text-amber-200 group-hover:text-white"
                      }
                      strokeWidth={2.4}
                    />
                    <span className="truncate">
                      {t("home.cta_signup_free")}
                    </span>
                  </Link>
                  {walletHeroChip}
                </>
              ) : !identityVerified ? (
                <>
                  <Link
                    to="/kyc"
                    className={
                      isStandardTheme
                        ? "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-800/35 bg-emerald-50 px-3 py-1 text-[11px] sm:text-xs font-semibold text-emerald-950 shadow-sm transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] hover:border-emerald-900/45 hover:bg-emerald-100"
                        : "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-400/35 bg-white/[0.08] px-3 py-1 text-[11px] sm:text-xs font-semibold text-emerald-50 shadow-sm shadow-emerald-950/25 backdrop-blur-sm transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] hover:border-amber-400/40 hover:shadow-md"
                    }
                  >
                    <ShieldCheck
                      size={14}
                      className={
                        isStandardTheme
                          ? "shrink-0 text-emerald-700 group-hover:text-emerald-900"
                          : "shrink-0 text-emerald-300 group-hover:text-amber-200"
                      }
                      strokeWidth={2.4}
                    />
                    <span className="truncate max-w-[min(52vw,14rem)] sm:max-w-[18rem]">
                      {t("home.cta_verify_premium")}
                    </span>
                  </Link>
                  {walletHeroChip}
                </>
              ) : (
                <>
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-sky-500 p-[1px] shadow-md shadow-teal-900/40 ring-2 ring-emerald-300/30"
                    role="img"
                    aria-label={t("home.verified_badge_aria")}
                  >
                    <span className="flex h-[calc(100%-2px)] w-[calc(100%-2px)] items-center justify-center rounded-full bg-slate-900/95">
                      <BadgeCheck
                        size={18}
                        className="text-emerald-300"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    </span>
                  </span>
                  {walletHeroChip}
                </>
              )}
            </div>

            {user && !identityVerified ? (
              <p
                role="status"
                className="text-[12px] sm:text-sm font-semibold leading-snug text-red-600 vip-home-kyc-warning"
              >
                {t("home.kyc_warning_prompt")}
              </p>
            ) : null}

            <p className="text-slate-400 text-sm leading-relaxed">
              {t("home.hero_subtitle")}
            </p>

            {displayedOnlineUsersCount != null ? (
              <div
                role="status"
                aria-live="polite"
                className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3 py-2 text-[12px] sm:text-sm font-medium leading-snug ${
                  isStandardTheme
                    ? "border-emerald-200/90 bg-emerald-50/95 text-emerald-900 shadow-sm"
                    : "border-emerald-500/35 bg-emerald-950/40 text-emerald-50 shadow-md shadow-black/25"
                }`}
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ${
                      isStandardTheme
                        ? "bg-emerald-500 ring-emerald-100"
                        : "bg-emerald-400 ring-emerald-900/50"
                    }`}
                  />
                </span>
                <Users
                  size={15}
                  strokeWidth={2.25}
                  className={
                    isStandardTheme
                      ? "shrink-0 text-emerald-700"
                      : "shrink-0 text-emerald-300"
                  }
                  aria-hidden
                />
                <span>
                  {t("home.online_now_banner").replace(
                    "{{count}}",
                    displayedOnlineUsersCount.toLocaleString(
                      language === "th" ? "th-TH" : "en-US",
                    ),
                  )}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={(e) => submitHomeSearch(e)} className="w-full">
          <div className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.065] backdrop-blur-xl px-2.5 py-2 pl-4 shadow-md shadow-black/25 transition-shadow duration-300 focus-within:border-emerald-400/35 focus-within:shadow-lg focus-within:shadow-emerald-950/30 focus-within:ring-2 focus-within:ring-amber-400/25">
            <Search
              className="shrink-0 text-emerald-300/95"
              size={18}
              strokeWidth={2.25}
              aria-hidden
            />
            <input
              type="search"
              enterKeyHint="search"
              value={homeSearchQuery}
              onChange={(e) => setHomeSearchQuery(e.target.value)}
              placeholder={t("home.search_placeholder")}
              className={`flex-1 min-w-0 bg-transparent text-[15px] sm:text-sm leading-snug outline-none py-1 ${isStandardTheme ? "text-neutral-900 placeholder:text-neutral-600" : "text-slate-100 placeholder:text-slate-400"}`}
              aria-label={t("home.search_placeholder")}
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500 px-5 py-2 text-xs font-bold text-white tracking-wide shadow-md shadow-emerald-900/35 ring-2 ring-white/15 transition-all duration-300 hover:brightness-105 hover:scale-[1.02] hover:shadow-lg active:scale-[0.97]"
            >
              {t("home.search_action")}
            </button>
          </div>
        </form>

        {user?.id ? (
          <ContextualHomeBanner className="mt-3" />
        ) : null}
      </div>

      {/* Quick services — compact grid (same destinations as banners) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-slate-50 flex items-center gap-2">
            <span className="text-amber-400" aria-hidden>
              ⚡
            </span>
            <span>{t("home.quick_services_section")}</span>
          </h2>
        </div>
        <IntentDwellTracker
          entityType="menu"
          entityId="quick_services"
          surface="mobile_home"
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          <Link
            to="/prb"
            data-tour="prb-quick"
            className="group relative flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-sky-300/50 bg-gradient-to-br from-sky-400/[0.28] via-blue-600/18 to-emerald-500/12 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-sky-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-sky-200/55"
          >
            <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm">
              ด่วน
            </span>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/92 text-blue-700 shadow-sm ring-2 ring-sky-200/80">
              <Shield size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>ต่อ พรบ. ด่วน</span>
          </Link>
          <Link
            to="/gold-lotto"
            className="group relative flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-amber-300/50 bg-gradient-to-br from-amber-400/[0.28] via-yellow-600/18 to-orange-500/12 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-amber-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-amber-200/55"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/92 text-amber-700 shadow-sm ring-2 ring-amber-200/80">
              <Trophy size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>ลุ้นทอง 1 บาท</span>
          </Link>
          <Link
            to={go.isLive ? "/transport" : "#"}
            onClick={(e) => {
              if (!go.isLive) {
                e.preventDefault();
                notify(
                  "เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)",
                  "info",
                );
              }
            }}
            className={`group relative flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-emerald-300/40 bg-gradient-to-br from-emerald-400/[0.22] via-emerald-700/15 to-transparent px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-emerald-900/20 active:scale-[0.97] sm:hover:scale-105 hover:border-emerald-200/50 ${!go.isLive ? "overflow-hidden" : ""}`}
          >
            {!go.isLive && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-slate-950/82 backdrop-blur-[2px] p-2">
                <Lock className="w-7 h-7 text-amber-300 mb-1" />
                <span className="text-[9px] text-white font-semibold leading-tight">
                  24 เม.ย. 69 · 01:00
                </span>
              </div>
            )}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-emerald-700 shadow-sm shadow-emerald-900/20 ring-1 ring-white/70">
              <Car size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>{t(driverCard.titleKey)}</span>
          </Link>
          <Link
            to="/cleaning-specialist"
            data-tour="cleaning-card"
            className="group flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-teal-200/35 bg-gradient-to-br from-teal-300/[0.2] via-cyan-500/12 to-white/[0.04] px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-teal-900/20 active:scale-[0.97] sm:hover:scale-105 hover:border-teal-100/35"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-teal-600 shadow-sm ring-1 ring-white/60">
              <Sparkles size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>
              {t(cleaningCard.titleKey)}
            </span>
          </Link>
          <Link
            to="/technical-specialist"
            data-tour="technical-cta"
            className="group flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-amber-300/40 bg-gradient-to-br from-amber-400/[0.18] via-lime-500/12 to-emerald-500/15 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-amber-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-amber-200/55"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-amber-700 shadow-sm ring-1 ring-amber-200/70">
              <Wrench size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>
              {t(technicalCard.titleKey)}
            </span>
          </Link>
          <Link
            to="/party-vibe"
            className="group flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-violet-300/38 bg-gradient-to-br from-violet-400/[0.2] via-fuchsia-500/12 to-white/[0.04] px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-violet-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-violet-100/45"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-violet-600 shadow-sm ring-1 ring-violet-200/65">
              <PartyPopper size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>{t(partyCard.titleKey)}</span>
          </Link>
          <Link
            to="/marine"
            className="group flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-sky-300/40 bg-gradient-to-br from-sky-400/[0.2] via-cyan-400/14 to-teal-500/10 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-sky-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-sky-100/40"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-sky-600 shadow-sm ring-1 ring-sky-200/70">
              <Sailboat size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>{t(marineCard.titleKey)}</span>
          </Link>
          <Link
            to="/courses"
            data-tour="courses-quick"
            className="group flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-emerald-300/45 bg-gradient-to-br from-emerald-400/[0.24] via-teal-500/14 to-emerald-900/10 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-emerald-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-emerald-200/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/92 text-emerald-700 shadow-sm ring-2 ring-emerald-200/80">
              <GraduationCap size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>AQOND Courses</span>
          </Link>
          <button
            type="button"
            data-tour="food-quick"
            onClick={() => navigateToMarketplace(navigate, "food")}
            className="group flex min-h-[118px] w-full flex-col items-center justify-between rounded-3xl border border-rose-300/45 bg-gradient-to-br from-rose-400/[0.22] via-orange-500/14 to-amber-900/10 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-rose-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-rose-200/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/92 text-rose-700 shadow-sm ring-2 ring-rose-200/80">
              <UtensilsCrossed size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>สั่งอาหาร</span>
          </button>
          <button
            type="button"
            data-tour="marketplace-quick"
            onClick={() => navigateToMarketplace(navigate, "home")}
            className="group flex min-h-[118px] w-full flex-col items-center justify-between rounded-3xl border border-orange-300/45 bg-gradient-to-br from-orange-400/[0.24] via-amber-500/14 to-orange-900/10 px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-orange-900/25 active:scale-[0.97] sm:hover:scale-105 hover:border-orange-200/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/92 text-orange-700 shadow-sm ring-2 ring-orange-200/80">
              <ShoppingBag size={22} strokeWidth={2.4} />
            </div>
            <span className={quickSvcLabelClass}>ช้อป Marketplace</span>
          </button>
          <Link
            to={go.isLive ? "/jobs" : "#"}
            onClick={(e) => {
              if (!go.isLive) {
                e.preventDefault();
                notify(
                  "เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)",
                  "info",
                );
              }
            }}
            className="group flex min-h-[118px] flex-col items-center justify-between rounded-3xl border border-emerald-200/30 bg-gradient-to-br from-white/[0.12] via-emerald-100/[0.08] to-amber-200/[0.08] px-2 pt-3.5 pb-3 text-center shadow-sm shadow-black/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-amber-200/45 active:scale-[0.97] sm:hover:scale-105"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200/90 to-emerald-200/95 text-emerald-800 shadow-sm ring-2 ring-white/55">
              <LayoutGrid size={22} strokeWidth={2.2} />
            </div>
            <span className={quickSvcLabelClass}>
              {t("home.categories_view_all")}
            </span>
          </Link>
        </IntentDwellTracker>
      </div>

      {/* Nearby — social proof, directly under services */}
      {nearbyProviders.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-50">
              {t("home.nearby_professionals")}
            </h2>
            <Link
              to="/talents"
              className="text-sm view-all-gold font-bold hover:opacity-90 transition-opacity shrink-0"
            >
              {t("home.view_all")}
            </Link>
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-2 px-0.5 no-scrollbar">
            {nearbyProviders.map((p) => (
              <IntentDwellTracker
                key={p.id}
                entityType="talent"
                entityId={p.id}
                surface="mobile_home"
                className="flex-shrink-0"
              >
              <Link
                to={`/talents?provider=${p.id}`}
                className="flex-shrink-0 flex w-[min(7.85rem,calc((100vw-3rem)/2.5))] min-w-[6.95rem] max-w-[7.95rem] flex-col items-stretch gap-3 rounded-3xl border border-emerald-200/28 bg-white/[0.065] backdrop-blur-sm p-3.5 pb-4 shadow-sm shadow-black/30 transition-all duration-300 hover:scale-[1.04] hover:border-emerald-200/48 hover:shadow-lg hover:shadow-black/35 active:scale-[0.98] sm:hover:scale-105"
              >
                <div className="mx-auto aspect-square w-[3.85rem] rounded-3xl overflow-hidden bg-slate-700/85 ring-[3px] ring-emerald-400/35 shadow-inner shadow-black/20">
                  <img
                    src={p.avatarUrl || "https://i.pravatar.cc/150?u=unknown"}
                    alt={p.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://i.pravatar.cc/150?u=unknown";
                    }}
                  />
                </div>
                <div className="flex flex-1 flex-col items-center gap-2 text-center px-1 min-h-[4.75rem]">
                  <span className="w-full truncate text-[13px] font-semibold leading-tight tracking-tight text-slate-100">
                    {p.name}
                  </span>
                  <div className="flex items-center justify-center gap-1 text-amber-300 text-xs font-bold">
                    <span className="text-[13px] leading-none text-amber-400">
                      ★
                    </span>
                    <span>{p.rating.toFixed(1)}</span>
                  </div>
                  <span className="mt-auto inline-flex items-center rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-medium text-slate-300/95 ring-1 ring-white/[0.08]">
                    {p.distance}
                  </span>
                </div>
              </Link>
              </IntentDwellTracker>
            ))}
          </div>
        </div>
      )}

      {/* Promotional / dynamic banners — after nearby */}
      <div className="relative z-40 isolate pt-2">
        <BackendBannersSection
          variant="compact"
          placement="home"
          className="relative z-40"
          slideHeight={
            mobileAppConfig.remote.bannerCarousel?.defaultSlideHeight ===
            "portrait"
              ? "portrait"
              : "hero"
          }
        />
      </div>

      {continueCourses.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
                Continue Learning
              </p>
              <h2 className="text-xl font-bold text-slate-900">เรียนต่อจากที่ค้างไว้</h2>
            </div>
            <Link to="/courses?tab=mine" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
              คอร์สของฉัน <ArrowRight size={16} />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
            {continueCourses.map((row) => (
              <Link
                key={row.courseId}
                to={row.lastLessonId ? `/courses/${row.courseId}/learn` : `/courses/${row.courseId}`}
                className="snap-start min-w-[78%] sm:min-w-[18rem] rounded-[22px] border border-indigo-100 bg-white p-4 shadow-sm"
              >
                <p className="text-xs text-indigo-600 font-semibold">{Math.round(row.progressPct)}% เรียนแล้ว</p>
                <h3 className="font-bold text-slate-900 line-clamp-2 mt-1">{row.title}</h3>
                <p className="text-sm text-slate-500 line-clamp-1 mt-1">{row.subtitle || row.instructorName}</p>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, row.progressPct)}%` }} />
                </div>
                {row.learningStreakDays ? (
                  <p className="text-xs text-amber-600 mt-2">🔥 streak {row.learningStreakDays} วัน</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      )}

      {featuredCourses.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500">
                Learn & Earn
              </p>
              <h2 className="text-xl font-bold text-slate-900">
                คอร์สแนะนำสำหรับคนทำงานบริการ
              </h2>
            </div>
            <Link
              to="/courses"
              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"
            >
              ดูทั้งหมด <ArrowRight size={16} />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
            {featuredCourses.map((course) => (
              <IntentDwellTracker
                key={course.id}
                entityType="course"
                entityId={course.id}
                surface="mobile_home"
                className="snap-start min-w-[78%] sm:min-w-[20rem]"
              >
              <Link
                to={`/courses/${course.id}`}
                className="block rounded-[22px] overflow-hidden bg-white border border-emerald-100 shadow-[0_8px_28px_rgba(15,23,42,0.08)] h-full"
              >
                <div className="h-32 bg-emerald-50 overflow-hidden">
                  {course.imageUrl ? (
                    <img
                      src={course.imageUrl}
                      alt={course.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full grid place-items-center">
                      <GraduationCap size={34} className="text-emerald-500" />
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 font-semibold">
                      {course.category || "course"}
                    </span>
                    <span className="text-amber-600 font-bold">
                      ★ {Number(course.ratingAvg || 0).toFixed(1)}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 line-clamp-2">
                    {course.title}
                  </h3>
                  <p className="text-sm text-slate-500 line-clamp-2">
                    {course.subtitle || course.description}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-black text-emerald-700">
                      ฿{Number(course.priceThb || 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500">
                      {course.totalEnrolled || 0} ผู้เรียน
                    </span>
                  </div>
                </div>
              </Link>
              </IntentDwellTracker>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-[22px] border border-emerald-100 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <GraduationCap size={24} className="text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500">
                Learn & Earn
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                เริ่มเรียนทักษะบริการบน AQOND
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                ซื้อด้วย Wallet 1-tap · มีบทเรียน preview ฟรี
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm"
            >
              สำรวจตลาดคอร์ส <ArrowRight size={16} />
            </Link>
            <Link
              to="/courses/aqond-marketplace-free-preview"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 text-emerald-800 font-semibold text-sm"
            >
              ลองคอร์สฟรี
            </Link>
          </div>
        </section>
      )}

      <CommunityChallengeCard />

      {/* AQOND Courses — marketplace discovery */}
      <Link
        to="/courses"
        className="group rounded-[20px] p-5 flex items-center gap-4 border border-emerald-200/90 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.08)] hover:border-emerald-300/90 transition-colors"
      >
        <div className="w-14 h-14 rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-teal-100/90 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <GraduationCap size={28} className="text-emerald-700" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 tracking-tight">
            AQOND Courses
          </h3>
          <p className="text-slate-600 text-sm mt-0.5 leading-snug">
            เรียนทักษะบริการ · ซื้อด้วย Wallet · มี preview ฟรี
          </p>
        </div>
        <ArrowRight
          size={20}
          className="text-slate-400 group-hover:text-emerald-600 shrink-0 transition-colors"
        />
      </Link>

      <Link
        to="/tutorial-hub"
        className="group rounded-[20px] p-5 flex items-center gap-4 border border-slate-200/90 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.08)] hover:border-blue-200/90 transition-colors"
      >
        <div className="w-14 h-14 rounded-2xl border border-blue-200/90 bg-gradient-to-br from-sky-50 to-blue-100/90 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <GraduationCap size={28} className="text-blue-700" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 tracking-tight">
            {t("academy_home.title")}
          </h3>
          <p className="text-slate-600 text-sm mt-0.5 leading-snug">
            {t("academy_home.subtitle")}
          </p>
        </div>
        <ArrowRight
          size={20}
          className="text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors"
        />
      </Link>

      <div className="space-y-3">
        <Link
          to="/internet-packages"
          className="group flex items-center gap-4 rounded-[20px] border border-slate-200/90 bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,0.08)] transition-colors hover:border-emerald-200/90"
        >
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
            aria-hidden
          >
            <Sparkles
              size={26}
              className="text-emerald-700"
              strokeWidth={2.25}
            />
            <Globe2
              size={14}
              className="absolute bottom-1 right-1 text-teal-600"
              strokeWidth={2.5}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-tight text-slate-900">
              {t("home.internet_packages_cta_title")}
            </h3>
            <p className="mt-0.5 text-sm leading-snug text-slate-600">
              {t("home.internet_packages_cta_sub")}
            </p>
          </div>
          <ArrowRight
            size={20}
            className="shrink-0 text-slate-400 transition-colors group-hover:text-emerald-600"
          />
        </Link>

        <HomeEsimFeaturedBanner />

        <Link
          to="/digital-vault"
          className="luxury-card rounded-[20px] p-5 flex items-center gap-4 hover:border-emerald-500/35 transition-colors border border-emerald-900/20 bg-gradient-to-br from-emerald-950/20 to-transparent"
        >
          <div
            className="relative w-14 h-14 rounded-2xl shrink-0 overflow-hidden border border-emerald-400/35 bg-gradient-to-br from-emerald-500/85 via-emerald-700/95 to-emerald-950 shadow-[inset_0_1px_0_rgba(167,243,208,0.35),0_6px_18px_rgba(6,78,59,0.55)] flex items-center justify-center"
            aria-hidden
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-emerald-900/10 to-emerald-300/20" />
            <div className="pointer-events-none absolute -right-6 -top-6 h-14 w-14 rounded-full bg-emerald-400/25 blur-md" />
            <ShieldCheck
              size={26}
              className="relative z-[1] text-emerald-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
              strokeWidth={2.25}
            />
            <QrCode
              size={14}
              className="absolute bottom-1 right-1 z-[1] text-emerald-200/95"
              strokeWidth={2.5}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-100">Digital Vault</h3>
            <p className="text-slate-400 text-sm mt-0.5">
              QR eSIM ที่ซื้อแล้ว · เปิดดูออฟไลน์ได้
            </p>
          </div>
          <ArrowRight size={20} className="text-emerald-400/80 shrink-0" />
        </Link>

        <Link
          to="/dashboard/wallet"
          className="group rounded-[20px] p-5 flex items-center gap-4 border border-slate-200/90 bg-gradient-to-br from-white via-indigo-50/40 to-white shadow-[0_4px_24px_rgba(15,23,42,0.08)] hover:border-indigo-300/85 transition-colors"
        >
          <div
            className="relative w-14 h-14 rounded-2xl shrink-0 overflow-hidden border border-indigo-400/45 bg-gradient-to-br from-indigo-600/95 via-indigo-800/95 to-slate-950 shadow-[inset_0_1px_0_rgba(199,210,254,0.38),0_6px_18px_rgba(30,27,75,0.52)] flex items-center justify-center"
            aria-hidden
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/38 via-indigo-900/15 to-sky-200/18" />
            <div className="pointer-events-none absolute -right-5 -top-5 h-12 w-12 rounded-full bg-indigo-400/28 blur-md" />
            <Wallet
              size={26}
              className="relative z-[1] text-indigo-50 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
              strokeWidth={2.35}
            />
            <Sparkles
              size={15}
              className="absolute top-1.5 right-1 z-[1] text-sky-200/95"
              strokeWidth={2.5}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">
              {t("wallet_dashboard.title")}
            </h3>
            <p className="text-slate-600 text-sm mt-0.5 leading-snug">
              {t("wallet_dashboard.subtitle")}
            </p>
          </div>
          <ArrowRight
            size={20}
            className="text-indigo-600/90 group-hover:text-indigo-800 shrink-0 transition-colors"
          />
        </Link>
      </div>

      {/* Video Feed CTA — fuchsia/rose (distinct from Digital Vault emerald) */}
      <Link
        to="/video-feed"
        className="luxury-card rounded-[20px] p-5 flex items-center gap-4 border border-fuchsia-950/25 bg-gradient-to-br from-fuchsia-950/18 to-transparent hover:border-fuchsia-500/40 transition-colors"
      >
        <div
          className="relative w-14 h-14 rounded-2xl shrink-0 overflow-hidden border border-fuchsia-400/45 bg-gradient-to-br from-fuchsia-500/90 via-rose-700/95 to-violet-950 shadow-[inset_0_1px_0_rgba(250,232,255,0.35),0_6px_18px_rgba(91,33,182,0.5)] flex items-center justify-center"
          aria-hidden
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-fuchsia-900/12 to-fuchsia-200/18" />
          <div className="pointer-events-none absolute -right-6 -top-6 h-14 w-14 rounded-full bg-fuchsia-400/30 blur-md" />
          <Video
            size={26}
            className="relative z-[1] text-fuchsia-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
            strokeWidth={2.25}
          />
          <Play
            size={13}
            className="absolute bottom-1.5 right-1.5 z-[1] text-violet-950 fill-rose-200"
            strokeWidth={1.5}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100">ดูคลิปผลงาน Talent</h3>
          <p className="text-slate-400 text-sm mt-0.5">
            เลื่อนดูคลิปแบบ TikTok คลิกจ้างงานเลย
          </p>
        </div>
        <ArrowRight size={20} className="text-fuchsia-400/85 shrink-0" />
      </Link>

      {/* Referral CTA — เพื่อนได้งาน คุณได้ตังค์ */}
      <Link
        to="/referral"
        className="luxury-card rounded-[20px] p-5 flex items-center gap-4 border border-amber-900/25 bg-gradient-to-br from-amber-950/22 to-transparent hover:border-amber-500/40 transition-colors"
      >
        <div
          className="relative w-14 h-14 rounded-2xl shrink-0 overflow-hidden border border-amber-400/45 bg-gradient-to-br from-amber-500/90 via-orange-700/95 to-amber-950 shadow-[inset_0_1px_0_rgba(253,230,138,0.38),0_6px_18px_rgba(120,53,15,0.52)] flex items-center justify-center"
          aria-hidden
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/38 via-amber-900/12 to-amber-200/18" />
          <div className="pointer-events-none absolute -right-5 -top-5 h-12 w-12 rounded-full bg-amber-300/28 blur-md" />
          <Gift
            size={26}
            className="relative z-[1] text-amber-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
            strokeWidth={2.25}
          />
          <UserPlus
            size={14}
            className="absolute bottom-1 right-1 z-[1] text-amber-100/95"
            strokeWidth={2.5}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100">แนะนำเพื่อน</h3>
          <p className="text-slate-400 text-sm mt-0.5">
            เพื่อนได้งาน คุณได้ตังค์ — รับ 1.5% เมื่อเพื่อนทำงานครบ
          </p>
        </div>
        <ArrowRight size={20} className="text-amber-400/85 shrink-0" />
      </Link>

      {/* Quick Actions — Find Service / Find Talent (Platinum: สไตล์ glassmorphism ใส่ใน .vip-theme-platinum .home-quick-action-card เท่านั้น) */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <Link
          to={go.isLive ? "/jobs" : "#"}
          onClick={(e) => {
            if (!go.isLive) {
              e.preventDefault();
              notify(
                "เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)",
                "info",
              );
            }
          }}
          className={`luxury-card home-quick-action-card p-5 sm:p-6 rounded-[20px] flex flex-col items-center text-center group hover:border-gold/20 transition-colors ${!go.isLive ? "relative" : ""}`}
          data-tour="match-button"
        >
          {!go.isLive && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[20px] bg-slate-950/75 gap-1.5 p-2">
              <Lock className="w-7 h-7 text-amber-300" />
              <span className="text-[10px] text-white text-center font-medium leading-tight px-1">
                เริ่มให้บริการ 24 เม.ย. 2569 · 01:00 น.
              </span>
            </div>
          )}
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-charcoal-800 rounded-2xl flex items-center justify-center mb-3 border border-gold/10 group-hover:border-gold/20 transition-colors">
            <Search size={24} className="sm:w-7 sm:h-7" color="#D4AF37" />
          </div>
          <h3 className="font-bold text-base sm:text-lg text-slate-100">
            {t("home.find_service")}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Browse 100+ Categories</p>
        </Link>
        <Link
          to="/talents"
          className="luxury-card home-quick-action-card p-5 sm:p-6 rounded-[20px] flex flex-col items-center text-center group hover:border-gold/20 transition-colors"
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-charcoal-800 rounded-2xl flex items-center justify-center mb-3 border border-gold/10 group-hover:border-gold/20 transition-colors">
            <Heart size={24} className="sm:w-7 sm:h-7" color="#D4AF37" />
          </div>
          <h3 className="font-bold text-base sm:text-lg text-slate-100">
            {t("home.find_talent")}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Models, Students & More</p>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={go.isLive ? "/job-board" : "#"}
          onClick={(e) => {
            if (!go.isLive) {
              e.preventDefault();
              notify(
                "เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)",
                "info",
              );
            }
          }}
          className={`inline-flex items-center px-5 py-2.5 bg-green-400/70 text-white-200 rounded-2xl hover:bg-slate-600/50 transition-colors border border-gold-transparent ${!go.isLive ? "relative opacity-90" : ""}`}
        >
          {!go.isLive && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 border border-amber-400/50">
              <Lock className="w-3 h-3 text-amber-300" />
            </span>
          )}
          <Briefcase className="mr-2 h-4 w-4" />
          Job Board
        </Link>
        {user?.role === "provider" ? (
          <>
            <Link
              to={go.isLive ? "/job-board?tab=my-applications" : "#"}
              onClick={(e) => {
                if (!go.isLive) {
                  e.preventDefault();
                  notify(
                    "เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)",
                    "info",
                  );
                }
              }}
              className={`inline-flex items-center px-5 py-2.5 bg-emerald-500/70 text-white rounded-2xl hover:bg-emerald-600/70 transition-colors border border-emerald-400/30 ${!go.isLive ? "relative opacity-90" : ""}`}
            >
              {!go.isLive && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 border border-amber-400/50">
                  <Lock className="w-3 h-3 text-amber-300" />
                </span>
              )}
              <Briefcase className="mr-2 h-4 w-4" />
              {t("job_board.my_applications")}
            </Link>
            <Link
              to="/provider/dashboard"
              className="inline-flex items-center px-5 py-2.5 bg-green-400/70 text-white-200 rounded-2xl hover:bg-slate-600/50 transition-colors border border-gold-transparent"
            >
              <Briefcase className="mr-2 h-4 w-4" />
              แดชบอร์ดผู้รับงาน
            </Link>
          </>
        ) : (
          <Link
            to="/employer/dashboard"
            className="inline-flex items-center px-5 py-2.5 bg-green-400/70 text-white-200 rounded-2xl hover:bg-slate-600/50 transition-colors border border-gold-transparent"
          >
            <Users className="mr-2 h-4 w-4" />
            แดชบอร์ดนายจ้าง
          </Link>
        )}
      </div>

      {/* Active Jobs — floating status bar style */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-50">
              {t("home.active_jobs")}
            </h2>
            <Link
              to="/my-jobs"
              className="text-sm view-all-gold font-bold hover:opacity-90 transition-opacity"
            >
              {t("home.view_all")}
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {activeJobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="min-w-[260px] flex-shrink-0 rounded-[20px] bg-white/5 backdrop-blur border border-white/10 hover:border-emerald-500/30 shadow-lg shadow-black/10 p-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-xl font-medium truncate">
                    {job.category}
                  </span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-xl shrink-0 ${
                      job.status === "WAITING_FOR_PAYMENT"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-slate-600/50 text-slate-200"
                    }`}
                  >
                    {job.status.replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className="font-bold text-slate-100 truncate text-base">
                  {job.title}
                </h3>
                <p className="text-sm font-mono number-gold mt-2 flex items-center">
                  <Briefcase size={14} className="mr-1.5" color="#D4AF37" />{" "}
                  {job.price} THB
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trust & safety — footer confidence */}
      <div className="rounded-[20px] overflow-hidden shadow-lg shadow-emerald-900/25 border border-emerald-400/25">
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-5 sm:p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 ring-1 ring-white/30">
            <ShieldCheck size={26} className="text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-base sm:text-lg tracking-tight">
              AQOND Insurance & Stability Fund
            </h3>
            <p className="text-white/90 text-sm mt-1 leading-snug">
              {language === "en"
                ? "Jobs completed with AQOND escrow & protection — work with confidence."
                : "งานเสร็จปลอดภัย มั่นใจได้ด้วยระบบ AQOND และกองทุนคุ้มครอง"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
