'use client';

import { formatCatalogPrice } from '@/lib/format';
import { TtProductThumb } from './TtProductThumb';

type Props = {
  title: string;
  description?: string;
  variant?: string;
  qty: number;
  unitPriceMicro: number;
  imageUrl?: string;
  busy?: boolean;
  onQtyChange: (nextQty: number) => void;
};

export function TtFoodCartLine({
  title,
  description,
  variant,
  qty,
  unitPriceMicro,
  imageUrl,
  busy,
  onQtyChange,
}: Props) {
  const lineMicro = unitPriceMicro * qty;

  return (
    <div className="tt-food-cart-line-card">
      <TtProductThumb category="food" title={title} imageUrl={imageUrl} className="tt-food-cart-line-thumb" />
      <div className="tt-food-cart-line-body">
        <p className="tt-food-cart-line-title">{title}</p>
        {description && <p className="tt-food-cart-line-desc">{description}</p>}
        {variant && <p className="tt-food-cart-line-variant">{variant}</p>}
        <div className="tt-food-cart-line-foot">
          <div className="tt-food-qty-stepper">
            <button
              type="button"
              className="tt-food-qty-btn"
              disabled={busy}
              aria-label="ลดจำนวน"
              onClick={() => onQtyChange(qty - 1)}
            >
              −
            </button>
            <span className="tt-food-qty-num">{qty}</span>
            <button
              type="button"
              className="tt-food-qty-btn"
              disabled={busy}
              aria-label="เพิ่มจำนวน"
              onClick={() => onQtyChange(qty + 1)}
            >
              +
            </button>
          </div>
          <strong className="tt-food-cart-line-price">{formatCatalogPrice(lineMicro)}</strong>
        </div>
        <p className="tt-food-cart-qty">{formatCatalogPrice(unitPriceMicro)} / จาน</p>
      </div>
    </div>
  );
}
