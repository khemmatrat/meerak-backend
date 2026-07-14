import type { PaymentAction } from '@/lib/checkout';

export const CHECKOUT_PAYMENT_KEY = 'aqond-m-checkout-payment';
export const CHECKOUT_PAYMENT_RESULT_KEY = 'aqond-m-checkout-payment-result';

export type CheckoutPaymentSession = {
  action: PaymentAction;
  expiresAt: number;
  orderIds?: string[];
  buyerId?: string;
};

export type PaymentResultSession = {
  status: 'success' | 'expired' | 'wrong_type' | 'failed';
  amount?: string;
  ref?: string;
  message?: string;
};

export function paymentQrImageUrl(action: PaymentAction, size = 280): string {
  if (action.qr_image_url) return action.qr_image_url;
  const payload = `|${action.ref}|${action.amount}|THB|AQOND`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

export function formatPaymentAmount(amount: string): string {
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `฿${n.toFixed(2)}`;
  }
}

export function formatPaymentExpiry(isoMs: number): string {
  return new Date(isoMs).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
