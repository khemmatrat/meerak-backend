import React, { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DoorOpen,
  Globe,
  Sparkles,
  Shield,
  Video,
  ShoppingBag,
  Wrench,
  Briefcase,
  GraduationCap,
  Store,
  MessageSquare,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { useNotification } from "../context/NotificationContext";
import { GrandOpeningOverlay } from "../components/GrandOpeningOverlay";
import { BackendBannersSection } from "../components/BackendBannersSection";
import { BackendBannersErrorBoundary } from "../components/BackendBannersErrorBoundary";
import { LineConnectConsent } from "../components/LineConnectConsent";

type ExploreTile = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  publicPath?: string;
  requiresAuthPath: string;
  tint: string;
};

function buildExploreTiles(): ExploreTile[] {
  return [
    {
      id: "market",
      title: "Marketplace",
      subtitle: "ช้อปสินค้า",
      icon: <ShoppingBag size={22} />,
      requiresAuthPath: "/",
      tint: "bg-pink-50 text-pink-700 border-pink-100",
    },
    {
      id: "services",
      title: "Local Services",
      subtitle: "จ้างงานใกล้บ้าน",
      icon: <Wrench size={22} />,
      requiresAuthPath: "/",
      tint: "bg-emerald-50 text-emerald-800 border-emerald-100",
    },
    {
      id: "jobs",
      title: "Jobs Matcher",
      subtitle: "หางาน / จ้างงาน",
      icon: <Briefcase size={22} />,
      requiresAuthPath: "/jobs",
      tint: "bg-sky-50 text-sky-800 border-sky-100",
    },
    {
      id: "courses",
      title: "Academy",
      subtitle: "คอร์สออนไลน์",
      icon: <GraduationCap size={22} />,
      requiresAuthPath: "/",
      tint: "bg-amber-50 text-amber-900 border-amber-100",
    },
    {
      id: "open_shop",
      title: "Open Shop",
      subtitle: "เปิดร้านค้า",
      icon: <Store size={22} />,
      requiresAuthPath: "/",
      tint: "bg-violet-50 text-violet-800 border-violet-100",
    },
    {
      id: "video_feed",
      title: "Hiring Reels",
      subtitle: "คลิปผลงาน Talent",
      icon: <Video size={22} />,
      publicPath: "/video-feed",
      requiresAuthPath: "/video-feed",
      tint: "bg-slate-50 text-slate-800 border-slate-200",
    },
  ];
}

/**
 * Super-app welcome (ported UX from aqond-ui-chat) — browse first, auth via existing Login/Register.
 * CTAs stay above the fold; banners are secondary so the screen never looks "empty".
 */
