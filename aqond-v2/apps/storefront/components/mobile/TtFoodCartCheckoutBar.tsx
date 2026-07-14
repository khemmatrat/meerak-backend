'use client';

import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';

type Props = {
  totalMicro: number;
  itemCount: number;
  etaLabel?: string;
  disabled?: boolean;
  href: string;
  onNavigate?: () => void;
};

export function TtFoodCartCheckoutBar({
  totalMicro,
  itemCount,
  etaLabel,
  disabled,
  href,
  onNavigate,
}: Props) {
  return (
    <div className="tt-food-cart-checkout-bar">
      <div className="tt-food-cart-checkout-bar-inner">
        <div className="tt-food-cart-checkout-meta">
          <strong>{formatCatalogPrice(totalMicro)}</strong>
          <span>
            {itemCount} รายการ
            {etaLabel ? ` · ส่ง ${etaLabel}` : ''}
          </span>
        </div>
        <Link
          href={href}
          onClick={onNavigate}
          className={`tt-food-cart-checkout-cta${disabled ? ' is-disabled' : ''}`}
          aria-disabled={disabled}
          style={{
            pointerEvents: disabled ? 'none' : undefined,
            opacity: disabled ? 0.55 : 1,
          }}
        >
          สั่งเลย
        </Link>
      </div>
    </div>
  );
}
