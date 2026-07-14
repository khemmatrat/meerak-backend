import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, TrendingUp, Loader2 } from "lucide-react";
import {
  checkoutSubscription799,
  fetchUpsell799Status,
  type Upsell799Status,
} from "../../services/growthEngineService";
import { navigateToMarketplace } from "../../services/marketplaceHandoff";

type Variant = "talent" | "merchant" | "auto";

type Props = {
  variant?: Variant;
  compact?: boolean;
  className?: string;
  onSubscribed?: () => void;
};

export function SubscriptionUpsell799({
  variant = "auto",
  compact = false,
  className = "",
  onSubscribed,
}: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Upsell799Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchUpsell799Status();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedVariant: "talent" | "merchant" =
    variant === "auto" ? (status?.variant === "merchant" ? "merchant" : "talent") : variant;

  const plan =
    status?.plans?.find((p) =>
      resolvedVariant === "merchant"
        ? p.id === "merchant_marketing_799"
        : p.id === "talent_pro_799",
    ) || status?.plan;

  const handleCheckout = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await checkoutSubscription799(plan.id);
      await load();
      onSubscribed?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ชำระไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Loader2 className="animate-spin" size={16} />
        กำลังโหลดแพ็ก Pro…
      </div>
    );
  }

  if (!status?.found) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600 ${className}`}>
        กรุณาเข้าสู่ระบบเพื่อดูแพ็ก Pro 799 บาท
      </div>
    );
  }

  if (status.hasActive799) {
    return (
      <div
        className={`rounded-2xl border border-emerald-200 bg-emerald-50 p-4 ${compact ? "p-3" : "p-5"} ${className}`}
      >
        <p className="font-bold text-emerald-800">✓ Pro 799 เปิดใช้งานแล้ว</p>
        <p className="text-xs text-emerald-700 mt-1">{status.exposure?.message}</p>
      </div>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-cyan-50 overflow-hidden ${compact ? "p-4" : "p-5"} ${className}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
          <Sparkles size={20} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-violet-600 font-bold">
            {resolvedVariant === "merchant" ? "Merchant Growth" : "Talent Growth"}
          </p>
          <h3 className="font-bold text-slate-900 text-base leading-tight">
            {plan?.nameTh || "AQOND Pro 799"}
          </h3>
          <p className="text-2xl font-black text-violet-700 mt-1">
            ฿799<span className="text-sm font-semibold text-slate-500">/เดือน</span>
          </p>
        </div>
      </div>

      {status.exposure ? (
        <div className="rounded-xl bg-white/80 border border-violet-100 p-3 mb-3">
          <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
            <TrendingUp size={14} className="text-emerald-600" />
            {status.exposure.label}
          </p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{status.exposure.message}</p>
          <div className="grid grid-cols-2 gap-2 mt-2 text-center">
            <div className="rounded-lg bg-slate-50 py-2">
              <p className="text-[10px] text-slate-500">Exposure/เดือน</p>
              <p className="font-bold text-sm tabular-nums">
                {status.exposure.monthlyImpressions.toLocaleString("th-TH")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 py-2">
              <p className="text-[10px] text-slate-500">มูลค่าโดยประมาณ</p>
              <p className="font-bold text-sm tabular-nums">
                ฿{status.exposure.revenuePotentialThb.toLocaleString("th-TH")}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!compact ? (
        <ul className="text-xs text-slate-700 space-y-1 mb-3">
          {(plan?.features || []).map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-emerald-600">✓</span>
              {f}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-slate-600 mb-3">
        กระเป๋า: <strong>฿{(status.walletBalance ?? 0).toLocaleString("th-TH")}</strong>
        {!status.canPayWithWallet ? " — เติมเงินก่อนสมัคร" : ""}
      </p>

      <button
        type="button"
        disabled={busy || !status.canPayWithWallet}
        onClick={() => void handleCheckout()}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-sm disabled:opacity-50"
      >
        {busy ? "กำลังเปิดแพ็ก…" : "สมัคร Pro 799 — หักจาก Wallet"}
      </button>

      {!status.canPayWithWallet ? (
        <button
          type="button"
          onClick={() => navigateToMarketplace(navigate, "/m/wallet")}
          className="w-full mt-2 py-2 text-xs text-violet-700 underline"
        >
          เติมเงินกระเป๋า
        </button>
      ) : null}

      {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
    </section>
  );
}
