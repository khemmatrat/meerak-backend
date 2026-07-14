import React, { useEffect, useState } from "react";
import { Clock, Flame, Gift, Sparkles, Tag, Users } from "lucide-react";
import type {
  CourseBundleOffer,
  CourseConversionMeta,
  CourseRecentBuyer,
} from "../../services/courseMarketplaceService";

function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} ชม. ${m} น. ${sec} วิ.`;
  if (m > 0) return `${m} น. ${sec} วิ.`;
  return `${sec} วิ.`;
}

function RecentBuyersList({ buyers }: { buyers: CourseRecentBuyer[] }) {
  if (!buyers.length) return null;
  return (
    <div className="rounded-2xl bg-slate-900/70 p-3 text-sm text-slate-300">
      <p className="font-bold text-slate-100 inline-flex items-center gap-2 mb-2">
        <Users size={15} className="text-emerald-300" /> คนซื้อล่าสุด
      </p>
      <ul className="space-y-1 text-xs">
        {buyers.slice(0, 5).map((b, i) => (
          <li key={`${b.displayName}-${i}`} className="flex justify-between gap-2">
            <span>{b.displayName}</span>
            <span className="text-slate-500 shrink-0">เพิ่งซื้อ</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BundleOffers({ bundles }: { bundles: CourseBundleOffer[] }) {
  if (!bundles.length) return null;
  return (
    <div className="space-y-2">
      {bundles.map((bundle) => (
        <div
          key={bundle.id}
          className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-3 text-sm"
        >
          <p className="font-bold text-indigo-100 inline-flex items-center gap-2">
            <Tag size={15} /> ชุดคอร์ส: {bundle.title}
          </p>
          <p className="text-xs text-indigo-200/80 mt-1">
            {bundle.courses.length} คอร์ส · ประหยัด ฿{bundle.savingsThb.toLocaleString()} · รวม ฿
            {bundle.bundlePriceThb.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function CourseConversionStrip({
  conversion,
  couponCode,
  onCouponCodeChange,
  onApplyCoupon,
  applyingCoupon,
}: {
  conversion?: CourseConversionMeta | null;
  couponCode?: string;
  onCouponCodeChange?: (code: string) => void;
  onApplyCoupon?: () => void;
  applyingCoupon?: boolean;
}) {
  const [countdown, setCountdown] = useState(conversion?.promo?.countdownSeconds || 0);

  useEffect(() => {
    setCountdown(conversion?.promo?.countdownSeconds || 0);
  }, [conversion?.promo?.countdownSeconds]);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const t = window.setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [conversion?.promo?.endsAt]);

  if (!conversion) return null;

  const showCouponInput = onCouponCodeChange && onApplyCoupon;

  return (
    <section className="luxury-card rounded-3xl p-5 space-y-3">
      <h2 className="text-lg font-bold text-slate-100 inline-flex items-center gap-2">
        <Flame size={18} className="text-rose-300" /> โปร & ความคุ้มค่า
      </h2>

      {conversion.promo && countdown > 0 ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm">
          <p className="font-bold text-rose-100 inline-flex items-center gap-2">
            <Clock size={15} /> โปรหมดใน {formatCountdown(countdown)}
          </p>
          {conversion.promo.description ? (
            <p className="text-xs text-rose-100/80 mt-1">{conversion.promo.description}</p>
          ) : null}
          {conversion.promo.promoCode ? (
            <p className="text-xs text-rose-200 mt-1">โค้ดแบนเนอร์: {conversion.promo.promoCode}</p>
          ) : null}
        </div>
      ) : null}

      {conversion.limitedSeats ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 font-semibold">
          {conversion.limitedSeats.urgencyLabel}
        </div>
      ) : null}

      {conversion.firstPurchaseEligible ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <p className="font-bold inline-flex items-center gap-2">
            <Gift size={15} /> ส่วนลดคอร์สแรก {(conversion.firstPurchaseDiscountRate || 0) * 100}%
          </p>
          {(conversion.firstPurchaseBonusPoints || 0) > 0 ? (
            <p className="text-xs mt-1 text-emerald-200/90">
              + แต้มสะสม {conversion.firstPurchaseBonusPoints} แต้มหลังซื้อสำเร็จ
            </p>
          ) : null}
        </div>
      ) : null}

      {showCouponInput ? (
        <div className="flex gap-2">
          <input
            value={couponCode || ""}
            onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
            placeholder="โค้ดส่วนลดจากผู้สอน"
            className="flex-1 rounded-xl bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={onApplyCoupon}
            disabled={applyingCoupon || !couponCode?.trim()}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {applyingCoupon ? "..." : "ใช้โค้ด"}
          </button>
        </div>
      ) : null}

      <RecentBuyersList buyers={conversion.recentBuyers || []} />
      <BundleOffers bundles={conversion.bundles || []} />

      {(conversion.recentBuyers || []).length === 0 && !conversion.promo && !conversion.firstPurchaseEligible ? (
        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
          <Sparkles size={13} /> เป็นคอร์สใหม่ — ซื้อก่อนใครแล้วเริ่มเรียนได้ทันที
        </p>
      ) : null}
    </section>
  );
}
