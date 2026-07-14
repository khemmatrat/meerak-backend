'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CoQrPaymentPage } from '@/components/mobile/CoQrPaymentPage';
import {
  CHECKOUT_PAYMENT_KEY,
  CHECKOUT_PAYMENT_RESULT_KEY,
  type CheckoutPaymentSession,
  type PaymentResultSession,
} from '@/lib/paymentQr';
import { recordPaymentUiTelemetry, recordPaymentVerifyTelemetry } from '@/lib/experience/scenarioTelemetry';

export default function CheckoutPaymentPage() {
  const router = useRouter();
  const [session, setSession] = useState<CheckoutPaymentSession | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [expiredHandled, setExpiredHandled] = useState(false);
  const telemetrySent = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_PAYMENT_KEY);
      if (!raw) {
        router.replace('/m/checkout');
        return;
      }
      setSession(JSON.parse(raw) as CheckoutPaymentSession);
    } catch {
      router.replace('/m/checkout');
    }
  }, [router]);

  useEffect(() => {
    if (!session || telemetrySent.current) return;
    telemetrySent.current = true;
    const expired = Date.now() > session.expiresAt;
    recordPaymentUiTelemetry({
      loadMs: 0,
      orderIds: session.orderIds,
      amount: session.action.amount,
      ref: session.action.ref,
      paymentMethod: session.action.type === 'qr' ? 'promptpay' : session.action.type,
      expired,
    });
  }, [session]);

  const goResult = useCallback(
    (result: PaymentResultSession) => {
      sessionStorage.setItem(CHECKOUT_PAYMENT_RESULT_KEY, JSON.stringify(result));
      sessionStorage.removeItem(CHECKOUT_PAYMENT_KEY);
      router.replace(`/m/checkout/payment/result?status=${result.status}`);
    },
    [router],
  );

  const handleExpired = useCallback(() => {
    if (expiredHandled || !session) return;
    setExpiredHandled(true);
    goResult({
      status: 'expired',
      amount: session.action.amount,
      ref: session.action.ref,
      message: 'ขออภัย การชำระเงินหมดอายุแล้ว กรุณาสั่งซื้อใหม่หรือเลือกช่องทางชำระเงินอื่น',
    });
  }, [expiredHandled, goResult, session]);

  const handleConfirm = useCallback(async () => {
    if (!session || confirming) return;
    if (Date.now() > session.expiresAt) {
      handleExpired();
      return;
    }
    setConfirming(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/checkout/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: session.action.ref,
          order_ids: session.orderIds || [],
          buyer_id: session.buyerId,
          expires_at: session.expiresAt,
          amount: session.action.amount,
          intent_id: session.action.intent_id,
          payso_reference_id: session.action.payso_reference_id || session.action.ref,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const status = (data.status || 'failed') as PaymentResultSession['status'];
      recordPaymentVerifyTelemetry({
        loadMs: Math.round(performance.now() - t0),
        orderIds: session.orderIds,
        ref: session.action.ref,
        verifyStatus: status,
        duplicate: Boolean(data.duplicate),
        error: status === 'failed' || status === 'wrong_type' ? data.message : null,
      });
      goResult({
        status,
        amount: session.action.amount,
        ref: session.action.ref,
        message: data.message,
      });
    } catch {
      goResult({
        status: 'failed',
        amount: session.action.amount,
        ref: session.action.ref,
        message: 'ไม่สามารถยืนยันการชำระเงินได้ กรุณาลองใหม่',
      });
    } finally {
      setConfirming(false);
    }
  }, [confirming, goResult, handleExpired, session]);

  if (!session) {
    return <p className="tt-co-pro-loading">กำลังโหลด...</p>;
  }

  return (
    <>
      <CoQrPaymentPage
        action={session.action}
        expiresAt={session.expiresAt}
        confirming={confirming}
        onBack={() => router.back()}
        onExpired={handleExpired}
        onConfirm={handleConfirm}
      />
    </>
  );
}
