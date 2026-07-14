'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCartOwner } from '@/lib/cartOwner';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/payment';
import { TtOrderReceiptCard } from '@/components/mobile/TtOrderReceiptCard';
import {
  IconLuxAqondStore,
  IconLuxChat,
  IconLuxPin,
  IconLuxReturn,
  IconLuxShield,
  IconLuxToReceive,
  IconLuxToShip,
} from '@/components/mobile/TtLuxuryIcons';
import { shopChatHref } from '@/lib/shopChat';
import { marketplaceItemImageUrl } from '@/lib/marketplaceVisual';
import { inferOrderChannel } from '@/lib/supportChannel';
import { supportHref } from '@/lib/supportTicketClient';

export default function OrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = String(params.id || '');
  const { ownerId } = useCartOwner();
  const buyerId = searchParams.get('buyer_id') || ownerId || 'guest';
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders?buyer_id=${encodeURIComponent(buyerId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const hit = (d.orders || []).find((o: any) => String(o.order_id || o.id) === orderId);
        setOrder(hit || null);
      })
      .finally(() => setLoading(false));
  }, [buyerId, orderId]);

  if (loading) return <p className="tt-loading">กำลังโหลด…</p>;
  if (!order) {
    return (
      <div className="tt-rr-page">
        <header className="tt-rr-header">
          <Link href="/m/orders" className="tt-rr-back">‹</Link>
          <h1>รายละเอียดคำสั่งซื้อ</h1>
        </header>
        <p className="tt-rr-empty">ไม่พบออเดอร์</p>
      </div>
    );
  }

  const channel = inferOrderChannel(order);
  const supportLink = supportHref({
    channel,
    order_id: orderId,
    merchant_id: order.merchant_id,
    subject: `ออเดอร์ #${orderId.slice(-8)}`,
  });

  return (
    <div className="tt-rr-page">
      <header className="tt-rr-header">
        <Link href="/m/orders" className="tt-rr-back">‹</Link>
        <h1>รายละเอียดคำสั่งซื้อ</h1>
      </header>

      <section className="tt-rr-panel tt-od-ship">
        <p className="tt-od-ship-status tt-od-ship-status-lux">
          <span className="tt-od-ship-icon" aria-hidden>
            {order.tracking_no ? <IconLuxToReceive size={20} /> : <IconLuxToShip size={20} />}
          </span>
          {order.tracking_no ? order.tracking_no : order.fulfillment_status || order.status}
        </p>
        {order.created_at && <p className="tt-hint">{formatDate(order.created_at)}</p>}
        <div className="tt-od-policy-banner">
          <span className="tt-od-policy-icon" aria-hidden>
            <IconLuxShield size={20} />
          </span>
          <div>
            <strong>เช็กก่อนจ่าย คืนได้ทันที</strong>
            <Link href="/m/help">ข้อมูลเพิ่มเติม</Link>
          </div>
        </div>
      </section>

      {(order.recipient || order.shipping_address) && (
        <section className="tt-rr-panel tt-od-address">
          <p className="tt-od-addr-line">
            <span className="tt-od-addr-pin" aria-hidden><IconLuxPin size={18} /></span>
            {order.recipient}
          </p>
          <p>{order.phone}</p>
          <p>{order.shipping_address}</p>
        </section>
      )}

      <section className="tt-rr-panel">
        <Link href={`/m/shop/${order.merchant_id}`} className="tt-rr-shop-row">
          <span className="tt-rr-shop-icon" aria-hidden>
            <IconLuxAqondStore size={20} />
          </span>
          {order.merchant_name || order.merchant_id}
          <span className="tt-rr-shop-chevron">›</span>
        </Link>
        {Array.isArray(order.items) && (
          <TtOrderReceiptCard
            orderId={orderId}
            merchantName={order.merchant_name || 'ร้านค้า'}
            items={order.items.map((it: any, idx: number) => ({
              item_id: it.product_id || `item-${idx}`,
              title: it.title || it.product_id,
              qty: it.qty || 1,
              unit_price_micro: it.unit_price_micro || 0,
              image_url: marketplaceItemImageUrl(it.product_id, it.title, orderId, it.image_url),
            }))}
            itemCount={order.items.reduce((n: number, it: any) => n + (it.qty || 1), 0)}
            totalMicro={order.amount_micro || order.total_micro}
            compact
          />
        )}
        <p className="tt-od-total">รวมคำสั่งซื้อ: {formatCatalogPrice(order.amount_micro || 0)}</p>
      </section>

      <section className="tt-rr-panel tt-rr-services">
        <h3>บริการหลังการขาย</h3>
        <Link href={`/m/orders/${orderId}/return?buyer_id=${encodeURIComponent(buyerId)}`} className="tt-rr-service-row">
          <span className="tt-rr-service-icon" aria-hidden>
            <IconLuxReturn size={20} />
          </span>
          ขอคืนเงิน <em>›</em>
        </Link>
        <Link href={shopChatHref(order.merchant_id || 'demo-merchant', { orderId })} className="tt-rr-service-row">
          <span className="tt-rr-service-icon" aria-hidden>
            <IconLuxChat size={18} />
          </span>
          ติดต่อผู้ขาย <em>›</em>
        </Link>
        <Link href={supportLink} className="tt-rr-service-row">
          <span className="tt-rr-service-icon" aria-hidden>
            <IconLuxShield size={20} />
          </span>
          Customer Service ({channel}) <em>›</em>
        </Link>
      </section>

      <section className="tt-rr-panel tt-od-meta">
        <p>หมายเลขคำสั่งซื้อ: {orderId.slice(-12).toUpperCase()}</p>
        <p>ชำระผ่าน {paymentMethodLabel(order.method || 'promptpay')}</p>
      </section>

      <div className="tt-od-footer">
        <Link href={`/m/orders/${orderId}/return?buyer_id=${encodeURIComponent(buyerId)}`} className="tt-od-btn ghost">
          ขอคืนเงิน
        </Link>
        <Link href={`/m/orders/${orderId}/track`} className="tt-od-btn primary">
          ติดตามคำสั่งซื้อ
        </Link>
      </div>
    </div>
  );
}
