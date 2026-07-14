import React, { useState } from "react";
import { CreditCard, Gift, QrCode, RefreshCw, ShieldCheck, WalletCards, X } from "lucide-react";
import type {
  CourseInstallmentPlan,
  CoursePurchaseQuote,
  CourseWalletAffordability,
  CourseConversionDiscount,
} from "../../services/courseMarketplaceService";

function money(n?: number | null) {
  return `฿${Number(n || 0).toLocaleString()}`;
}

export default function CoursePurchaseSheet({
  open,
  title,
  quote,
  wallet,
  installment,
  isCoachDirect,
  conversion,
  buying,
  onClose,
  onConfirm,
  onTopUp,
  onPayGateway,
  gatewayPaying,
  gatewayPending,
  onPollGateway,
}: {
  open: boolean;
  title: string;
  quote: CoursePurchaseQuote | null;
  wallet: CourseWalletAffordability | null;
  installment?: CourseInstallmentPlan | null;
  isCoachDirect?: boolean;
  conversion?: CourseConversionDiscount | null;
  buying?: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    paymentMode: "wallet" | "installment";
    recipientUserId?: string;
    giftMessage?: string;
  }) => void;
  onTopUp: () => void;
  onPayGateway?: (
    method: "promptpay" | "card",
    opts: { recipientUserId?: string; giftMessage?: string },
  ) => void;
  gatewayPaying?: boolean;
  gatewayPending?: {
    chargeId: string;
    qrCodeUrl?: string | null;
    amount: number;
    paymentMethod: string;
  } | null;
  onPollGateway?: () => void;
}) {
  const [giftMode, setGiftMode] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [paymentMode, setPaymentMode] = useState<"wallet" | "installment">("wallet");

  if (!open || !quote) return null;

  const gross = Number(quote.grossAmount || 0);
  const walletDown = paymentMode === "installment" ? Number(installment?.walletDown || 0) : gross;
  const canAfford =
    paymentMode === "installment"
      ? !!installment?.eligible && Number(wallet?.balance || 0) >= walletDown
      : wallet
        ? wallet.canAfford
        : true;
  const shortfall = Math.max(0, walletDown - Number(wallet?.balance || 0));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm px-4 pb-24">
      <div className="course-purchase-sheet course-flow-dark w-full max-w-lg rounded-[28px] bg-slate-900 border border-slate-600 shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-600 sticky top-0 bg-slate-900 z-10">
          <div>
            <p className="text-xs text-slate-300 font-medium">ยืนยันการซื้อ</p>
            <h2 className="text-lg font-bold text-white line-clamp-1">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-100 border border-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isCoachDirect ? (
            <div className="rounded-2xl bg-indigo-500/20 border border-indigo-400/40 px-4 py-3 text-sm text-indigo-100">
              ส่วนลดศิษย์โค้ช {(quote.discountRate * 100).toFixed(0)}%
            </div>
          ) : null}

          {conversion?.firstPurchaseApplied ? (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 text-sm text-emerald-100">
              ส่วนลดคอร์สแรก{" "}
              {((conversion.discountBreakdown?.firstPurchaseDiscountRate || 0) * 100).toFixed(0)}%
              {(conversion.firstPurchaseBonusPoints || 0) > 0
                ? ` · +${conversion.firstPurchaseBonusPoints} แต้ม`
                : ""}
            </div>
          ) : null}

          {conversion?.coupon ? (
            <div className="rounded-2xl bg-amber-500/15 border border-amber-400/30 px-4 py-3 text-sm text-amber-100">
              โค้ด {conversion.coupon.code} −{conversion.coupon.discountPercent}%
            </div>
          ) : null}

          {conversion?.voucher ? (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-400/30 px-4 py-3 text-sm text-rose-100">
              วอเชอร์ {conversion.voucher.promoCode} −{money(conversion.voucher.discountThb)}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setGiftMode((v) => !v)}
            className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
              giftMode ? "border-rose-400/50 bg-rose-500/15 text-rose-50" : "border-slate-500 bg-slate-800/80 text-slate-100"
            }`}
          >
            <span className="inline-flex items-center gap-2 font-bold">
              <Gift size={16} /> ซื้อเป็นของขวัญให้คนอื่น
            </span>
          </button>

          {giftMode ? (
            <div className="space-y-2">
              <input
                value={recipientUserId}
                onChange={(e) => setRecipientUserId(e.target.value.trim())}
                placeholder="User ID ผู้รับ (UUID)"
                className="w-full rounded-xl bg-slate-800 border border-slate-500 text-white placeholder:text-slate-400 px-3 py-2 text-sm"
              />
              <textarea
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value)}
                placeholder="ข้อความอวยพร (ไม่บังคับ)"
                className="w-full min-h-20 rounded-xl bg-slate-800 border border-slate-500 text-white placeholder:text-slate-400 px-3 py-2 text-sm"
              />
            </div>
          ) : null}

          {installment?.eligible && gross >= Number(installment.minGrossThb || 300) ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMode("wallet")}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold border ${
                  paymentMode === "wallet"
                    ? "bg-emerald-600 text-white border-emerald-500"
                    : "bg-slate-800 text-slate-100 border-slate-500"
                }`}
              >
                Wallet เต็มจำนวน
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode("installment")}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold border ${
                  paymentMode === "installment"
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : "bg-slate-800 text-slate-100 border-slate-500"
                }`}
              >
                ผ่อน {installment.installmentCount} งวด
              </button>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-500 bg-slate-800/60 overflow-hidden text-sm">
            {quote.anchorPrice > gross ? (
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-200">ราคาเต็ม</span>
                <span className="text-slate-300 line-through">{money(quote.anchorPrice)}</span>
              </div>
            ) : null}
            <div className="flex justify-between px-4 py-3 border-t border-slate-600">
              <span className="text-slate-100 font-medium">
                {paymentMode === "installment" ? "ดาวน์วันนี้ (Wallet)" : "ยอดชำระ (Wallet)"}
              </span>
              <span className="text-2xl font-black text-emerald-300">{gross <= 0 ? "ฟรี" : money(walletDown)}</span>
            </div>
            {paymentMode === "installment" && installment ? (
              <>
                <div className="flex justify-between px-4 py-3 border-t border-slate-600 text-xs">
                  <span className="text-slate-200">ผ่อนผ่าน credit line</span>
                  <span className="text-indigo-200">{money(installment.creditPrincipal)} · {installment.installmentCount} งวด</span>
                </div>
                <div className="flex justify-between px-4 py-3 border-t border-slate-600 text-xs">
                  <span className="text-slate-200">วงเงินคงเหลือ</span>
                  <span className="text-slate-100">{money(installment.creditAvailable)}</span>
                </div>
              </>
            ) : null}
            {wallet ? (
              <div className="flex justify-between px-4 py-3 border-t border-slate-600">
                <span className="text-slate-100 inline-flex items-center gap-1 font-medium">
                  <WalletCards size={14} /> Wallet คงเหลือ
                </span>
                <span className={canAfford ? "text-white font-bold" : "text-amber-300 font-bold"}>{money(wallet.balance)}</span>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-slate-200 inline-flex items-start gap-2">
            <ShieldCheck size={14} className="text-emerald-300 shrink-0 mt-0.5" />
            การันตีคืนเงิน 7 วัน · Wallet 1-tap หรือชำระ PromptPay/บัตรโดยตรง
          </p>

          {gatewayPending ? (
            <div className="rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-4 space-y-3">
              <p className="text-sm font-bold text-indigo-100 inline-flex items-center gap-2">
                <QrCode size={16} /> ชำระ {money(gatewayPending.amount)} · {gatewayPending.paymentMethod}
              </p>
              {gatewayPending.qrCodeUrl ? (
                <img
                  src={gatewayPending.qrCodeUrl}
                  alt="PromptPay QR"
                  className="mx-auto w-48 h-48 rounded-xl bg-white p-2"
                />
              ) : (
                <p className="text-xs text-indigo-200">รอ redirect การชำระ — กดตรวจสอบหลังชำระแล้ว</p>
              )}
              <button
                type="button"
                onClick={onPollGateway}
                disabled={gatewayPaying}
                className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <RefreshCw size={14} className={gatewayPaying ? "animate-spin" : ""} /> ตรวจสอบการชำระ
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {!gatewayPending && onPayGateway ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={gatewayPaying || buying || gross <= 0}
                  onClick={() =>
                    onPayGateway("promptpay", {
                      recipientUserId: giftMode && recipientUserId ? recipientUserId : undefined,
                      giftMessage: giftMode ? giftMessage : undefined,
                    })
                  }
                  className="flex-1 px-3 py-2.5 rounded-xl border border-indigo-400/50 text-indigo-100 text-sm font-bold inline-flex items-center justify-center gap-1 disabled:opacity-60"
                >
                  <QrCode size={14} /> PromptPay
                </button>
                <button
                  type="button"
                  disabled={gatewayPaying || buying || gross <= 0}
                  onClick={() =>
                    onPayGateway("card", {
                      recipientUserId: giftMode && recipientUserId ? recipientUserId : undefined,
                      giftMessage: giftMode ? giftMessage : undefined,
                    })
                  }
                  className="flex-1 px-3 py-2.5 rounded-xl border border-indigo-400/50 text-indigo-100 text-sm font-bold inline-flex items-center justify-center gap-1 disabled:opacity-60"
                >
                  <CreditCard size={14} /> บัตร
                </button>
              </div>
            ) : null}
          <div className="flex gap-2">
            {!canAfford && wallet ? (
              <button
                type="button"
                onClick={onTopUp}
                className="flex-1 px-4 py-3 rounded-2xl bg-amber-500 text-slate-950 font-black"
              >
                เติม {money(shortfall)}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                onConfirm({
                  paymentMode,
                  recipientUserId: giftMode && recipientUserId ? recipientUserId : undefined,
                  giftMessage: giftMode ? giftMessage : undefined,
                })
              }
              disabled={
                buying
                || (!canAfford && !!wallet)
                || (giftMode && !recipientUserId.trim())
              }
              className="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 text-white font-black disabled:opacity-60"
            >
              {buying ? "กำลังซื้อ..." : gross <= 0 ? "ลงทะเบียนฟรี" : giftMode ? "ส่งของขวัญ" : paymentMode === "installment" ? "ยืนยันผ่อนชำระ" : "ยืนยันซื้อ 1-tap"}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
