import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { api } from "../services/api";
import {
  PaymentMethodChannelGrid,
  type PaymentChannelId,
} from "../components/PaymentMethodChannelGrid";
import type { PaymentProviderGateSnapshot } from "../config/paymentProviderGate";
import {
  MEERAK_PAYMENT_CHANNEL_KEY,
  readStoredPaymentChannel,
} from "../config/paymentChannelStorage";

/** Canonical payment UX from API (`ux` on create-intent / GET status) — use only this for payment state, not provider labels. */
export type { UxPaymentCanonical } from "../services/uxPaymentResponse";

function safeInternalPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

/**
 * หน้าเลือกช่องทางชำระเงิน — ช่องทางที่เซิร์ฟเวอร์เปิดใช้ (+ บัตร Stripe)
 * UX ของสถานะการชำระเงินอยู่ที่ GET /api/payments/status และฟิลด์ `ux` (canonical) เท่านั้น —
 * ไม่ให้อนุมานสถานะจากชื่อผู้ให้บริการ
 */
const MEERAK_SESSION_PAYMENT_CLIENT_REF = "meerak_session_payment_client_ref";

function ensureSessionPaymentRef(): void {
  try {
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(MEERAK_SESSION_PAYMENT_CLIENT_REF)) {
      sessionStorage.setItem(MEERAK_SESSION_PAYMENT_CLIENT_REF, crypto.randomUUID());
    }
  } catch {
    /* ignore */
  }
}

export const PaymentMethodSelect: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeInternalPath(searchParams.get("returnTo"));
  const [snap, setSnap] = useState<PaymentProviderGateSnapshot | null>(null);
  const [selected, setSelected] = useState<PaymentChannelId | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureSessionPaymentRef();
  }, []);

  useEffect(() => {
    const ch = readStoredPaymentChannel();
    if (ch) setSelected(ch);
  }, []);

  const persistAndGo = (id: PaymentChannelId) => {
    try {
      sessionStorage.setItem(MEERAK_PAYMENT_CHANNEL_KEY, id);
    } catch {
      /* ignore */
    }
    setSelected(id);
    if (returnTo) {
      navigate(returnTo);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/payments/provider-config");
        if (!cancelled) setSnap(data as PaymentProviderGateSnapshot);
      } catch {
        if (!cancelled) setSnap(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-full text-slate-600 hover:bg-slate-100"
            aria-label="กลับ"
          >
            <ArrowLeft size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" width={32} height={32} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-slate-900 text-base truncate">เลือกช่องทางชำระเงิน</h1>
            <p className="text-[11px] text-slate-500 truncate">
              ช่องทางตามที่เซิร์ฟเวอร์เปิดใช้ · บัตร Stripe (ถ้าเปิด)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <p className="text-sm text-slate-500 text-center py-8">กำลังโหลดการตั้งค่า…</p>
        ) : (
          <>
            {snap ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm mb-2">
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <Building2 size={18} className="text-emerald-600" />
                  ผู้ให้บริการชำระเงินหลัก: {snap.localGatewayLabel}
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  MDR พร้อมเพย์โดยประมาณ: {snap.mdr.promptpay.inboundPercent}% · บัตร:{" "}
                  {snap.stripeCardEnabled ? "เปิด" : "ปิด"}
                </p>
              </div>
            ) : null}
            <PaymentMethodChannelGrid
              selected={selected}
              onSelect={persistAndGo}
              stripeEnabled={snap?.stripeCardEnabled !== false}
            />
            {selected ? (
              <p className="text-xs text-slate-500 text-center">
                {returnTo
                  ? "บันทึกช่องทางแล้ว — กำลังกลับไปหน้าชำระเงิน…"
                  : `เลือกแล้ว: ${selected} — เปิดหน้าชำระเงินจากงานแล้วแตะอีกครั้งเพื่อบันทึกและกลับ`}
              </p>
            ) : (
              <p className="text-xs text-slate-500 text-center">
                แตะช่องทางที่ต้องการ
                {returnTo ? " แล้วจะกลับไปหน้าชำระเงินอัตโนมัติ" : ""}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
};
