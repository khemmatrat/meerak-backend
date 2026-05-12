import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crown, Sparkles, Check, ChevronLeft, Loader2, Zap, Eye, Award } from "lucide-react";
import confetti from "canvas-confetti";
import { VIPBadge } from "../components/VIPBadge";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { MockApi } from "../services/mockApi";
import { formatDateThaiShort } from "../utils/dateFormat";
import { fetchFeeEstimates, clearFeeEstimatesCache, type FeeEstimatesResponse } from "../services/feeEstimatesService";

/** คัมภีร์สิทธิประโยชน์ VIP — ตารางเปรียบเทียบ (ตัดสินใจง่ายใน 3 วิ) */
const COMPARISON_ROWS = [
  {
    label: "ค่าธรรมเนียมจ้างงาน (Client)",
    general: "8%",
    silver: "6%",
    gold: "5%",
    platinum: "4%",
    icon: Crown,
  },
  {
    label: "ส่วนลด On-top 5%",
    general: "ไม่มี",
    silver: "12 ครั้ง/เดือน",
    gold: "30 ครั้ง/เดือน",
    platinum: "ไม่จำกัด!",
    icon: Zap,
  },
  {
    label: "ค่าธรรมเนียมรับงาน (Partner)",
    general: "24% - 32%",
    silver: "18%",
    gold: "15%",
    platinum: "12%",
    icon: Award,
  },
  {
    label: "การมองเห็นงาน (Match)",
    general: "ปกติ",
    silver: "เห็นก่อน 5 นาที",
    gold: "เห็นก่อน 15 นาที",
    platinum: "เห็นงานทันที (Priority)",
    icon: Eye,
  },
  {
    label: "Badge & Theme",
    general: "มาตรฐาน",
    silver: "Silver Badge",
    gold: "Gold Theme",
    platinum: "Platinum Glow + Theme",
    icon: Sparkles,
  },
] as const;

const TIERS = [
  {
    id: "silver",
    name: "Silver",
    price: 399,
    priceLabel: "399",
    quota: "12 ครั้ง/เดือน",
    features: [
      "ค่าธรรมเนียมจ้างงาน 6%",
      "ค่าธรรมเนียมรับงาน 18%",
      "ส่วนลด 5% On-top 12 ครั้ง/เดือน",
      "เห็นงานก่อน 5 นาที",
      "Silver Badge",
    ],
    cardClass: "border-slate-300 shadow-slate-200 bg-white",
    btnClass: "btn-silver-exclusive",
  },
  {
    id: "gold",
    name: "Gold",
    price: 999,
    priceLabel: "999",
    quota: "30 ครั้ง/เดือน",
    features: [
      "ค่าธรรมเนียมจ้างงาน 5%",
      "ค่าธรรมเนียมรับงาน 15%",
      "ส่วนลด 5% On-top 30 ครั้ง/เดือน",
      "เห็นงานก่อน 15 นาที",
      "Gold Theme",
    ],
    cardClass: "border-amber-300 shadow-amber-100 bg-gradient-to-b from-amber-50/50 to-white",
    btnClass: "btn-gold-exclusive",
  },
  {
    id: "platinum",
    name: "Platinum",
    price: 1999,
    priceLabel: "1,999",
    quota: "ไม่จำกัด",
    features: [
      "ค่าธรรมเนียมจ้างงาน 4%",
      "ค่าธรรมเนียมรับงาน 12%",
      "ส่วนลด 5% On-top ไม่จำกัด!",
      "เห็นงานทันที (Priority)",
      "Platinum Glow + Theme",
      "Priority Support (ช่องทางด่วน)",
      "Early Access Jobs",
    ],
    cardClass: "vip-platinum-card border-slate-400 shadow-xl shadow-slate-200/50 bg-gradient-to-b from-slate-50 to-white ring-2 ring-slate-300/50",
    btnClass: "bg-slate-700 hover:bg-slate-800 text-white shadow-lg",
  },
] as const;

const fireConfetti = () => {
  const count = 120;
  const defaults = { origin: { y: 0.7 }, spread: 100, startVelocity: 35 };
  const fire = (particleRatio: number, opts: confetti.Options) => {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  };
  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.4 });
  fire(0.1, { spread: 120, startVelocity: 45 });
};

