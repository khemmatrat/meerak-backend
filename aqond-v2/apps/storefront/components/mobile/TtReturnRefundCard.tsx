'use client';

import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import { IconLuxAqondStore } from '@/components/mobile/TtLuxuryIcons';

type Item = {
  title: string;
  qty: number;
  unit_price_micro: number;
  variation?: string;
  image_url?: string;
};

type Props = {
  returnId: string;
  orderId: string;
  buyerId: string;
  merchantName?: string;
  statusLabel: string;
  refundAmountThb?: string;
  items?: Item[];
};

export function TtReturnRefundCard({
  orderId,
  buyerId,
  merchantName,
  statusLabel,
  refundAmountThb,
  items = [],
}: Props) {
  const first = items[0];
  const purchaseMicro = first ? first.unit_price_micro * first.qty : 0;
  const completed =
    statusLabel.includes('คืนเงินแล้ว') ||
    statusLabel.includes('สำเร็จ') ||
    statusLabel.includes('คืนเงินสำเร็จ');
  const escrow = statusLabel.includes('Escrow');

  return (
    <article className="tt-rr-card tt-rr-card-v3">
      <div className="tt-rr-card-head">
        <Link
          href={`/m/orders/${orderId}?buyer_id=${encodeURIComponent(buyerId)}`}
          className="tt-rr-shop"
        >
          <span className="tt-rr-shop-icon" aria-hidden>
            <IconLuxAqondStore size={18} />
          </span>
          {merchantName || 'ร้านค้า'}
          <span className="tt-rr-shop-chevron">›</span>
        </Link>
        <span
          className={`tt-rr-status-pill${completed ? ' done' : ''}${escrow ? ' escrow' : ''}`}
        >
          {statusLabel}
        </span>
      </div>

      {first && (
        <div className="tt-rr-card-body">
          <div className="tt-rr-thumb">
            {first.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={first.image_url} alt="" />
            ) : (
              <span>📦</span>
            )}
          </div>
          <div className="tt-rr-product-body">
            <p className="tt-rr-title">{first.title}</p>
            {first.variation && <p className="tt-rr-variation">{first.variation}</p>}
            <div className="tt-rr-price-row">
              {purchaseMicro > 0 && (
                <span className="tt-rr-purchase">{formatCatalogPrice(purchaseMicro)}</span>
              )}
              <span className="tt-rr-qty">x{first.qty}</span>
            </div>
          </div>
        </div>
      )}

      {refundAmountThb && (
        <div className="tt-rr-refund-row">
          <span>จำนวนเงินคืน (ทั้งออเดอร์)</span>
          <strong>฿{refundAmountThb}</strong>
        </div>
      )}

      <div className="tt-rr-card-foot">
        <Link
          href={`/m/orders/${orderId}/refund?buyer_id=${encodeURIComponent(buyerId)}`}
          className="tt-rr-detail-btn"
        >
          ดูรายละเอียด
        </Link>
      </div>
    </article>
  );
}
