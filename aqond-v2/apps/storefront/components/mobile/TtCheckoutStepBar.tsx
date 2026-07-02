import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';

type Props = {
  current: 1 | 2;
  labels?: [string, string];
};

export function TtCheckoutStepBar({
  current,
  labels = ['รถเข็น · โค้ด & ชำระ', 'ที่อยู่ · ยืนยันสั่ง'],
}: Props) {
  return (
    <nav className="tt-checkout-steps" aria-label="ขั้นตอนสั่งซื้อ" data-testid="cart-checkout-steps">
      <div className={`tt-checkout-step${current === 1 ? ' tt-checkout-step-active' : ' tt-checkout-step-done'}`}>
        <span className="tt-checkout-step-num">1</span>
        <span className="tt-checkout-step-label">{labels[0]}</span>
      </div>
      <span className="tt-checkout-step-line" aria-hidden />
      <div className={`tt-checkout-step${current === 2 ? ' tt-checkout-step-active' : ''}`}>
        <span className="tt-checkout-step-num">2</span>
        <span className="tt-checkout-step-label">{labels[1]}</span>
      </div>
    </nav>
  );
}

export function TtCheckoutNextHint({ scope }: { scope: 'food' | 'shop' }) {
  const text =
    scope === 'food'
      ? 'ขั้นถัดไป: กรอกที่อยู่จัดส่งแล้วกดสั่งเลย'
      : 'ขั้นถัดไป: ที่อยู่ · โค้ดส่วนลด · ชำระเงิน';
  return (
    <p className="tt-checkout-next-hint">
      <span className="tt-checkout-next-icon">→</span> {text}
    </p>
  );
}

type SummaryProps = {
  payMethodLabel: string;
  promoCode?: string;
  promoLabel?: string;
  discountMicro?: number;
  editHref: string;
};

export function TtCheckoutPayPromoSummary({
  payMethodLabel,
  promoCode,
  promoLabel,
  discountMicro = 0,
  editHref,
}: SummaryProps) {
  return (
    <div className="tt-pay-promo-summary">
      <div className="tt-pay-promo-summary-head">
        <strong>โค้ดส่วนลด & ชำระเงิน</strong>
        <Link href={editHref} className="tt-link-accent tt-pay-promo-edit">
          แก้ไข
        </Link>
      </div>
      <p className="tt-pay-promo-summary-line">
        💳 {payMethodLabel}
      </p>
      {promoCode && discountMicro > 0 ? (
        <p className="tt-pay-promo-summary-line tt-discount-row">
          🏷 {promoCode} — {promoLabel || 'ส่วนลด'} (-{formatCatalogPrice(discountMicro)})
        </p>
      ) : (
        <p className="tt-pay-promo-summary-line tt-pay-promo-none">ไม่มีโค้ดส่วนลด</p>
      )}
    </div>
  );
}
