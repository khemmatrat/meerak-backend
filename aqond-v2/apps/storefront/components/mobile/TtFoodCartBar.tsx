'use client';

import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import type { FoodCartView } from '@/lib/food';
import { etaShort } from '@/lib/food';

type Props = {
  cart: FoodCartView | null;
  href?: string;
};

export function TtFoodCartBar({ cart, href = '/m/food/cart' }: Props) {
  if (!cart || cart.count === 0) return null;

  return (
    <div className="tt-food-cart-bar">
      <Link href={href} className="tt-food-cart-bar-inner">
        <span className="tt-food-cart-count">{cart.count}</span>
        <div className="tt-food-cart-info">
          <strong>
            {cart.shop_count && cart.shop_count > 1
              ? `รถเข็น ${cart.shop_count} ร้าน`
              : 'ดูรถเข็นอาหาร'}
          </strong>
          <span>
            {formatCatalogPrice(cart.total_micro)}
            {' · '}
            ส่ง {etaShort(cart.eta || { label: cart.eta_label })}
          </span>
        </div>
        <span className="tt-food-cart-go">›</span>
      </Link>
    </div>
  );
}
