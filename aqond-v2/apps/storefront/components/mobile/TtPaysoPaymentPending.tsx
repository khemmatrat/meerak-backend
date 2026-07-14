'use client';

import type { PaymentAction } from '@/lib/checkout';
import { CoQrPaymentPage } from '@/components/mobile/CoQrPaymentPage';

type Props = {
  action: PaymentAction;
  onDone: () => void;
};

const PAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function TtPaysoPaymentPending({ action, onDone }: Props) {
  return (
    <div className="tt-co-qr-overlay">
      <CoQrPaymentPage
        action={action}
        expiresAt={Date.now() + PAY_WINDOW_MS}
        onConfirm={onDone}
        onExpired={onDone}
        onBack={onDone}
      />
    </div>
  );
}
