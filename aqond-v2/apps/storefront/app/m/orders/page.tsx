'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useCartOwner } from '@/lib/cartOwner';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/payment';
import { foodItemImageUrl } from '@/lib/foodVisual';
import { FULFILLMENT_LABELS } from '@/lib/merchant';
import { reorderOrder, receiptPdfUrl } from '@/lib/orders';
import { useRouter } from 'next/navigation';
import { TtOrderReceiptCard } from '@/components/mobile/TtOrderReceiptCard';
import { TtDisputeReportSheet } from '@/components/mobile/TtDisputeReportSheet';
import { MpPurchasesSection } from '@/components/mobile/MpPurchasesSection';
import {
  ORDER_TABS,
  countOrdersByTab,
  filterOrdersByTab,
  type OrderTab,
} from '@/lib/ordersHub';

const STATUS_LABEL: Record<string, string> = {
  pending: 'รอดำเนินการ',
  pending_payment: 'รอชำระเงิน',
  paid: 'ชำระแล้ว',
  confirmed: 'ยืนยันแล้ว',
  completed: 'สำเร็จ',
  shipped: 'จัดส่งแล้ว',
  cancelled: 'ยกเลิก',
};

function parseTab(raw: string | null): OrderTab {
  if (raw === 'topay' || raw === 'toship' || raw === 'toreceive' || raw === 'torate') return raw;
  return 'all';
}

