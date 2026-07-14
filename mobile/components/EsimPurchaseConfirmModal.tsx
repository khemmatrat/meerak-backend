import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import type { EsimPackageDto } from "../services/rescueNetApi";

export type EsimPurchaseModalVariant = "store" | "home";

type Props = {
  open: boolean;
  variant?: EsimPurchaseModalVariant;
  pkg: EsimPackageDto | null;
  walletBalance: number;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export const EsimPurchaseConfirmModal: React.FC<Props> = ({
  open,
  variant = "store",
  pkg,
  walletBalance,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (open) setAgreed(false);
  }, [open, pkg?.sku]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !pkg) return null;

  const price = Number(pkg.totalCustomerPrice) || 0;
  const balance = Number(walletBalance) || 0;
  const short = balance >= price;
  const after = Math.max(0, balance - price);

  const shell =
    variant === "home"
      ? "border border-gold/20 bg-gradient-to-b from-[#0f1419] to-charcoal-950/95 shadow-2xl shadow-black/40"
      : "border border-white/[0.12] bg-gradient-to-b from-[#0f1624] to-[#05080c] shadow-2xl shadow-black/50";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="esim-confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-label="ปิด"
      />
      <div
        className={`relative w-full max-w-md max-h-[min(92vh,720px)] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 ${shell}`}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
              ยืนยันการสั่งซื้อ
            </p>
            <h2 id="esim-confirm-title" className="text-lg font-bold text-white mt-1 leading-snug">
              {pkg.name}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {pkg.region} · {pkg.dataGb} GB · {pkg.validityDays} วัน
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="p-2 rounded-2xl border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] disabled:opacity-50 shrink-0"
            aria-label="ปิด"
          >
            <X size={20} />
          </button>
        </div>

        {pkg.notes ? (
          <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3 mb-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              รายละเอียดจากผู้ให้บริการ
            </p>
            <p className="text-sm text-slate-300/95 leading-relaxed">{pkg.notes}</p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3 text-xs text-slate-400 space-y-2 font-mono tabular-nums mb-4">
          <div className="flex justify-between">
            <span>ฐาน</span>
            <span>฿{pkg.basePrice}</span>
          </div>
          <div className="flex justify-between">
            <span>มาร์จิ้น ({pkg.markupPercent}%)</span>
            <span>฿{pkg.markupAmount}</span>
          </div>
          <div className="flex justify-between">
            <span>ค่าบริการ</span>
            <span>฿{pkg.convenienceFee}</span>
          </div>
          <div className="flex justify-between text-slate-200 pt-2 border-t border-white/10 font-sans font-semibold">
            <span>ชำระรวม</span>
            <span>฿{price.toLocaleString()}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 px-4 py-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">ยอด Wallet ปัจจุบัน</span>
            <span className="font-bold text-white tabular-nums">฿{balance.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-slate-400">หลังหัก (ประมาณ)</span>
            <span
              className={`font-bold tabular-nums ${short ? "text-emerald-300" : "text-rose-300"}`}
            >
              ฿{after.toLocaleString()}
            </span>
          </div>
          {!short && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-xs text-rose-200/90 leading-relaxed mb-2">
                ยอดไม่พอ — ต้องการอีกประมาณ{" "}
                <span className="font-semibold text-white">
                  ฿{Math.max(0, price - balance).toLocaleString()}
                </span>
              </p>
              <Link
                to="/profile?tab=wallet"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:brightness-105"
              >
                ไปเติม Wallet
              </Link>
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500/40"
          />
          <span className="text-xs text-slate-400 leading-relaxed">
            ฉันเข้าใจว่า eSIM ขึ้นกับความพร้อมของเครื่องและพื้นที่ให้บริการ ไม่ใช่การรับประกันสัญญาณทุกที่ และได้อ่าน{" "}
            <Link to="/legal?type=terms" className="text-cyan-400 hover:underline" onClick={onClose}>
              ข้อกำหนดการใช้บริการ
            </Link>
            ,{" "}
            <Link to="/legal?type=refund" className="text-cyan-400 hover:underline" onClick={onClose}>
              นโยบายคืนเงิน
            </Link>
            ,{" "}
            <Link
              to="/legal?type=liability_limitation"
              className="text-cyan-400 hover:underline"
              onClick={onClose}
            >
              ข้อจำกัดความรับผิด
            </Link>{" "}
            แล้ว
          </span>
        </label>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/15 bg-white/[0.04] py-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={loading || !short || !agreed}
            onClick={() => void onConfirm()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500 to-amber-700 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/25 hover:brightness-105 disabled:opacity-45 disabled:pointer-events-none"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                กำลังดำเนินการ
              </>
            ) : (
              <>ยืนยันชำระ ฿{price.toLocaleString()}</>
            )}
          </button>
        </div>

        <p className="text-[10px] text-slate-600 text-center mt-4 leading-relaxed">
          ต้องการความช่วยเหลือ?{" "}
          <Link to="/settings" className="text-slate-500 hover:text-slate-400 underline" onClick={onClose}>
            ตั้งค่าและบัญชี
          </Link>
        </p>
      </div>
    </div>
  );
};
