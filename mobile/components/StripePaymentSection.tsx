import React, { useCallback, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2, CreditCard } from "lucide-react";
import { BackendPaymentService, parsePaymentRateLimitError } from "../services/backendPaymentService";
import {
  isTerminalUxPaymentStatus,
  paymentConfirmedViaServerFootnote,
  pickUxFailureMessage,
  pollTimeoutUserMessage,
  rateLimitedCreatePaymentMessage,
  shouldDiscardStaleUxPayment,
  type UxPaymentCanonical,
} from "../services/uxPaymentResponse";

type Props = {
  jobId: string;
  language?: "th" | "en";
  discountAmount: number;
  hasInsurance: boolean;
  totalLabel: string;
  onPaid: () => void;
  onError: (msg: string) => void;
  notify: (msg: string, type: "success" | "error" | "info") => void;
};

function InnerCheckout({
  jobId,
  lang,
  onPaid,
  onError,
  notify,
}: Omit<Props, "totalLabel" | "discountAmount" | "hasInsurance">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!stripe || !elements) {
      onError(lang === "th" ? "Stripe ยังไม่พร้อม" : "Stripe is not ready");
      return;
    }
    setBusy(true);
    try {
      // HashRouter: path อยู่ใน hash — Stripe ต้องการ return_url เต็ม
      const returnUrl = `${window.location.origin}/#/payment/${encodeURIComponent(jobId)}?stripe_done=1`;
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: "if_required",
      });

      if (error) {
        onError(error.message || (lang === "th" ? "ชำระเงินไม่สำเร็จ" : "Payment unsuccessful"));
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        await pollPaid();
        return;
      }

      await pollPaid();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : lang === "th" ? "ชำระเงินไม่สำเร็จ" : "Payment unsuccessful";
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  const pollPaid = async () => {
    const deadline = Date.now() + 90_000;
    let lastUxVersion = 0;
    let uxUnchangedStreak = 0;
    let lastFp = "";
    while (Date.now() < deadline) {
      let waitMs = 1500;
      const st = await BackendPaymentService.getPaymentStatus(jobId);
      const ux = st.ux as UxPaymentCanonical | undefined;
      if (ux != null && typeof ux.status_version === "number") {
        const fp = `${ux.status}:${ux.status_version}`;
        if (fp === lastFp) uxUnchangedStreak += 1;
        else {
          uxUnchangedStreak = 0;
          lastFp = fp;
        }
        if (!shouldDiscardStaleUxPayment(lastUxVersion, ux.status_version)) {
          lastUxVersion = Math.max(lastUxVersion, ux.status_version);
        }
        if (typeof ux.poll_after_ms === "number" && ux.poll_after_ms > 0) {
          waitMs = ux.poll_after_ms;
        }
        if (uxUnchangedStreak >= 3) {
          waitMs = Math.min(Math.round(waitMs * 1.2 + 1200), 12000);
        }
      }
      if (st.paid === true || st.status === "paid") {
        notify(lang === "th" ? "ชำระเงินสำเร็จ" : "Payment successful", "success");
        onPaid();
        return;
      }
      if (ux && ux.status === "completed") {
        notify(lang === "th" ? "ชำระเงินสำเร็จ" : "Payment successful", "success");
        onPaid();
        return;
      }
      if (ux && isTerminalUxPaymentStatus(ux.status) && ux.status !== "completed") {
        const msg =
          pickUxFailureMessage(ux, lang) ||
          (lang === "th"
            ? "ชำระเงินไม่สำเร็จหรือรายการอยู่ระหว่างตรวจสอบ — โปรดติดต่อสนับสนุน"
            : "Payment failed or pending review — contact support");
        onError(msg);
        return;
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
    onError(pollTimeoutUserMessage(lang));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: { applePay: "auto", googlePay: "auto" },
          }}
        />
      </div>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={busy || !stripe}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {lang === "th" ? "กำลังชำระเงิน…" : "Processing…"}
          </>
        ) : (
          <>
            <CreditCard className="w-5 h-5" />
            {lang === "th" ? "ยืนยันชำระเงิน" : "Confirm payment"}
          </>
        )}
      </button>
      <p className="text-xs text-center text-gray-500">
        {lang === "th"
          ? "รองรับบัตรเครดิต/เดบิต, Apple Pay และ Google Pay (ตามอุปกรณ์และเบราว์เซอร์)"
          : "Cards, Apple Pay, and Google Pay where supported"}
      </p>
      <p className="text-[11px] text-center text-gray-400 leading-snug">{paymentConfirmedViaServerFootnote(lang)}</p>
    </div>
  );
}

export const StripePaymentSection: React.FC<Props> = ({
  jobId,
  language = "th",
  discountAmount,
  hasInsurance,
  totalLabel,
  onPaid,
  onError,
  notify,
}) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  const prepareIntent = useCallback(async () => {
    setPreparing(true);
    setClientSecret(null);
    setPublishableKey(null);
    try {
      const out = await BackendPaymentService.createStripePaymentIntent({
        jobId,
        discountAmount,
        has_insurance: hasInsurance,
      });
      if (!out.clientSecret || !out.publishableKey) {
        onError("ไม่ได้รับ clientSecret จากเซิร์ฟเวอร์");
        return;
      }
      setPublishableKey(out.publishableKey);
      setClientSecret(out.clientSecret);
      notify(language === "th" ? "ฟอร์มชำระเงินพร้อมแล้ว" : "Checkout form is ready", "info");
    } catch (e: unknown) {
      const rl = parsePaymentRateLimitError(e);
      if (rl != null) {
        onError(rateLimitedCreatePaymentMessage(rl.retryAfterSec, language));
        return;
      }
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : language === "th" ? "สร้างรายการชำระไม่สำเร็จ" : "Could not start payment");
      onError(String(msg));
    } finally {
      setPreparing(false);
    }
  }, [jobId, discountAmount, hasInsurance, language, onError, notify]);

  if (!clientSecret || !stripePromise) {
    return (
      <div className="text-center space-y-4 py-4">
        <p className="text-sm text-gray-600">
          {language === "th" ? "ยอดชำระ" : "Pay"}{" "}
          <span className="font-bold text-gray-900">{totalLabel}</span>{" "}
          {language === "th" ? "— ปลอดภัยด้วย Stripe" : "— secured with Stripe"}
        </p>
        <button
          type="button"
          onClick={prepareIntent}
          disabled={preparing}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {preparing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {language === "th" ? "กำลังเตรียมชำระเงิน…" : "Preparing checkout…"}
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              {language === "th"
                ? "เปิดฟอร์มชำระเงิน (บัตร / Apple Pay / Google Pay)"
                : "Open checkout (card / Apple Pay / Google Pay)"}
            </>
          )}
        </button>
        <p className="text-[11px] text-gray-400 leading-snug">{paymentConfirmedViaServerFootnote(language)}</p>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#059669",
            borderRadius: "12px",
            fontFamily: "system-ui, sans-serif",
          },
        },
        locale: language === "en" ? "en" : "th",
      }}
    >
      <InnerCheckout
        lang={language}
        jobId={jobId}
        onPaid={onPaid}
        onError={onError}
        notify={notify}
      />
    </Elements>
  );
};
