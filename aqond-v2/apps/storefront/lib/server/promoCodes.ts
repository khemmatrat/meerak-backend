export type PromoContext = 'food' | 'marketplace' | 'any';

export type PromoApplyTo = 'subtotal' | 'delivery' | 'total';

export type PromoRule = {
  code: string;
  label: string;
  context: PromoContext;
  apply_to: PromoApplyTo;
  /** fixed discount in satang (price_micro) */
  fixed_micro?: number;
  /** percent 1-100 */
  percent_bps?: number;
  max_discount_micro?: number;
  min_subtotal_micro?: number;
  payment_method?: string;
  free_delivery?: boolean;
};

const PROMOS: PromoRule[] = [
  {
    code: 'AQOND50',
    label: 'ลด 50 บาท',
    context: 'any',
    apply_to: 'subtotal',
    fixed_micro: 5000,
    min_subtotal_micro: 15000,
  },
  {
    code: 'FOOD10',
    label: 'ลด 10% อาหาร',
    context: 'food',
    apply_to: 'subtotal',
    percent_bps: 1000,
    max_discount_micro: 3000,
    min_subtotal_micro: 8000,
  },
  {
    code: 'FREESHIP',
    label: 'ส่งฟรี',
    context: 'any',
    apply_to: 'delivery',
    free_delivery: true,
  },
  {
    code: 'WELCOME',
    label: 'ลด 20 บาท สมาชิกใหม่',
    context: 'any',
    apply_to: 'subtotal',
    fixed_micro: 2000,
    min_subtotal_micro: 10000,
  },
  {
    code: 'TRUEMONEY',
    label: 'ลด 15 บาท จ่าย TrueMoney',
    context: 'any',
    apply_to: 'total',
    fixed_micro: 1500,
    payment_method: 'truemoney',
    min_subtotal_micro: 5000,
  },
];

export type PromoValidationInput = {
  code: string;
  subtotal_micro: number;
  delivery_micro?: number;
  context?: PromoContext;
  payment_method?: string;
};

export type PromoValidationResult = {
  ok: boolean;
  code?: string;
  label?: string;
  discount_micro: number;
  apply_to?: PromoApplyTo;
  error?: string;
  hint?: string;
};

function findRule(code: string) {
  return PROMOS.find((p) => p.code === code.trim().toUpperCase());
}

export function listPromoHints(context: PromoContext = 'any') {
  return PROMOS.filter((p) => p.context === 'any' || p.context === context).map((p) => ({
    code: p.code,
    label: p.label,
  }));
}

export function validatePromoCode(input: PromoValidationInput): PromoValidationResult {
  const rule = findRule(input.code);
  if (!rule) {
    return { ok: false, discount_micro: 0, error: 'ไม่พบโค้ดส่วนลดนี้' };
  }

  if (rule.context !== 'any' && input.context && rule.context !== input.context) {
    return { ok: false, discount_micro: 0, error: 'โค้ดนี้ใช้กับหมวดนี้ไม่ได้' };
  }

  if (rule.min_subtotal_micro && input.subtotal_micro < rule.min_subtotal_micro) {
    const min = (rule.min_subtotal_micro / 100).toFixed(0);
    return {
      ok: false,
      discount_micro: 0,
      error: `ยอดขั้นต่ำ ${min} บาท`,
    };
  }

  if (rule.payment_method && input.payment_method && input.payment_method !== rule.payment_method) {
    return {
      ok: false,
      discount_micro: 0,
      error: `โค้ดนี้ใช้กับ ${rule.payment_method === 'truemoney' ? 'TrueMoney' : rule.payment_method} เท่านั้น`,
      hint: rule.code === 'TRUEMONEY' ? 'เลือกชำระ TrueMoney Wallet' : undefined,
    };
  }

  const delivery = input.delivery_micro || 0;
  let discount = 0;

  if (rule.free_delivery) {
    discount = delivery;
  } else if (rule.fixed_micro) {
    discount = rule.fixed_micro;
  } else if (rule.percent_bps) {
    const base = rule.apply_to === 'delivery' ? delivery : input.subtotal_micro;
    discount = Math.round((base * rule.percent_bps) / 10_000);
    if (rule.max_discount_micro) {
      discount = Math.min(discount, rule.max_discount_micro);
    }
  }

  if (rule.apply_to === 'subtotal') {
    discount = Math.min(discount, input.subtotal_micro);
  } else if (rule.apply_to === 'delivery') {
    discount = Math.min(discount, delivery);
  } else {
    discount = Math.min(discount, input.subtotal_micro + delivery);
  }

  if (discount <= 0) {
    return { ok: false, discount_micro: 0, error: 'โค้ดนี้ใช้ไม่ได้กับยอดปัจจุบัน' };
  }

  return {
    ok: true,
    code: rule.code,
    label: rule.label,
    discount_micro: discount,
    apply_to: rule.apply_to,
    hint: `ใช้โค้ด ${rule.code} แล้ว — ${rule.label}`,
  };
}
