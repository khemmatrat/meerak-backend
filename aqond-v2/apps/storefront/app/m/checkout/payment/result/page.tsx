'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CoPaymentResultPage } from '@/components/mobile/CoPaymentResultPage';
import {
  CHECKOUT_PAYMENT_KEY,
  CHECKOUT_PAYMENT_RESULT_KEY,
  type PaymentResultSession,
} from '@/lib/paymentQr';
import { recordPaymentResultTelemetry } from '@/lib/experience/scenarioTelemetry';

export default function CheckoutPaymentResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PaymentResultSession | null>(null);
  const telemetrySent = useRef(false);
  const viewStarted = useRef(typeof performance !== 'undefined' ? performance.now() : 0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_PAYMENT_RESULT_KEY);
      const status = searchParams.get('status') as PaymentResultSession['status'] | null;
      if (raw) {
        setResult(JSON.parse(raw) as PaymentResultSession);
        sessionStorage.removeItem(CHECKOUT_PAYMENT_KEY);
        return;
      }
      if (status) {
        setResult({ status });
        return;
      }
      router.replace('/m/checkout');
    } catch {
      router.replace('/m/checkout');
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!result || telemetrySent.current) return;
    telemetrySent.current = true;
    recordPaymentResultTelemetry({
      loadMs: Math.round(performance.now() - viewStarted.current),
      resultStatus: result.status,
      amount: result.amount,
      ref: result.ref,
      error: result.status === 'success' ? null : result.message || result.status,
    });
  }, [result]);

  if (!result) {
    return (
      <p className="tt-co-pro-loading" data-testid="checkout-payment-result-loading">
        กำลังโหลด...
      </p>
    );
  }

  return (
    <div data-testid="checkout-payment-result-page">
      <CoPaymentResultPage result={result} onBack={() => router.back()} />
    </div>
  );
}
