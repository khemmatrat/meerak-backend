'use client';

import { formatCatalogPrice } from '@/lib/format';
import { DELIVERY_MODES, type DeliveryMode } from '@/lib/food';
import type { FoodCartView } from '@/lib/food';

type Props = {
  cart: FoodCartView;
  onChange: (mode: DeliveryMode) => void;
  disabled?: boolean;
};

export function TtFoodDeliveryModes({ cart, onChange, disabled }: Props) {
  const quote = cart.delivery_quote;

  return (
    <div className="tt-food-delivery-modes">
      <h3 className="tt-food-delivery-title">เลือกแบบจัดส่ง</h3>
      {(cart.shop_count ?? 0) > 1 && (
        <p className="tt-food-batch-hint">
          🛵 {cart.shop_count} ร้านในรถเข็น
          {quote?.batch_eligible
            ? ` · รวมส่งละแวก${quote.batch_zone ? ` (${quote.batch_zone})` : ''} — โหมดประหยัดคุ้มสุด`
            : ' · ร้านห่างกัน — แนะนำส่งปกติ/ด่วน'}
        </p>
      )}
      <div className="tt-food-mode-list">
        {DELIVERY_MODES.map((m) => {
          const active = cart.delivery_mode === m.id;
          let feeLabel = '—';
          if (quote && m.id === cart.delivery_mode) {
            feeLabel = formatCatalogPrice(quote.total_micro);
          } else if (m.id === 'express' && quote) {
            const express = quote.per_shop.reduce((s, p) => s + p.express_micro, 0);
            feeLabel = formatCatalogPrice(express);
          } else if (m.id === 'normal' && quote) {
            const normal = quote.per_shop.reduce(
              (s, p) => s + Math.max(1400, Math.round(p.express_micro * 0.7)),
              0,
            );
            feeLabel = formatCatalogPrice(normal);
          } else if (m.id === 'saver') {
            feeLabel = (cart.shop_count ?? 0) >= 2 && quote?.batch_eligible ? '฿8–12' : '~฿10';
          }

          return (
            <button
              key={m.id}
              type="button"
              className={`tt-food-mode-card${active ? ' active' : ''}`}
              disabled={disabled}
              onClick={() => onChange(m.id)}
            >
              <div className="tt-food-mode-head">
                <strong>{m.label}</strong>
                <span>{feeLabel}</span>
              </div>
              <p>{m.hint}</p>
            </button>
          );
        })}
      </div>
      {quote?.rider_hint && (
        <p className="tt-food-rider-hint">{quote.rider_hint}</p>
      )}
    </div>
  );
}
