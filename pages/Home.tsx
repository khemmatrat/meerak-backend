import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
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
  Tag,
} from "lucide-react";

export interface HomeBannerItem {
  id: string;
  title: string;
  imageUrl: string;
  actionUrl?: string;
  order: number;
  promoCode?: string;
  discountMaxBaht?: number;
  discountDescription?: string;
}

export interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  target: string;
  sentAt: string;
}

export const Home: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState<HomeBannerItem[]>([]);
  const [claimingCode, setClaimingCode] = useState<string | null>(null);
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
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const loadAdminNotifications = React.useCallback(async () => {
    setNotifError(null);
    setNotifLoading(true);
    try {
      const list = await MockApi.getLatestAdminNotifications(5);
      setAdminNotifications(list || []);
    } catch (e) {
      setNotifError("โหลดข้อความจากแอดมินไม่สำเร็จ");
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminNotifications();
  }, [loadAdminNotifications]);

  useEffect(() => {
    MockApi.getBanners()
      .then((res) => setBanners(res.banners || []))
      .catch(() => setBanners([]));
  }, []);

  const handleClaimVoucher = async (code: string) => {
    if (!user) {
      notify("กรุณาเข้าสู่ระบบก่อนรับโค้ดส่วนลด", "error");
      return;
    }
    setClaimingCode(code);
    try {
      const data = await MockApi.claimVoucher(code);
      notify(data.message || "รับโค้ดส่วนลดสำเร็จ ใช้ได้เมื่อจ้างงาน (วงเงินจำกัด)", "success");
    } catch (e: any) {
      notify(e?.message || "รับโค้ดไม่สำเร็จ", "error");
    } finally {
      setClaimingCode(null);
    }
  };

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

  const categories = [
    { id: "Cleaning", icon: "🧹", bg: "bg-blue-100", name: "แม่บ้าน" },
    { id: "AC_Cleaning", icon: "❄️", bg: "bg-cyan-100", name: "ล้างแอร์" },
    { id: "Shopping_Buddy", icon: "🛒", bg: "bg-pink-100", name: "ฝากซื้อของ" },
    {
      id: "Party_Guest",
      icon: "🎮",
      bg: "bg-purple-100",
      name: "หาเพื่อนเล่นเกมส์",
    },
    { id: "Plumbing", icon: "🔧", bg: "bg-orange-100", name: "งานช่าง" },
    { id: "Driver", icon: "🚗", bg: "bg-yellow-100", name: "รับ-ส่งคน" },
    { id: "Messenger", icon: "📦", bg: "bg-indigo-100", name: "รับ-ส่งสินค้า" },
    { id: "Moving", icon: "🚚", bg: "bg-red-100", name: "เรียกรถยก" },
    { id: "Dating", icon: "🕵️", bg: "bg-gray-100", name: "งานสืบ" },
  ];

  return (
    <div className="space-y-8 pb-20">
      {/* Admin broadcast message (ส่งจาก Nexus Admin → แสดงที่นี่) */}
      {notifLoading && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-500 text-sm flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
          กำลังโหลดข้อความจากแอดมิน...
        </div>
      )}
      {!notifLoading && notifError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
          <span className="text-amber-800 text-sm">{notifError}</span>
          <button
            type="button"
            onClick={loadAdminNotifications}
            className="text-amber-700 text-sm font-medium underline hover:no-underline"
          >
            โหลดอีกครั้ง
          </button>
        </div>
      )}
      {!notifLoading && latestAdminNotif && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <div className="bg-indigo-600 p-2 rounded-lg shrink-0">
            <Bell size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-indigo-900">{latestAdminNotif.title}</p>
            <p className="text-indigo-800 text-sm mt-0.5">{latestAdminNotif.message}</p>
            <p className="text-indigo-500 text-xs mt-1">
              {latestAdminNotif.sentAt
                ? new Date(latestAdminNotif.sentAt).toLocaleString("th-TH")
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissAdminNotif(latestAdminNotif.id)}
            className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-100 transition-colors shrink-0"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getTimeGreeting()}, {user?.name ? user.name.split(" ")[0] : "User"}
            !
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Ready to find or provide services today?
          </p>
        </div>
        <Link
          to="/profile"
          className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-2 hover:bg-gray-50 transition-colors"
        >
          <div className="bg-emerald-100 p-1.5 rounded-lg">
            <Wallet size={18} className="text-emerald-600" />
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs text-gray-400 font-medium">
              {t("home.wallet")}
            </p>
            <p className="text-sm font-bold text-gray-900">
              {user?.wallet_balance?.toLocaleString()} ฿
            </p>
          </div>
        </Link>
      </div>

      {/* แบนเนอร์จาก Content Manager (โฆษณา/แคมเปญ + โค้ดส่วนลด) */}
      {banners.length > 0 ? (
        <div className="space-y-4">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-white"
            >
              <div className="relative aspect-[2/1] min-h-[140px] bg-gray-100">
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://via.placeholder.com/800x400?text=Banner";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex flex-col justify-end p-4">
                  <h2 className="text-lg font-bold text-white drop-shadow">{banner.title}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {banner.actionUrl && (
                      <Link
                        to={banner.actionUrl.startsWith("/") ? banner.actionUrl : "/jobs"}
                        className="bg-white text-emerald-600 px-3 py-1.5 rounded-lg font-bold text-sm hover:bg-emerald-50 inline-flex items-center"
                      >
                        {t("home.view_all")} <ArrowRight size={14} className="ml-1" />
                      </Link>
                    )}
                    {banner.promoCode && banner.discountMaxBaht != null && banner.discountMaxBaht > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClaimVoucher(banner.promoCode!)}
                        disabled={!!claimingCode}
                        className="bg-amber-400 text-amber-900 px-3 py-1.5 rounded-lg font-bold text-sm hover:bg-amber-300 inline-flex items-center gap-1 disabled:opacity-70"
                      >
                        <Tag size={14} />
                        {claimingCode === banner.promoCode ? "กำลังรับ..." : "รับโค้ดส่วนลด"}
                      </button>
                    )}
                  </div>
                  {banner.discountDescription && (
                    <p className="text-white/90 text-xs mt-1">{banner.discountDescription}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-3 inline-block">
              {t("home.promo")}
            </span>
            <h2 className="text-2xl font-bold mb-2">Clean Home, Happy Life</h2>
            <p className="text-emerald-100 mb-4 max-w-xs">{t("home.promo_desc")}</p>
            <Link
              to="/jobs"
              className="bg-white text-emerald-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-emerald-50 transition-colors inline-flex items-center"
            >
              {t("home.view_all")} <ArrowRight size={16} className="ml-2" />
            </Link>
          </div>
          <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-4 translate-y-4">
            <Sparkles size={150} />
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/jobs"
          className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col items-center text-center group"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
            <Search size={24} className="text-blue-600" />
          </div>
          <h3 className="font-bold text-gray-900">{t("home.find_service")}</h3>
          <p className="text-xs text-gray-500 mt-1">Browse 100+ Categories</p>
        </Link>
        <Link
          to="/talents"
          className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col items-center text-center group"
        >
          <div className="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-pink-100 transition-colors">
            <Heart size={24} className="text-pink-600" />
          </div>
          <h3 className="font-bold text-gray-900">{t("home.find_talent")}</h3>
          <p className="text-xs text-gray-500 mt-1">Models, Students & More</p>
        </Link>
      </div>
      {user?.role === "provider" ? (
        <Link
          to="/provider/dashboard"
          className="inline-flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-200"
        >
          <Briefcase className="mr-2 h-4 w-4" />
          แดชบอร์ดผู้รับงาน
        </Link>
      ) : (
        <Link
          to="/employer/dashboard"
          className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
        >
          <Users className="mr-2 h-4 w-4" />
          แดชบอร์ดนายจ้าง
        </Link>
      )}
      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              {t("home.active_jobs")}
            </h2>
            <Link
              to="/my-jobs"
              className="text-sm text-emerald-600 hover:underline"
            >
              {t("home.view_all")}
            </Link>
          </div>
          <div className="flex space-x-4 overflow-x-auto pb-4 no-scrollbar">
            {activeJobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="min-w-[260px] bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-emerald-500 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-medium truncate max-w-[120px]">
                    {job.category}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded ${
                      job.status === "WAITING_FOR_PAYMENT"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {job.status.replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 truncate">
                  {job.title}
                </h3>
                <p className="text-xs text-gray-500 mt-1 flex items-center">
                  <Briefcase size={12} className="mr-1" /> {job.price} THB
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Popular Categories */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t("home.popular_cat")}
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to="/jobs"
              className="flex flex-col items-center space-y-2 group"
            >
              <div
                className={`w-14 h-14 ${cat.bg} rounded-2xl flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform`}
              >
                {cat.icon}
              </div>
              <span className="text-xs font-medium text-gray-600 text-center">
                {cat.name || t(`cat.${cat.id}`) || cat.id}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
