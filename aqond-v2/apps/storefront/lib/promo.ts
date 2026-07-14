import type { PaymentMethodId } from '@/lib/payment';

export type PromoResult = {
  ok: boolean;
  code?: string;
  codes?: string[];
  label?: string;
  discount_micro: number;
  apply_to?: 'subtotal' | 'delivery' | 'total';
  applied?: Array<{ code: string; discount_micro: number }>;
  error?: string;
  hint?: string;
};

export async function fetchPromoHints(context: 'food' | 'marketplace') {
  const res = await fetch(`/api/promo/validate?context=${context}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({ hints: [] }));
  return (data.hints || []) as Array<{ code: string; label: string }>;
}

export async function validatePromoCode(opts: {
  code: string;
  subtotalMicro: number;
  deliveryMicro?: number;
  context?: 'food' | 'marketplace';
  paymentMethod?: PaymentMethodId;
}): Promise<PromoResult> {
  const res = await fetch('/api/promo/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: opts.code,
      subtotal_micro: opts.subtotalMicro,
      delivery_micro: opts.deliveryMicro || 0,
      context: opts.context || 'any',
      payment_method: opts.paymentMethod,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, discount_micro: 0, error: data.error || 'โค้ดไม่ถูกต้อง' };
  }
  return data as PromoResult;
}

export async function validatePromoStack(opts: {
  codes: string[];
  subtotalMicro: number;
  deliveryMicro?: number;
}): Promise<PromoResult> {
  const res = await fetch('/api/promo/validate-stack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codes: opts.codes,
      subtotal_micro: opts.subtotalMicro,
      delivery_micro: opts.deliveryMicro || 0,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, discount_micro: 0, error: data.error || 'โค้ดไม่สามารถใช้ร่วมกันได้' };
  }
  return data as PromoResult;
}