export const AqondSuperWelcome: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const { config } = useMobileAppConfig();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const signupsEnabled = config.featureFlags.enableSignups;
  const tiles = buildExploreTiles();
  const [lineConsentOpen, setLineConsentOpen] = useState(false);

  const openLineConnect = useCallback(() => {
    if (isAuthenticated && user?.id) {
      setLineConsentOpen(true);
      return;
    }
    notify("เข้าสู่ระบบก่อน แล้วเชื่อม LINE เพื่อรับความช่วยเหลือตอนสมัครได้ครับ", "info");
    navigate("/login", { state: { from: "/" } });
  }, [isAuthenticated, user?.id, navigate, notify]);

  const goEnterApp = useCallback(() => {
    if (isAuthenticated) {
      navigate("/");
      return;
    }
    navigate("/login", { state: { from: "/" } });
  }, [isAuthenticated, navigate]);

  const openExplore = useCallback(
    (tile: ExploreTile) => {
      if (tile.publicPath) {
        navigate(tile.publicPath);
        return;
      }
      if (isAuthenticated) {
        navigate(tile.requiresAuthPath);
        return;
      }
      notify("เข้าสู่ระบบเพื่อใช้งานหมวดนี้ต่อได้เลยค่ะ", "info");
      navigate("/login", { state: { from: tile.requiresAuthPath } });
    },
    [isAuthenticated, navigate, notify],
  );

  return (
    <div
      className="min-h-screen relative flex flex-col overflow-y-auto"
      style={{ backgroundColor: "#FFFBF5", color: "#3E2723" }}
    >
      <GrandOpeningOverlay />

      {user?.id ? (
        <LineConnectConsent
          userId={user.id}
          open={lineConsentOpen}
          onClose={() => setLineConsentOpen(false)}
          onConnected={() => notify("เชื่อม LINE เรียบร้อยครับ", "success")}
        />
      ) : null}

      {/* Sticky navbar — door always visible */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-3 border-b"
        style={{
          backgroundColor: "rgba(245,240,232,0.97)",
          borderColor: "#E8D5B7",
        }}
      >
        <button
          type="button"
          onClick={goEnterApp}
          className="flex items-center justify-center w-11 h-11 rounded-xl border shadow-sm active:scale-95 transition-transform"
          style={{
            backgroundColor: "#fff",
            borderColor: "#E8D5B7",
            color: "#065f46",
          }}
          aria-label="เข้าสู่แอป Home"
          title="เข้าสู่แอป"
        >
          <DoorOpen size={22} strokeWidth={2.25} />
        </button>

        <div className="flex-1 text-center min-w-0">
          <p
            className="text-sm font-black tracking-wide truncate"
            style={{ color: "#3E2723" }}
          >
            AQOND <span style={{ color: "#059669" }}>SUPERAPP</span>
          </p>
        </div>

        <div
          className="flex items-center px-2.5 py-1.5 rounded-full border"
          style={{ backgroundColor: "#fff", borderColor: "#E8D5B7" }}
        >
          <Globe size={14} className="mr-1.5 shrink-0" style={{ color: "#8B7355" }} />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="bg-transparent text-sm focus:outline-none cursor-pointer max-w-[5.5rem]"
            style={{ color: "#3E2723" }}
            aria-label="Language"
          >
            <option value="en">EN</option>
            <option value="th">ไทย</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </header>

      {/* Compact hero */}
      <section
        className="relative shrink-0 overflow-hidden"
        style={{ minHeight: 160, backgroundColor: "#1A1510" }}
      >
        <img
          src="/httpsapp.aqond.com.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.5 }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(26,21,16,0.92))",
          }}
        />
        <div className="relative z-10 flex flex-col items-center justify-center px-6 py-8 text-center">
          <img
            src="/logo.png"
            alt="AQOND"
            className="w-12 h-12 mb-3 object-contain rounded-2xl shadow-lg"
            width={48}
            height={48}
          />
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight"
            style={{ color: "#fff" }}
          >
            {t("welcome_screen.title") || "AQOND"}
          </h1>
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.85)" }}>
            Marketplace · Services · Jobs · Academy
          </p>
        </div>
      </section>

      <div
        className="flex-1 relative z-10 -mt-4 rounded-t-3xl shadow-lg pb-[max(5rem,env(safe-area-inset-bottom))]"
        style={{ backgroundColor: "#fff" }}
      >
        <div className="px-5 pt-6 space-y-5">
          {/* Auth CTAs first — always above the fold */}
          <div className="space-y-3">
            {signupsEnabled ? (
              <Link
                to="/register"
                className="w-full py-4 text-white text-center font-bold rounded-xl text-lg flex items-center justify-center active:scale-95 transition-transform"
                style={{ backgroundColor: "#059669" }}
              >
                <Sparkles size={20} className="mr-2" />
                {t("welcome_screen.start") || "เริ่มต้นใช้งาน"}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() =>
                  notify(
                    "การสมัครสมาชิกถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
                    "warning",
                  )
                }
                className="w-full py-4 text-white text-center font-bold rounded-xl text-lg flex items-center justify-center opacity-80"
                style={{ backgroundColor: "#94a3b8" }}
              >
                <Sparkles size={20} className="mr-2" />
                {t("welcome_screen.start") || "เริ่มต้นใช้งาน"}
              </button>
            )}
            <Link
              to="/login"
              state={{ from: "/" }}
              className="w-full block py-4 text-center font-bold rounded-xl text-lg border transition-colors"
              style={{
                backgroundColor: "#f9fafb",
                color: "#374151",
                borderColor: "#e5e7eb",
              }}
            >
              {t("welcome_screen.login") || "เข้าสู่ระบบ"}
            </Link>
            <button
              type="button"
              onClick={goEnterApp}
              className="w-full py-3 font-semibold rounded-xl border flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{
                color: "#059669",
                borderColor: "#a7f3d0",
                backgroundColor: "#ecfdf5",
              }}
            >
              <DoorOpen size={18} />
              เข้าสู่แอป (Home)
            </button>
            <button
              type="button"
              onClick={openLineConnect}
              className="w-full py-3 font-semibold rounded-xl flex items-center justify-center gap-2 text-white active:scale-95 transition-transform"
              style={{ backgroundColor: "#06C755" }}
            >
              <MessageSquare size={18} />
              เชื่อม LINE รับความช่วยเหลือตอนสมัคร
            </button>
          </div>

          <h2 className="text-lg font-bold" style={{ color: "#3E2723" }}>
            Explore Services
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <button
                type="button"
                key={tile.id}
                onClick={() => openExplore(tile)}
                className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left min-h-[6rem] active:scale-[0.98] transition-transform ${tile.tint}`}
              >
                <span className="opacity-90">{tile.icon}</span>
                <span className="font-bold text-sm leading-tight">
                  {tile.title}
                </span>
                <span className="text-xs opacity-70">{tile.subtitle}</span>
              </button>
            ))}
          </div>

          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: "#FFFBF5", borderColor: "#E8D5B7" }}
          >
            <p
              className="text-center text-xs font-semibold mb-3"
              style={{ color: "#9E8B6B" }}
            >
              AQOND Ecosystem
            </p>
            <div className="flex items-stretch justify-between gap-2">
              {[
                { n: "1,240+", l: "Shops" },
                { n: "450+", l: "Hirings" },
                { n: "85+", l: "Courses" },
              ].map((s, i) => (
                <React.Fragment key={s.l}>
                  {i > 0 ? (
                    <div
                      className="w-px self-stretch"
                      style={{ backgroundColor: "#E8D5B7" }}
                    />
                  ) : null}
                  <div className="flex-1 text-center">
                    <p
                      className="text-lg font-bold"
                      style={{ color: "#047857" }}
                    >
                      {s.n}
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "#8B7355" }}
                    >
                      {s.l}
                    </p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Banners last — failure must not blank the page */}
          <BackendBannersErrorBoundary variant="welcome">
            <BackendBannersSection variant="welcome" className="mb-2" />
          </BackendBannersErrorBoundary>

          <div className="text-center flex flex-col items-center gap-2 pb-4">
            <Link
              to="/video-feed"
              className="text-sm font-medium flex items-center gap-1"
              style={{ color: "#059669" }}
            >
              <Video size={16} />
              ดูคลิปผลงาน Talent
            </Link>
            <span className="text-xs" style={{ color: "#9ca3af" }}>
              By continuing, you agree to our Terms & Privacy Policy.
            </span>
            <span
              className="flex items-center text-[10px]"
              style={{ color: "#94a3b8" }}
            >
              <Shield size={10} className="mr-1" /> กดไอคอนประตูมุมซ้ายบนเพื่อเข้า
              Home
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AqondSuperWelcome;
/** Alias for App.tsx / legacy `/welcome` imports */
export { AqondSuperWelcome as Welcome };
