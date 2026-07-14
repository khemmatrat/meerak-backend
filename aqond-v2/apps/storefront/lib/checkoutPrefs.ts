import type { PaymentMethodId } from '@/lib/payment';
import type { PromoResult } from '@/lib/promo';

export type CheckoutPrefs = {
  payMethod: PaymentMethodId;
  promo: PromoResult | null;
};

const DEFAULT: CheckoutPrefs = { payMethod: 'cod', promo: null };

function key(scope: 'food' | 'shop', owner: string) {
  return `aqond-${scope}-checkout-prefs:${owner}`;
}

export function loadCheckoutPrefs(scope: 'food' | 'shop', owner: string): CheckoutPrefs {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(key(scope, owner));
    if (!raw) return DEFAULT;
    const data = JSON.parse(raw) as CheckoutPrefs;
    return {
      payMethod: data.payMethod || 'cod',
      promo: data.promo?.ok ? data.promo : null,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveCheckoutPrefs(scope: 'food' | 'shop', owner: string, prefs: CheckoutPrefs) {
  try {
    localStorage.setItem(key(scope, owner), JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}
