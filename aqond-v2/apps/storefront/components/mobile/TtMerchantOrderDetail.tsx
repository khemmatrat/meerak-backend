'use client';

import { formatCatalogPrice, formatDate } from '@/lib/format';
import { FULFILLMENT_LABELS } from '@/lib/merchant';

type Props = {
  order: any | null;
  open: boolean;
  onClose: () => void;
};

export function TtMerchantOrderDetail({ order, open, onClose }: Props) {
  if (!open || !order) return null;

  const oid = order.order_id || order.id;
  const fs = order.fulfillment_status || 'pending_accept';
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="tt-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tt-merchant-order-sheet"
        role="dialog"
        aria-labelledby="merchant-order-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tt-sheet-handle" aria-hidden />
        <div className="tt-merchant-order-sheet-head">
          <h2 id="merchant-order-title">
            {order.order_type === 'food' ? '🍱' : '📦'} ออเดอร์ #{String(oid).slice(-8)}
          </h2>
          <span className={`tt-order-status tt-status-${fs}`}>
            {FULFILLMENT_LABELS[fs] || fs}
          </span>
        </div>

        <div className="tt-merchant-order-sheet-meta">
          <p><strong>ยอดรวม</strong> {formatCatalogPrice(order.amount_micro || order.total_micro)}</p>
          {order.created_at && <p><strong>เวลา</strong> {formatDate(order.created_at)}</p>}
          {order.method && <p><strong>ชำระ</strong> {order.method}</p>}
        </div>

        {(order.recipient || order.phone || order.shipping_address) && (
          <div className="tt-merchant-order-block">
            <h3>📍 จัดส่ง / รับอาหาร</h3>
            {order.recipient && <p>{order.recipient}</p>}
            {order.phone && <p>📞 {order.phone}</p>}
            {order.shipping_address && <p className="tt-hint">{order.shipping_address}</p>}
            {order.handoff_note && <p className="tt-hint">📝 {order.handoff_note}</p>}
          </div>
        )}

        <div className="tt-merchant-order-block">
          <h3>🛒 รายการที่ลูกค้าสั่ง ({items.length})</h3>
          {items.length === 0 ? (
            <p className="tt-hint">ไม่มีรายละเอียดสินค้าในออเดอร์นี้</p>
          ) : (
            <ul className="tt-merchant-order-items">
              {items.map((it: any, idx: number) => {
                const qty = it.qty || 1;
                const unit = it.unit_price_micro || 0;
                return (
                  <li key={`${it.product_id || idx}-${idx}`} className="tt-merchant-order-line">
                    <div>
                      <strong>{it.title || it.product_id || 'สินค้า'}</strong>
                      {it.product_id && it.title && (
                        <span className="tt-hint"> · {it.product_id}</span>
                      )}
                    </div>
                    <div className="tt-merchant-order-line-end">
                      <span>x{qty}</span>
                      <strong>{formatCatalogPrice(unit * qty)}</strong>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {order.promo_code && (
          <p className="tt-hint">โค้ด: {order.promo_code}</p>
        )}

        <button type="button" className="tt-btn-primary tt-merchant-order-close" onClick={onClose}>
          ปิด
        </button>
      </div>
    </div>
  );
}
