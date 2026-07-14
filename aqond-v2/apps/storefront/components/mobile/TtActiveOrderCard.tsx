'use client';

import Link from 'next/link';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { marketplaceItemImageUrl } from '@/lib/marketplaceVisual';

type Props = {
  order: {
    order_id?: string;
    id?: string;
    merchant_name?: string;
    merchant_id?: string;
    status?: string;
    fulfillment_status?: string;
    amount_micro?: number;
    total_micro?: number;
    created_at?: string;
    delivery_eta_label?: string;
    tracking_no?: string;
    carrier_id?: string;
    order_type?: string;
    items?: Array<{
      product_id?: string;
      title?: string;
      qty?: number;
      unit_price_micro?: number;
      image_url?: string;
    }>;
  };
  trackHref: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'รอดำเนินการ',
  pending_payment: 'รอชำระ',
  paid: 'ชำระแล้ว',
  confirmed: 'ยืนยันแล้ว',
  preparing: 'กำลังเตรียม',
  shipped: 'กำลังจัดส่ง',
  pending_ship: 'รอจัดส่ง',
  pending_accept: 'รอร้านรับ',
  accepted: 'ร้านรับแล้ว',
  delivered: 'จัดส่งสำเร็จ',
};

export function TtActiveOrderCard({ order, trackHref }: Props) {
  const oid = String(order.order_id || order.id || '');
  const first = order.items?.[0];
  const imageUrl = first
    ? marketplaceItemImageUrl(
        first.product_id || first.title || 'item',
        first.title,
        oid,
        first.image_url,
      )
    : marketplaceItemImageUrl(undefined, undefined, oid);
  const status = order.fulfillment_status || order.status || 'pending';
  const total = order.amount_micro || order.total_micro || 0;

  return (
    <Link href={trackHref} className="tt-active-order-card">
      <div className="tt-active-order-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" />
      </div>
      <div className="tt-active-order-body">
        <div className="tt-active-order-top">
          <span className="tt-active-order-id">#{oid.slice(-8)}</span>
          <span className={`tt-active-order-status status-${status}`}>
            {STATUS_LABEL[status] || status}
          </span>
        </div>
        <p className="tt-active-order-shop">{order.merchant_name || order.merchant_id || 'ร้านค้า'}</p>
        {first && <p className="tt-active-order-item">{first.title}</p>}
        <p className="tt-active-order-meta">
          {formatCatalogPrice(total)}
          {order.created_at ? ` · ${formatDate(order.created_at)}` : ''}
        </p>
        {order.delivery_eta_label && (
          <p className="tt-active-order-eta">🕐 ETA {order.delivery_eta_label}</p>
        )}
        {order.tracking_no && (
          <p className="tt-active-order-track">📦 {order.tracking_no}</p>
        )}
      </div>
      <span className="tt-active-order-chevron" aria-hidden>›</span>
    </Link>
  );
}