export default function MobileOrdersPage() {
  const { auth } = useAuth();
  const { ownerId, ready: ownerReady } = useCartOwner();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const owner = ownerId || auth?.userId || 'guest';
  const placedOrderId = searchParams.get('placed');
  const placedPayment = searchParams.get('payment');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disputeOrder, setDisputeOrder] = useState<any | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (!ownerReady && !auth?.userId) return;
    fetch(`/api/orders?buyer_id=${encodeURIComponent(owner)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ orders: [] }))
      .finally(() => setLoading(false));
  }, [owner, ownerReady, auth?.userId]);

  const orders = data?.orders || [];
  const counts = useMemo(() => countOrdersByTab(orders), [orders]);
  const filtered = useMemo(() => filterOrdersByTab(orders, tab), [orders, tab]);
  const tabLabel = ORDER_TABS.find((t) => t.id === tab)?.label;

  return (
    <div className="tt-mp-orders tt-mp-me-page">
      <header className="tt-mp-orders-header">
        <Link href="/m/account" className="tt-mp-orders-back" aria-label="กลับ">
          ‹
        </Link>
        <h1>การซื้อของฉัน</h1>
        <Link href="/m/cart" className="tt-mp-orders-cart" aria-label="รถเข็น">
          🛒
        </Link>
      </header>

      {placedOrderId && (
        <div className="tt-order-success-banner" data-testid="order-success-banner" role="status">
          <strong>สั่งซื้อสำเร็จ ✓</strong>
          <p>
            หมายเลขคำสั่งซื้อ: <code data-testid="order-success-id">{placedOrderId}</code>
            {placedPayment ? ` · สถานะชำระเงิน: ${placedPayment}` : ''}
          </p>
        </div>
      )}

      <MpPurchasesSection
        counts={counts}
        activeTab={tab === 'all' ? undefined : tab}
        showHistoryLink={false}
        hideTitle
      />

      <Link href="/m/orders/active" className="tt-mp-order-active-banner">
        <span className="tt-mp-order-active-icon" aria-hidden>🚚</span>
        <span className="tt-mp-order-active-text">ติดตามออเดอร์ที่กำลังส่ง</span>
        <strong>ดูทั้งหมด</strong>
      </Link>

      {loading && <p className="tt-loading">กำลังโหลด...</p>}
      {actionMsg && <p className="tt-hint tt-order-action-msg">{actionMsg}</p>}

      {!loading && tab !== 'all' && tabLabel && (
        <div className="tt-mp-orders-tab-chip">
          <span>{tabLabel}</span>
          <em>{filtered.length}</em>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="tt-empty-cart">
          <div className="tt-empty-icon">📦</div>
          <h1 className="tt-empty-title">ยังไม่มีคำสั่งซื้อในหมวดนี้</h1>
          <p className="tt-empty-sub">สั่งซื้อครั้งแรกแล้วติดตามสถานะได้ที่นี่</p>
          <Link href="/m/home" className="tt-btn-primary">
            เริ่มช้อป
          </Link>
        </div>
      )}

      <div className="tt-order-list">
        {filtered.map((o: any) => {
          const oid = o.order_id || o.id;
          const status = o.status || 'pending';
          const fs = o.fulfillment_status;
          const tracking = o.tracking_no;
          const isFood =
            o.order_type === 'food' ||
            o.carrier_id === 'aqond-rider' ||
            String(o.merchant_id || '').startsWith('food-');
          const fsLabel = fs ? FULFILLMENT_LABELS[fs] : undefined;
          return (
            <article key={oid} className="tt-order-card tt-order-card-v3" data-testid={`order-card-${oid}`}>
              <div className="tt-order-head">
                <div className="tt-order-head-main">
                  <span className="tt-order-id">#{String(oid).slice(-8)}</span>
                  {o.merchant_name && (
                    <span className="tt-order-shop">{o.merchant_name}</span>
                  )}
                </div>
                <span className={`tt-order-status tt-status-${status}${fs ? ` tt-fs-${fs}` : ''}`}>
                  {fsLabel || STATUS_LABEL[status] || status}
                </span>
              </div>

              <div className="tt-order-card-body">
              {Array.isArray(o.items) && o.items.length > 0 && (
                <TtOrderReceiptCard
                  orderId={String(oid)}
                  merchantName={o.merchant_name || 'ร้านค้า'}
                  items={o.items.map((it: any, idx: number) => ({
                    item_id: it.product_id || `item-${idx}`,
                    title: it.title || it.product_id || 'สินค้า',
                    qty: it.qty || 1,
                    unit_price_micro: it.unit_price_micro || 0,
                    image_url: foodItemImageUrl(it.product_id, it.title),
                  }))}
                  itemCount={o.items.reduce((n: number, it: any) => n + (it.qty || 1), 0)}
                  totalMicro={o.amount_micro || o.total_micro}
                  discountMicro={o.discount_micro}
                  paymentMethod={o.method}
                  compact
                />
              )}
              {(o.recipient || o.shipping_address) && (
                <div className="tt-order-delivery">
                  <p className="tt-order-delivery-label">ส่งมอบให้</p>
                  <div className="tt-order-delivery-body">
                    {o.recipient && <p className="tt-order-delivery-name">{o.recipient}</p>}
                    {o.shipping_address && <p className="tt-order-delivery-addr">{o.shipping_address}</p>}
                    {o.phone && <p className="tt-order-delivery-phone">{o.phone}</p>}
                  </div>
                </div>
              )}
              <p className="tt-order-meta">
                {o.created_at && formatDate(o.created_at)}
                {o.method && ` · ${paymentMethodLabel(o.method)}`}
              </p>
              </div>

              <div className="tt-order-card-foot">
              {status === 'pending_payment' && (
                <Link href="/m/checkout" className="tt-btn-primary tt-order-track-btn">
                  ชำระเงิน
                </Link>
              )}
              {isFood && (
                <Link href={`/m/food/track/${oid}`} className="tt-btn-primary tt-order-track-btn">
                  ติดตามไรเดอร์ Live
                </Link>
              )}
              {!isFood && (tracking || fs === 'shipped' || fs === 'delivered') && (
                <Link href={`/m/orders/${oid}/track`} className="tt-btn-primary tt-order-track-btn">
                  ติดตามพัสดุ
                </Link>
              )}
              <div className="tt-order-actions-row">
                <button
                  type="button"
                  className="tt-order-reorder-btn tt-order-action-btn"
                  onClick={() => {
                    void reorderOrder(String(oid), owner)
                      .then((r) => {
                        sessionStorage.setItem('aqond_reorder', JSON.stringify(r));
                        setActionMsg('เพิ่มรายการจากออเดอร์เก่าแล้ว');
                        router.push(r.redirect);
                      })
                      .catch((e: Error) => setActionMsg(e.message));
                  }}
                >
                  สั่งซ้ำ
                </button>
                <a
                  href={receiptPdfUrl(String(oid), owner)}
                  className="tt-btn-ghost tt-order-action-btn"
                  target="_blank"
                  rel="noreferrer"
                >
                  ใบเสร็จ PDF
                </a>
              </div>
              <button
                type="button"
                className="tt-btn-ghost tt-order-dispute-btn"
                onClick={() => setDisputeOrder(o)}
              >
                🛡️ แจ้งปัญหา
              </button>
              </div>
            </article>
          );
        })}
      </div>

      <TtDisputeReportSheet
        open={!!disputeOrder}
        onClose={() => setDisputeOrder(null)}
        orderId={String(disputeOrder?.order_id || disputeOrder?.id || '')}
        merchantId={disputeOrder?.merchant_id || 'demo-merchant'}
        customerId={owner}
        orderType={
          disputeOrder?.order_type === 'food' || String(disputeOrder?.merchant_id || '').startsWith('food-')
            ? 'food'
            : 'marketplace'
        }
        orderTotalMicro={disputeOrder?.amount_micro || disputeOrder?.total_micro || 0}
        items={(disputeOrder?.items || []).map((it: any, idx: number) => ({
          product_id: it.product_id || `item-${idx}`,
          title: it.title || it.product_id,
          qty: it.qty || 1,
          unit_price_micro: it.unit_price_micro || 0,
        }))}
      />
    </div>
  );
}