export const VIPSubscription: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimatesResponse | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const currentTier = (user?.vip_tier || "none").toLowerCase();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFeeLoading(true);
      try {
        const data = await fetchFeeEstimates();
        if (!cancelled) setFeeEstimates(data);
      } catch {
        if (!cancelled) setFeeEstimates(null);
      } finally {
        if (!cancelled) setFeeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedCards = useMemo(() => {
    const vt = feeEstimates?.vip_tiers;
    return TIERS.map((tier) => {
      const ov = vt?.[tier.id as keyof typeof vt];
      const price = ov?.priceMonthly != null ? Number(ov.priceMonthly) : tier.price;
      return {
        ...tier,
        price,
        priceLabel: price >= 1000 ? price.toLocaleString("th-TH") : String(price),
      };
    });
  }, [feeEstimates]);

  const comparisonRowsDynamic = useMemo(() => {
    const fr = feeEstimates?.fee_rates;
    if (!fr?.platform_fee || !fr.commission_match_board) return COMPARISON_ROWS;
    const pf = fr.platform_fee;
    const cb = fr.commission_match_board;
    const bk = fr.commission_booking;
    return COMPARISON_ROWS.map((row, i) => {
      if (i === 0) {
        return {
          ...row,
          general: `${pf.none ?? 8}%`,
          silver: `${pf.silver}%`,
          gold: `${pf.gold}%`,
          platinum: `${pf.platinum}%`,
        };
      }
      if (i === 2) {
        return {
          ...row,
          general: `${cb.none ?? 24}%–${bk?.none ?? 32}%`,
          silver: `${cb.silver}%`,
          gold: `${cb.gold}%`,
          platinum: `${cb.platinum}%`,
        };
      }
      return row;
    });
  }, [feeEstimates]);

  const handleSelectPlan = async (tierId: string) => {
    if (loadingTier) return;
    const tier = tierId as "silver" | "gold" | "platinum";
    setLoadingTier(tierId);
    try {
      const data = await MockApi.subscribeVipPlan(tier, user?.phone);
      if (data.success) {
        clearFeeEstimatesCache();
        await refreshUser(user?.phone);
        if (data.payment_url) {
          window.location.href = data.payment_url;
          return;
        }
        if (data.qr_url) {
          notify(`กรุณาชำระเงิน ${data.amount ?? ""} ฿ ผ่าน QR ที่แสดง`, "info");
          window.open(data.qr_url, "_blank");
        } else {
          fireConfetti();
          notify(data.message || "สมัครแผน VIP สำเร็จ", "success");
          setTimeout(() => navigate("/", { replace: true }), 1200);
        }
        return;
      }
      if (data.user) {
        await refreshUser(user?.phone);
        fireConfetti();
        notify("สมัครแผน VIP สำเร็จ", "success");
        setTimeout(() => navigate("/", { replace: true }), 1200);
      }
    } catch (e: any) {
      const msg = e?.message || "ไม่สามารถสมัครแผนได้";
      const isComingSoon = /เปิดให้บริการ|เตรียมเปิด|เร็วๆ นี้/i.test(msg);
      notify(msg, isComingSoon ? "info" : "error");
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="relative z-50 max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-24 sm:pb-20 px-3 sm:px-4">
      {/* Header: Luxury Typography */}
      <div className="text-center space-y-2">
        <Link
          to="/profile"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm mb-4"
        >
          <ChevronLeft size={18} />
          กลับโปรไฟล์
        </Link>
        <h1 className="font-platinum-heading font-bold text-3xl sm:text-4xl md:text-5xl text-slate-800 tracking-tight">
          คัมภีร์สิทธิประโยชน์ VIP
        </h1>
        <p className="font-sans text-lg sm:text-xl text-slate-600 font-medium tracking-wide">
          Elevate your Aqond Experience
        </p>
        {feeLoading && (
          <p className="text-xs text-slate-400">กำลังโหลดอัตราค่าธรรมเนียมล่าสุด…</p>
        )}
      </div>

      {feeEstimates?.help?.th && (
        <p className="text-center text-xs text-slate-500 max-w-xl mx-auto">{feeEstimates.help.th}</p>
      )}

      {/* ชำระ VIP ผ่านกระเป๋า — ไม่มี QR แยก */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 sm:p-5 text-sm text-slate-800 max-w-3xl mx-auto">
        <p className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
          <Sparkles size={18} className="text-emerald-600" />
          ชำระ VIP อย่างไร? (หักจากกระเป๋า AQOND เท่านั้น)
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
          <li>เติมเงินเข้ากระเป๋าที่ Profile → กระเป๋า (PromptPay / โอน / ช่องทางที่เปิดใช้)</li>
          <li>กลับมาหน้านี้ แล้วกดเลือกแผน — ระบบจะหักเงินจากกระเป๋าทันทีเมื่อสำเร็จ</li>
          <li>ไม่มี QR หรือลิงก์ชำระแยกสำหรับ VIP</li>
        </ol>
        <p className="mt-3 text-xs text-slate-600">
          ยอดในกระเป๋าปัจจุบัน:{" "}
          <strong className="text-emerald-800 tabular-nums">
            {(user?.wallet_balance ?? 0).toLocaleString()} ฿
          </strong>
        </p>
      </div>

      {/* 3 Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {mergedCards.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const isPlatinum = tier.id === "platinum";
          return (
            <div
              key={tier.id}
              className={`
                relative rounded-2xl border-2 p-5 sm:p-6 flex flex-col min-w-0
                ${tier.cardClass}
                ${isCurrent ? "ring-2 ring-emerald-500 ring-offset-2" : ""}
              `}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  ปัจจุบัน
                </span>
              )}
              {isPlatinum && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 bg-amber-100 px-3 py-0.5 rounded-full border border-amber-200">
                  คุ้มที่สุด
                </span>
              )}
              <div className="flex items-center gap-2 mb-4">
                {tier.id === "platinum" ? (
                  <Sparkles size={22} className="text-slate-500 flex-shrink-0" />
                ) : (
                  <Crown size={22} className="text-amber-500 flex-shrink-0" />
                )}
                <h2 className="font-bold text-xl text-slate-800">{tier.name}</h2>
              </div>
              <div className="mb-4">
                <span className="text-2xl sm:text-3xl font-bold text-slate-800">{tier.priceLabel}</span>
                <span className="text-slate-500 text-sm ml-1">฿/เดือน</span>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {!isCurrent && (
                <button
                  type="button"
                  disabled={!!loadingTier}
                  onClick={() => handleSelectPlan(tier.id)}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${tier.btnClass}`}
                >
                  {loadingTier === tier.id ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>กำลังดำเนินการ...</span>
                    </>
                  ) : (
                    "เลือกแผน"
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 text-lg">ตารางเปรียบเทียบสิทธิประโยชน์</h2>
          <p className="text-slate-500 text-sm">ตัดสินใจง่ายใน 3 วินาที</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700 w-[180px] sm:w-[220px]">สิทธิประโยชน์</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-[70px]">General</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-[70px]">Silver</th>
                <th className="text-center py-3 px-2 font-medium text-amber-700 w-[70px]">Gold</th>
                <th className="text-center py-3 px-2 font-medium text-slate-700 w-[70px] bg-slate-50">Platinum</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRowsDynamic.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4 text-slate-700 flex items-center gap-2">
                    <row.icon size={16} className="text-slate-400 flex-shrink-0" />
                    {row.label}
                  </td>
                  <td className="text-center py-3 px-2 text-slate-500">{row.general}</td>
                  <td className="text-center py-3 px-2 text-slate-600">{row.silver}</td>
                  <td className="text-center py-3 px-2 text-amber-700 font-medium">{row.gold}</td>
                  <td className="text-center py-3 px-2 text-slate-800 font-bold bg-slate-50">{row.platinum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status & Quota */}
      <div className="flex flex-col items-center justify-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl p-4 border border-slate-100">
        <span className="flex items-center gap-2">
          สถานะของคุณ
          <VIPBadge tier={user?.vip_tier} size="md" showLabel />
        </span>
        {user?.vip_tier && user.vip_tier !== "none" && (
          <>
            {user?.vip_expiry && (
              <span>หมดอายุ: {formatDateThaiShort(user.vip_expiry)}</span>
            )}
            {typeof user?.vip_quota_balance === "number" && (
              <span>สิทธิ์ส่วนลดคงเหลือ: {user.vip_quota_balance === 999 ? "ไม่จำกัด" : user.vip_quota_balance} ครั้ง</span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
