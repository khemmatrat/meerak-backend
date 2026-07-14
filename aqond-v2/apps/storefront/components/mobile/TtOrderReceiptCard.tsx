'use client';

import { formatCatalogPrice } from '@/lib/format';
import { paymentMethodLabel, type PaymentMethodId } from '@/lib/payment';
import type { TrackingOrderItem } from '@/lib/server/riderTracking';
import { IconLuxAqondStore, IconLuxReceipt, IconLuxToShip } from '@/components/mobile/TtLuxuryIcons';

type Props = {
  orderId: string;
  merchantName: string;
  items: TrackingOrderItem[];
  itemCount: number;
  totalMicro?: number;
  discountMicro?: number;
  paymentMethod?: string;
  compact?: boolean;
  luxury?: boolean;
};

export function TtOrderReceiptCard({
  orderId,
  merchantName,
  items,
  itemCount,
  totalMicro,
  discountMicro,
  paymentMethod,
  compact = false,
  luxury = true,
}: Props) {
  if (!items.length) return null;

  return (
    <section
      className={`tt-order-receipt-v2${compact ? ' compact' : ''}${luxury ? ' luxury' : ''}`}
      aria-label="รายการที่สั่ง"
    >
      <div className="tt-receipt-v2-head">
        <div className="tt-receipt-v2-badge" aria-hidden>
          {luxury ? <IconLuxReceipt size={compact ? 20 : 22} /> : '🧾'}
        </div>
        <div className="tt-receipt-v2-head-text">
          <h2>รายการที่สั่ง</h2>
          <p className="tt-receipt-v2-shop">
            {luxury && (
              <span className="tt-receipt-v2-shop-icon" aria-hidden>
                <IconLuxAqondStore size={14} />
              </span>
            )}
            {merchantName} · {itemCount} ชิ้น
          </p>
        </div>
        <span className="tt-receipt-v2-id">#{orderId.slice(-8)}</span>
      </div>

      <p className="tt-receipt-v2-trust">
        <span className="tt-receipt-v2-trust-icon">✓</span>
        ตรวจสอบก่อนรับ — ต้องตรงกับรายการนี้เท่านั้น
      </p>

      <ul className="tt-receipt-v2-list">
        {items.map((it) => {
          const line = (it.unit_price_micro || 0) * (it.qty || 1);
          return (
            <li key={it.item_id} className="tt-receipt-v2-item">
              <div className="tt-receipt-v2-thumb" aria-hidden>
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt="" />
                ) : luxury ? (
                  <IconLuxToShip size={22} />
                ) : (
                  <span>🍜</span>
                )}
              </div>
              <div className="tt-receipt-v2-item-body">
                <strong>{it.title}</strong>
                <span className="tt-receipt-v2-qty">
                  {it.unit_price_micro > 0
                    ? `${formatCatalogPrice(it.unit_price_micro)} × ${it.qty || 1}`
                    : `× ${it.qty || 1}`}
                </span>
              </div>
              {line > 0 && (
                <span className="tt-receipt-v2-price">{formatCatalogPrice(line)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {totalMicro != null && totalMicro > 0 && (
        <div className="tt-receipt-v2-foot">
          {discountMicro != null && discountMicro > 0 && (
            <div className="tt-receipt-v2-row discount">
              <span>ส่วนลด</span>
              <span>-{formatCatalogPrice(discountMicro)}</span>
            </div>
          )}
          <div className="tt-receipt-v2-row total">
            <span>
              ยอดชำระ
              {paymentMethod && (
                <em> · {paymentMethodLabel(paymentMethod as PaymentMethodId)}</em>
              )}
            </span>
            <strong>{formatCatalogPrice(totalMicro)}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
