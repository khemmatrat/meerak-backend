/** Wallet/ledger amounts (1 unit = 1 micro of major currency). */
export function formatMicro(micro: number, currency = 'THB', locale = 'th-TH'): string {
  const amount = micro / 1_000_000;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Catalog product prices (catalog-svc: micro = satang, price_thb = micro/100). */
export function formatCatalogPrice(micro: number, currency = 'THB', locale = 'th-TH'): string {
  const amount = micro / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `฿${amount.toFixed(2)}`;
  }
}

export function catalogPriceThb(micro: number, priceThb?: number): number {
  if (priceThb != null && priceThb > 0) return priceThb;
  return micro / 100;
}

export function formatDate(iso: string, locale = 'th-TH'): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}
