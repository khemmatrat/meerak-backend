/** Server-only coupon-svc client with local promo fallback. */

import { couponApi as couponApiBase } from '@/lib/server-env';
import { validatePromoCode, type PromoContext, type PromoValidationResult } from '@/lib/server/promoCodes';

export type CouponValidateInput = {
  user_id?: string;
  code: string;
  subtotal_micro: number;
  delivery_micro?: number;
  context?: PromoContext;
  payment_method?: string;
};

function couponApi(path: string): string {
  return couponApiBase(path);
}

/** Try coupon-svc first; fall back to local promoCodes when service is down or code is context-specific. */
export async function resolvePromoDiscount(input: CouponValidateInput): Promise<PromoValidationResult> {
  const code = input.code?.trim();
  if (!code) {
    return { ok: false, discount_micro: 0, error: 'กรุณาระบุโค้ดส่วนลด' };
  }

  const fromSvc = await validateCouponViaSvc(input);
  if (fromSvc.ok) return fromSvc;
  if (fromSvc.reason === 'service_unavailable') {
    return validatePromoCode({
      code,
      subtotal_micro: input.subtotal_micro,
      delivery_micro: input.delivery_micro,
      context: input.context,
      payment_method: input.payment_method,
    });
  }

  const local = validatePromoCode({
    code,
    subtotal_micro: input.subtotal_micro,
    delivery_micro: input.delivery_micro,
    context: input.context,
    payment_method: input.payment_method,
  });
  if (local.ok) return local;

  return {
    ok: false,
    discount_micro: 0,
    error: fromSvc.error || local.error || 'โค้ดส่วนลดไม่ถูกต้อง',
  };
}

export type PromoStackResult = {
  ok: boolean;
  discount_micro: number;
  codes?: string[];
  applied?: Array<{ code: string; discount_micro: number }>;
  error?: string;
};

export async function resolvePromoStack(input: {
  user_id?: string;
  codes: string[];
  subtotal_micro: number;
  delivery_micro?: number;
}): Promise<PromoStackResult> {
  const codes = input.codes.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!codes.length) {
    return { ok: false, discount_micro: 0, error: 'กรุณาระบุโค้ดส่วนลด' };
  }
  if (codes.length === 1) {
    const one = await resolvePromoDiscount({ ...input, code: codes[0] });
    return one.ok
      ? { ok: true, discount_micro: one.discount_micro, codes: [one.code || codes[0]], applied: [{ code: one.code || codes[0], discount_micro: one.discount_micro }] }
      : { ok: false, discount_micro: 0, error: one.error };
  }
  try {
    const res = await fetch(couponApi('/v1/coupons/validate-stack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        user_id: input.user_id || 'guest',
        codes,
        subtotal_micro: input.subtotal_micro,
        delivery_micro: input.delivery_micro || 0,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.valid) {
      return { ok: false, discount_micro: 0, error: data.reason || 'โค้ดไม่สามารถใช้ร่วมกันได้' };
    }
    return {
      ok: true,
      discount_micro: Number(data.discount_micro) || 0,
      codes: (data.applied || []).map((a: { code: string }) => a.code),
      applied: data.applied,
    };
  } catch {
    let total = 0;
    const applied: Array<{ code: string; discount_micro: number }> = [];
    for (const code of codes) {
      const r = await resolvePromoDiscount({ ...input, code });
      if (!r.ok) return { ok: false, discount_micro: 0, error: r.error };
      total += r.discount_micro;
      applied.push({ code: r.code || code, discount_micro: r.discount_micro });
    }
    return { ok: true, discount_micro: total, codes: applied.map((a) => a.code), applied };
  }
}

type SvcResult = PromoValidationResult & { reason?: string };

async function validateCouponViaSvc(input: CouponValidateInput): Promise<SvcResult> {
  try {
    const res = await fetch(couponApi('/v1/coupons/validate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        user_id: input.user_id || 'guest',
        code: input.code.trim().toUpperCase(),
        subtotal_micro: input.subtotal_micro,
      }),
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status >= 500) {
        return { ok: false, discount_micro: 0, reason: 'service_unavailable' };
      }
      return { ok: false, discount_micro: 0, error: data.reason || 'โค้ดไม่ถูกต้อง' };
    }
    if (!data.valid) {
      if (data.reason === 'invalid_or_expired') {
        return { ok: false, discount_micro: 0, error: 'ไม่พบโค้ดส่วนลดนี้' };
      }
      if (data.reason === 'min_subtotal') {
        const min = ((data.min_subtotal_micro || 0) / 100).toFixed(0);
        return { ok: false, discount_micro: 0, error: `ยอดขั้นต่ำ ${min} บาท` };
      }
      return { ok: false, discount_micro: 0, error: 'โค้ดนี้ใช้ไม่ได้กับยอดปัจจุบัน' };
    }

    let discount = Number(data.discount_micro) || 0;
    const delivery = input.delivery_micro || 0;

    if (input.code.trim().toUpperCase() === 'FREESHIP' && delivery > 0) {
      discount = delivery;
    } else if (data.kind === 'percent') {
      discount = Math.min(discount, input.subtotal_micro);
    } else {
      discount = Math.min(discount, input.subtotal_micro + delivery);
    }

    if (discount <= 0) {
      return { ok: false, discount_micro: 0, error: 'โค้ดนี้ใช้ไม่ได้กับยอดปัจจุบัน' };
    }

    const codeUpper = input.code.trim().toUpperCase();
    if (codeUpper === 'FOOD10' && input.context === 'marketplace') {
      return { ok: false, discount_micro: 0, error: 'โค้ดนี้ใช้กับหมวดนี้ไม่ได้' };
    }

    return {
      ok: true,
      code: data.code || input.code.trim().toUpperCase(),
      label: data.code || input.code.trim().toUpperCase(),
      discount_micro: discount,
      apply_to: input.code.trim().toUpperCase() === 'FREESHIP' ? 'delivery' : 'subtotal',
      hint: `ใช้โค้ด ${data.code} แล้ว`,
    };
  } catch {
    return { ok: false, discount_micro: 0, reason: 'service_unavailable' };
  }
}

export async function fetchCouponCatalog(): Promise<Array<{ code: string; label: string }>> {
  try {
    const res = await fetch(couponApi('/v1/coupons/catalog'), {
      headers: { 'X-Aqond-Region': 'TH' },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 60 },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return (data.coupons || []).map((c: { code: string; kind: string; value_bps?: number; value_micro?: number }) => ({
      code: c.code,
      label: c.kind === 'percent' ? `ลด ${(c.value_bps || 0) / 100}%` : `ลด ${((c.value_micro || 0) / 100).toFixed(0)} บาท`,
    }));
  } catch {
    return [];
  }
}
