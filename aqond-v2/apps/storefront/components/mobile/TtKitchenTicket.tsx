'use client';

import { formatCatalogPrice, formatDate } from '@/lib/format';
import { shareKotImage } from '@/lib/kotImage';

type Props = {
  order: any | null;
  open: boolean;
  onClose: () => void;
};

export function TtKitchenTicket({ order, open, onClose }: Props) {
  if (!open || !order) return null;

  const oid = order.order_id || order.id;
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="tt-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="tt-kot-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-merchant-order-sheet-head">
          <h2>🍳 ใบออเดอร์ครัว (KOT)</h2>
          <button type="button" className="tt-merchant-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="tt-kot-print-area" id="kot-print">
          <p><strong>#{String(oid).slice(-8)}</strong> · {order.merchant_name || 'ร้าน'}</p>
          {order.created_at && <p className="tt-hint">{formatDate(order.created_at)}</p>}
          {(order.recipient || order.phone) && (
            <p>👤 {order.recipient} {order.phone && `· ${order.phone}`}</p>
          )}
          {order.handoff_note && <p>📝 {order.handoff_note}</p>}
          <hr />
          <ul className="tt-kot-items">
            {items.map((it: any, idx: number) => (
              <li key={idx}>
                <strong>{it.qty || 1}x {it.title || it.product_id}</strong>
                {Array.isArray(it.options) && it.options.length > 0 && (
                  <span className="tt-hint"> · {it.options.map((o: any) => o.label).join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="tt-kot-total">{formatCatalogPrice(order.amount_micro || order.total_micro)}</p>
        </div>
        <div className="tt-kot-actions">
          <button type="button" className="tt-btn-primary" onClick={() => void shareKotImage(order)}>
            📤 แชร์/บันทึกรูป KOT
          </button>
          <button type="button" className="tt-btn-ghost" onClick={() => window.print()}>🖨️ พิมพ์</button>
        </div>
      </div>
    </div>
  );
}
