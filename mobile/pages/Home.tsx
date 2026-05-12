import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { MockApi } from "../services/mockApi";
import { Job, JobStatus } from "../types";
import {
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
  ShieldCheck,
  QrCode,
  PartyPopper,
  Sailboat,
  GraduationCap,
  Globe2,
  Lock,
} from "lucide-react";
import { CommunityChallengeCard } from "../components/CommunityChallengeCard";
import { HomeEsimFeaturedBanner } from "../components/HomeEsimFeaturedBanner";
import { GrandOpeningOverlay } from "../components/GrandOpeningOverlay";
import { BackendBannersSection } from "../components/BackendBannersSection";
import { getNotificationJobNavigatePath } from "../utils/notificationDeepLink";
import { useGrandOpeningCountdown } from "../../shared/useGrandOpeningCountdown";

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

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig, bootstrap } = useMobileAppConfig();
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("home_dismissed_admin_notif_ids");
      if (raw) return new Set(JSON.parse(raw));
    } catch (_) {}
    return new Set();
  });
  const [nearbyProviders, setNearbyProviders] = useState<Array<{ id: string; name: string; avatarUrl?: string; rating: number; distance: string }>>([]);

  const isPlatinum = (user?.vip_tier || "").toLowerCase() === "platinum";

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

  const loadAdminNotifications = React.useCallback(async (silent = false) => {
    if (!silent) {
      setNotifError(null);
      setNotifLoading(true);
    }
    try {
      // ส่ง userId เมื่อ login เพื่อให้ได้ทั้ง broadcast และ notification เฉพาะ user (เช่น มีคนรับงานแล้ว, ได้รับทิป)
      const list = await MockApi.getLatestAdminNotifications(5, user?.id);
      setAdminNotifications(list || []);
    } catch (e) {
      if (!silent) setNotifError("โหลดข้อความจากแอดมินไม่สำเร็จ");
    } finally {
      if (!silent) setNotifLoading(false);
    }
  }, [user?.id]);

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
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 120000,
            });
          });
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
        localStorage.setItem("home_dismissed_admin_notif_ids", JSON.stringify([...next]));
      } catch (_) {}
      return next;
    });
  };

  const latestAdminNotif = adminNotifications.find((n) => !dismissedNotifIds.has(n.id));

  const go = useGrandOpeningCountdown();

  const driverCard = { id: "Driver", category: "Driver", titleKey: "home.svc_driver_title", subtitleKey: "home.svc_driver_sub", icon: Car, className: "home-svc-card-driver" };
  const cleaningCard = { id: "Cleaning", category: "Cleaning", titleKey: "home.svc_cleaning_title", subtitleKey: "home.svc_cleaning_sub", icon: Sparkles, className: "home-svc-card-cleaning" };
  const technicalCard = { id: "Plumbing", category: "Plumbing", titleKey: "home.svc_technical_title", subtitleKey: "home.svc_technical_sub", icon: Wrench, className: "home-svc-card-technical" };
  const partyCard = { id: "Party_Guest", category: "Party_Guest", titleKey: "home.svc_party_title", subtitleKey: "home.svc_party_sub", descKey: "home.svc_party_desc", icon: PartyPopper, className: "home-svc-card-party" };
  const marineCard = { id: "Marine", category: "Marine", titleKey: "home.svc_marine_title", subtitleKey: "home.svc_marine_sub", icon: Sailboat, className: "home-svc-card-marine" };

  return (
    <div className="space-y-10 sm:space-y-12 pb-24 sm:pb-20 px-0">
      <GrandOpeningOverlay />
      {!go.isLive && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-center text-amber-100 text-sm">
          <span className="font-semibold">กำลังเปิดระบบ 24 เม.ย. 2569 เวลา 01:00 น. (เวลาไทย)</span>
          <span className="block text-amber-200/90 text-xs mt-1">
            สมัครและยืนยันตัวตน (KYC) ได้ก่อน — รับงาน/จองรถเมื่อถึงเวลาเปิดใช้งาน
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
      {(language === "en" ? mobileAppConfig.remote.promoNoticeEn : mobileAppConfig.remote.promoNoticeTh)
        ?.trim() ? (
        <div className="luxury-card px-4 py-3 border border-violet-500/30 bg-violet-950/25 text-violet-100 text-sm whitespace-pre-wrap">
          {language === "en"
            ? mobileAppConfig.remote.promoNoticeEn
            : mobileAppConfig.remote.promoNoticeTh}
          {bootstrap.promoFund?.visible && typeof bootstrap.promoFund.balance_thb === "number" ? (
            <p className="mt-2 text-xs text-violet-200/90">
              {language === "en" ? "Promo fund pool (approx.)" : "งบกองทุนโปร (โดยประมาณ)"}:{" "}
              <span className="font-semibold text-white">
                {Number(bootstrap.promoFund.balance_thb).toLocaleString()} ฿
              </span>
            </p>
          ) : null}
        </div>
      ) : bootstrap.promoFund?.visible && typeof bootstrap.promoFund.balance_thb === "number" ? (
        <div className="luxury-card px-4 py-3 border border-violet-500/30 bg-violet-950/25 text-violet-100 text-sm">
          <span className="text-violet-200/90">
            {language === "en" ? "Promo fund pool (approx.)" : "งบกองทุนโปร (โดยประมาณ)"}
          </span>
          <span className="ml-2 font-semibold text-white">
            {Number(bootstrap.promoFund.balance_thb).toLocaleString()} ฿
          </span>
        </div>
      ) : null}
      {!notifLoading && latestAdminNotif && (() => {
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
            <p className="home-admin-notif-title font-semibold text-slate-100">{latestAdminNotif.title}</p>
            <p className="home-admin-notif-message text-slate-300 text-sm mt-0.5 leading-relaxed">{latestAdminNotif.message}</p>
            <p className="home-admin-notif-time text-slate-400 text-xs mt-1">
              {latestAdminNotif.sentAt
                ? new Date(latestAdminNotif.sentAt).toLocaleString("th-TH")
                : ""}
            </p>
            {notificationPath ? (
              <p className="text-[11px] text-violet-300/90 mt-1.5">แตะเพื่อเปิดงานที่เกี่ยวข้อง</p>
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

      {/* Header */}
      <div className="home-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
        <div className="min-w-0">
          <h1 className="home-greeting text-2xl sm:text-3xl font-bold text-slate-50 truncate font-sans">
            {getTimeGreeting()}, {user?.name ? user.name.split(" ")[0] : "User"}!
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">
            Ready to find or provide services today?
          </p>
        </div>
        <Link
          to="/profile"
          className={
            isPlatinum
              ? "platinum-card-premium p-4 sm:p-5 rounded-[20px] flex items-center gap-3 shrink-0 platinum-glow hover:opacity-95 transition-opacity"
              : "luxury-card p-4 sm:p-5 rounded-[20px] flex items-center gap-3 shrink-0 hover:border-gold/20 transition-colors"
          }
        >
          <div className="w-10 h-10 rounded-2xl bg-charcoal-800 flex items-center justify-center border border-gold/20">
            <Wallet size={20} color="#D4AF37" />
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider font-wallet-title">
              {t("home.wallet")}
            </p>
            <p className="text-lg font-bold number-wallet number-wallet-gold">
              {user?.wallet_balance?.toLocaleString()} ฿
            </p>
          </div>
        </Link>
      </div>

      {/* Banners — ใช้เส้นทางเดียวกับ Welcome + z-50 กันโดนการ์ดหัวข้อทับ */}
      <div className="relative z-50 isolate">
        <BackendBannersSection
          variant="compact"
          placement="home"
          className="relative z-50"
          slideHeight={mobileAppConfig.remote.bannerCarousel?.defaultSlideHeight === "portrait" ? "portrait" : "hero"}
        />
      </div>

      <CommunityChallengeCard />

      {/* AQOND Academy — education (blue) + tutorial hub */}
      <Link
        to="/tutorial-hub"
        className="group rounded-[20px] p-5 flex items-center gap-4 border border-slate-200/90 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.08)] hover:border-blue-200/90 transition-colors"
      >
        <div className="w-14 h-14 rounded-2xl border border-blue-200/90 bg-gradient-to-br from-sky-50 to-blue-100/90 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <GraduationCap size={28} className="text-blue-700" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 tracking-tight">{t("academy_home.title")}</h3>
          <p className="text-slate-600 text-sm mt-0.5 leading-snug">{t("academy_home.subtitle")}</p>
        </div>
        <ArrowRight size={20} className="text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
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
            <Sparkles size={26} className="text-emerald-700" strokeWidth={2.25} />
            <Globe2 size={14} className="absolute bottom-1 right-1 text-teal-600" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-tight text-slate-900">{t("home.internet_packages_cta_title")}</h3>
            <p className="mt-0.5 text-sm leading-snug text-slate-600">{t("home.internet_packages_cta_sub")}</p>
          </div>
          <ArrowRight size={20} className="shrink-0 text-slate-400 transition-colors group-hover:text-emerald-600" />
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
            <p className="text-slate-400 text-sm mt-0.5">QR eSIM ที่ซื้อแล้ว · เปิดดูออฟไลน์ได้</p>
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
            <h3 className="font-semibold text-slate-900">{t("wallet_dashboard.title")}</h3>
            <p className="text-slate-600 text-sm mt-0.5 leading-snug">{t("wallet_dashboard.subtitle")}</p>
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
          <p className="text-slate-400 text-sm mt-0.5">เลื่อนดูคลิปแบบ TikTok คลิกจ้างงานเลย</p>
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
          <p className="text-slate-400 text-sm mt-0.5">เพื่อนได้งาน คุณได้ตังค์ — รับ 1.5% เมื่อเพื่อนทำงานครบ</p>
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
              notify("เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)", "info");
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
          <h3 className="font-bold text-base sm:text-lg text-slate-100">{t("home.find_service")}</h3>
          <p className="text-xs text-slate-500 mt-1">Browse 100+ Categories</p>
        </Link>
        <Link
          to="/talents"
          className="luxury-card home-quick-action-card p-5 sm:p-6 rounded-[20px] flex flex-col items-center text-center group hover:border-gold/20 transition-colors"
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-charcoal-800 rounded-2xl flex items-center justify-center mb-3 border border-gold/10 group-hover:border-gold/20 transition-colors">
            <Heart size={24} className="sm:w-7 sm:h-7" color="#D4AF37" />
          </div>
          <h3 className="font-bold text-base sm:text-lg text-slate-100">{t("home.find_talent")}</h3>
          <p className="text-xs text-slate-500 mt-1">Models, Students & More</p>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={go.isLive ? "/job-board" : "#"}
          onClick={(e) => {
            if (!go.isLive) {
              e.preventDefault();
              notify("เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)", "info");
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
                  notify("เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)", "info");
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

      {/* Trust & Safety Banner */}
      <div className="rounded-[20px] overflow-hidden shadow-lg shadow-emerald-900/20">
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-5 sm:p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
            <ShieldCheck size={26} className="text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-base sm:text-lg">AQOND Insurance & Stability Fund</h3>
            <p className="text-white/90 text-sm mt-0.5">Work with Peace of Mind. Every job is 100% secured by AQOND Protect.</p>
          </div>
        </div>
      </div>

      {/* Active Jobs — floating status bar style */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-50">{t("home.active_jobs")}</h2>
            <Link to="/my-jobs" className="text-sm view-all-gold font-bold hover:opacity-90 transition-opacity">
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
                      job.status === "WAITING_FOR_PAYMENT" ? "bg-amber-500/20 text-amber-300" : "bg-slate-600/50 text-slate-200"
                    }`}
                  >
                    {job.status.replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className="font-bold text-slate-100 truncate text-base">{job.title}</h3>
                <p className="text-sm font-mono number-gold mt-2 flex items-center">
                  <Briefcase size={14} className="mr-1.5" color="#D4AF37" /> {job.price} THB
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Featured Services — Solid gradients, NO transparent. Premium dashboard. */}
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-slate-50">{t("home.featured_services")}</h2>
        <div className="space-y-4">
          {/* Card 1 — คนขับรถ & แมสเซนเจอร์ (full width) */}
          <Link
            to={go.isLive ? "/transport" : "#"}
            onClick={(e) => {
              if (!go.isLive) {
                e.preventDefault();
                notify("เริ่มให้บริการ 24 เมษายน 2569 เวลา 01:00 น. (เวลาไทย)", "info");
              }
            }}
            className={`home-svc-link block rounded-2xl overflow-hidden shadow-lg active:scale-[0.98] transition-all duration-300 hover:scale-[1.01] ${!go.isLive ? "relative" : ""}`}
          >
            {!go.isLive && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-slate-950/78 backdrop-blur-[2px] gap-2 p-3">
                <Lock className="w-8 h-8 text-amber-300" strokeWidth={2} />
                <span className="text-[11px] text-center text-white font-semibold leading-snug px-2">
                  เริ่มให้บริการ 24 เม.ย. 2569 · 01:00 น.
                </span>
              </div>
            )}
            <div className={`home-svc-card-body ${driverCard.className} flex items-center justify-between min-w-0`}>
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="home-svc-title">{t(driverCard.titleKey)}</h3>
                <p className="home-svc-subtitle">{t(driverCard.subtitleKey)}</p>
                <p className="home-svc-cta">{t("home.svc_cta")} →</p>
              </div>
              <div className="home-svc-icon-wrap shrink-0">
                <Car size={36} strokeWidth={2.5} />
              </div>
            </div>
          </Link>
          {/* Cards 2 & 3 — ทำความสะอาด, ช่างเทคนิค (grid) */}
          <div className="grid grid-cols-2 gap-4">
            <Link to="/cleaning-specialist" className="home-svc-link block rounded-2xl overflow-hidden shadow-lg active:scale-[0.97] transition-all hover:scale-[1.02]" data-tour="cleaning-card">
              <div className={`home-svc-card-body ${cleaningCard.className} flex flex-col justify-between`}>
                <div>
                  <h3 className="home-svc-title">{t(cleaningCard.titleKey)}</h3>
                  <p className="home-svc-subtitle">{t(cleaningCard.subtitleKey)}</p>
                </div>
                <div className="flex items-center justify-between px-5 pb-5">
                  <span className="home-svc-cta">{t("home.svc_cta")} →</span>
                  <div className="home-svc-icon-wrap home-svc-icon-sm">
                    <Sparkles size={26} strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </Link>
            <Link to="/technical-specialist" className="home-svc-link block rounded-2xl overflow-hidden shadow-lg active:scale-[0.97] transition-all hover:scale-[1.02]">
              <div className={`home-svc-card-body ${technicalCard.className} flex flex-col justify-between`}>
                <div>
                  <h3 className="home-svc-title">{t(technicalCard.titleKey)}</h3>
                  <p className="home-svc-subtitle home-svc-subtitle-yellow">{t(technicalCard.subtitleKey)}</p>
                </div>
                <div className="flex items-center justify-between px-5 pb-5">
                  <span className="home-svc-cta" data-tour="technical-cta">{t("home.svc_cta")} →</span>
                  <div className="home-svc-icon-wrap home-svc-icon-sm home-svc-icon-yellow">
                    <Wrench size={26} strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </Link>
          </div>
          {/* Card 4 — เพื่อนเที่ยว / ปาร์ตี้ (full width) → Pre-Selection Vibe Picker */}
          <Link to="/party-vibe" className="home-svc-link block rounded-2xl overflow-hidden shadow-lg">
            <motion.div
              className={`home-svc-card-body ${partyCard.className} flex items-center justify-between min-w-0`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="home-svc-title">{t(partyCard.titleKey)}</h3>
                <p className="home-svc-subtitle">{t(partyCard.subtitleKey)}</p>
                <p className="home-svc-desc">{t(partyCard.descKey)}</p>
                <p className="home-svc-cta">{t("home.svc_cta")} →</p>
              </div>
              <div className="home-svc-icon-wrap shrink-0">
                <PartyPopper size={38} strokeWidth={2.5} />
              </div>
            </motion.div>
          </Link>
          {/* Card 5 — AQOND Marine (จ้างเรือ-จองเรือ) */}
          <Link to="/marine" className="home-svc-link block rounded-2xl overflow-hidden shadow-lg active:scale-[0.98] transition-all hover:scale-[1.01]">
            <div className={`home-svc-card-body ${marineCard.className} flex items-center justify-between min-w-0`}>
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="home-svc-title">{t(marineCard.titleKey)}</h3>
                <p className="home-svc-subtitle">{t(marineCard.subtitleKey)}</p>
                <p className="home-svc-cta">{t("home.svc_cta")} →</p>
              </div>
              <div className="home-svc-icon-wrap shrink-0">
                <Sailboat size={38} strokeWidth={2.5} />
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Nearby Professionals */}
      {nearbyProviders.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-50">{t("home.nearby_professionals")}</h2>
            <Link to="/talents" className="text-sm view-all-gold font-bold hover:opacity-90 transition-opacity">
              {t("home.view_all")}
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {nearbyProviders.map((p) => (
              <Link
                key={p.id}
                to={`/talents?provider=${p.id}`}
                className="flex-shrink-0 flex flex-col items-center gap-2 w-[88px] rounded-[20px] bg-white/5 backdrop-blur border border-white/10 hover:border-emerald-500/30 p-4 transition-all hover:scale-105 active:scale-95"
              >
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-700 ring-2 ring-white/10">
                  <img
                    src={p.avatarUrl || "https://i.pravatar.cc/150?u=unknown"}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://i.pravatar.cc/150?u=unknown";
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-200 truncate w-full text-center">{p.name}</span>
                <span className="text-amber-400 text-xs font-bold flex items-center gap-0.5">
                  ★ {p.rating.toFixed(1)}
                </span>
                <span className="text-slate-500 text-xs">{p.distance}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
