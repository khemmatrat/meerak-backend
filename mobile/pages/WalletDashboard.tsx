import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  TrendingUp,
  Wallet,
  Zap,
  Users,
  X,
  Sparkles,
  Radio,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import {
  getPremiumBalanceThb,
  getActivities,
  getDailyRevenueSeries,
  getSuccessfulMatchCount,
  getTodayEarningsThb,
  subscribePremiumWallet,
} from "../lib/premiumWalletStorage";
import { MockApi } from "../services/mockApi";
import { useAuth } from "../context/AuthContext";
import { shouldRequireKycForWithdraw } from "../utils/kycProgressiveGate";

async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

export const WalletDashboard: React.FC = () => {
  const { t } = useLanguage();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [today, setToday] = useState(0);
  const [matches, setMatches] = useState(0);
  const [nearby, setNearby] = useState<number | null>(null);
  const [activities, setActivities] = useState(() => getActivities());
  const [series, setSeries] = useState(() => getDailyRevenueSeries());
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const refresh = useCallback(() => {
    setBalance(getPremiumBalanceThb());
    setToday(getTodayEarningsThb());
    setMatches(getSuccessfulMatchCount());
    setActivities(getActivities());
    setSeries(getDailyRevenueSeries());
  }, []);

  useEffect(() => {
    refresh();
    return subscribePremiumWallet(refresh);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pos = await getCurrentPosition();
      if (cancelled) return;
      if (!pos) {
        setNearby(null);
        return;
      }
      try {
        const list = await MockApi.getNearbyProviders(48, {
          lat: pos.lat,
          lng: pos.lng,
          category: "party_guest",
        });
        if (!cancelled) setNearby(list.length);
      } catch {
        if (!cancelled) setNearby(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(
    () => series.map((d) => ({ ...d, label: d.label })),
    [series],
  );

  const maxY = useMemo(() => {
    const m = Math.max(...chartData.map((d) => d.amount), 1);
    return Math.ceil(m * 1.15);
  }, [chartData]);

  const openWithdrawFlow = useCallback(async () => {
    if (user) {
      try {
        const kyc = await MockApi.checkKYCStatus();
        if (
          shouldRequireKycForWithdraw({
            kycStatus: kyc?.kycStatus,
            kycLevel: kyc?.kycLevel,
            needsReverify: !!kyc?.needsReverify,
          })
        ) {
          notify(
            "ยืนยันตัวตน (KYC) ครบถึงจะถอนเงินจริงได้ — กำลังไปหน้า KYC",
            "warning",
          );
          navigate("/kyc?reason=withdraw");
          return;
        }
      } catch {
        notify("ไม่สามารถตรวจสถานะ KYC ได้ ลองใหม่อีกครั้ง", "error");
        return;
      }
      notify(
        "ถอนเงินจริง — ไปที่โปรไฟล์ แท็บกระเป๋า แล้วกดถอนเงิน",
        "info",
      );
      navigate("/profile");
      return;
    }
    setWithdrawOpen(true);
  }, [user, notify, navigate]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-28 text-slate-900">
      <div className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 px-4 pb-3 pt-4 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-[20px] border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm transition hover:bg-slate-50"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">{t("wallet_dashboard.title")}</h1>
            <p className="truncate text-[11px] text-slate-600">{t("wallet_dashboard.subtitle")}</p>
          </div>
          <Link
            to="/party-vibe"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-gradient-to-r from-violet-50 to-pink-50 px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:from-violet-100 hover:to-pink-100"
          >
            <Sparkles size={14} className="text-violet-600" />
            Party
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 32 }}
          className="relative overflow-hidden rounded-[20px] border border-slate-200/90 bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,0.06)]"
        >
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t("wallet_dashboard.total_revenue")}</p>
            <p className="number-wallet mt-2 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">{fmt(balance)} THB</p>
            <p className="mt-2 text-xs text-slate-600">{t("wallet_dashboard.demo_note")}</p>
            <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  // #region agent log
                  fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"1d8d58"},body:JSON.stringify({sessionId:"1d8d58",runId:"m1-smoke",hypothesisId:"H1",location:"mobile/pages/WalletDashboard.tsx:deposit-button",message:"WalletDashboard deposit entry clicked",data:{target:"/profile?tab=wallet&openDeposit=1"},timestamp:Date.now()})}).catch(()=>{});
                  // #endregion
                  navigate("/profile?tab=wallet&openDeposit=1");
                }}
                className="w-full rounded-[20px] border border-emerald-500 bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] sm:w-auto"
              >
                เติมเงิน
              </button>
              <button
                type="button"
                onClick={() => void openWithdrawFlow()}
                className="w-full rounded-[20px] border border-slate-300 bg-slate-900 px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] sm:w-auto"
              >
                {t("wallet_dashboard.withdraw")}
              </button>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<TrendingUp size={16} className="text-rose-600" strokeWidth={2.25} />}
            label={t("wallet_dashboard.stat_today")}
            value={`${fmt(today)} ฿`}
          />
          <StatCard
            icon={<Zap size={16} className="text-violet-600" strokeWidth={2.25} />}
            label={t("wallet_dashboard.stat_matches")}
            value={String(matches)}
          />
          <StatCard
            icon={<Users size={16} className="text-rose-600" strokeWidth={2.25} />}
            label={t("wallet_dashboard.stat_talents")}
            value={nearby == null ? "—" : String(nearby)}
          />
        </div>

        <Link
          to="/internet-packages"
          className="flex items-center gap-4 rounded-[20px] border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.06)] transition hover:border-emerald-200 hover:shadow-[0_6px_24px_rgba(15,23,42,0.08)]"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Radio size={22} strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{t("wallet_dashboard.buy_data_esim")}</p>
            <p className="text-xs text-slate-500">Tunz · GigaStore · Wallet</p>
          </div>
          <span className="shrink-0 text-slate-400">→</span>
        </Link>

        <section className="rounded-[20px] border border-slate-200/90 bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center justify-between px-0.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <TrendingUp size={16} className="text-rose-600" strokeWidth={2.25} />
              {t("wallet_dashboard.chart_title")}
            </h2>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="walletAreaFillLight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.2} />
                    <stop offset="50%" stopColor="#db2777" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#db2777" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 8" stroke="rgba(148,163,184,0.35)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, maxY]}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#0f172a",
                    boxShadow: "0 4px 20px rgba(15,23,42,0.08)",
                  }}
                  formatter={(v: number) => [`${fmt(v)} THB`, t("wallet_dashboard.total_revenue")]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#db2777"
                  strokeWidth={2.5}
                  fill="url(#walletAreaFillLight)"
                  fillOpacity={1}
                  dot={{ r: 3.5, fill: "#db2777", stroke: "#fff", strokeWidth: 1.5 }}
                  activeDot={{ r: 5, fill: "#be185d", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[20px] border border-slate-200/90 bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Wallet size={16} className="text-rose-600" strokeWidth={2.25} />
            {t("wallet_dashboard.activity_title")}
          </h2>
          {activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{t("wallet_dashboard.activity_empty")}</p>
          ) : (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                >
                  <span className="truncate text-sm text-slate-800">{a.label}</span>
                  <span className="shrink-0 text-sm font-semibold text-rose-600">+{fmt(a.amountThb)} ฿</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AnimatePresence>
        {withdrawOpen && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setWithdrawOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[20px] border border-slate-200 bg-white p-6 shadow-xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{t("wallet_dashboard.withdraw_modal_title")}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t("wallet_dashboard.withdraw_modal_hint")}</p>
                </div>
                <button
                  type="button"
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-2 text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setWithdrawOpen(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="mb-6 text-2xl font-semibold text-slate-900">{fmt(balance)} THB</p>
              <button
                type="button"
                onClick={() => {
                  setWithdrawOpen(false);
                  notify(t("wallet_dashboard.withdraw_demo_toast"), "success");
                }}
                className="w-full rounded-[20px] bg-slate-900 py-3.5 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                {t("wallet_dashboard.withdraw_confirm")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200/90 bg-white p-4 text-center shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
      <div className="mb-1.5 flex justify-center opacity-95">{icon}</div>
      <p className="text-[10px] uppercase leading-tight tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
