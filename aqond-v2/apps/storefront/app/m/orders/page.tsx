'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useCartOwner } from '@/lib/cartOwner';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/payment';
import { FULFILLMENT_LABELS } from '@/lib/merchant';
import { reorderOrder } from '@/lib/orders';
import { useRouter } from 'next/navigation';
import { TtOrderReceiptCard } from '@/components/mobile/TtOrderReceiptCard';
import { TtDisputeReportSheet } from '@/components/mobile/TtDisputeReportSheet';
import { TtReceiptPdfModal } from '@/components/mobile/TtReceiptPdfModal';
import { MpPurchasesSection } from '@/components/mobile/MpPurchasesSection';
import { TtReturnRefundCard } from '@/components/mobile/TtReturnRefundCard';
import { IconLuxCart, IconLuxPin, IconLuxReturn, IconLuxShield, IconLuxToShip, IconLuxTruckRoad } from '@/components/mobile/TtLuxuryIcons';
import { marketplaceItemImageUrl } from '@/lib/marketplaceVisual';
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
  if (
    raw === 'topay' ||
    raw === 'toship' ||
    raw === 'toreceive' ||
    raw === 'completed' ||
    raw === 'returnrefund' ||
    raw === 'torate'
  ) {
    return raw;
  }
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
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [returnRows, setReturnRows] = useState<any[]>([]);
  const [returnCount, setReturnCount] = useState(0);
  const [returnLoading, setReturnLoading] = useState(false);
  const [rateCount, setRateCount] = useState(0);

  const loadReturns = (seed = false) => {
    setReturnLoading(true);
    const qs = new URLSearchParams({ buyer_id: owner });
    if (seed) qs.set('seed_if_empty', '1');
    return fetch(`/api/return/v1/buyer/returns?${qs}`)
      .then((r) => r.json())
      .then((body) => {
        setReturnRows(body.returns || []);
        setReturnCount(body.count || 0);
      })
      .catch(() => {
        setReturnRows([]);
        setReturnCount(0);
      })
      .finally(() => setReturnLoading(false));
  };

  useEffect(() => {
    if (!ownerReady && !auth?.userId) return;
    fetch(`/api/orders?buyer_id=${encodeURIComponent(owner)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ orders: [] }))
      .finally(() => setLoading(false));
    void loadReturns(true);
    fetch(`/api/reviews/pending?buyer_id=${encodeURIComponent(owner)}&seed_if_empty=1`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((body) => setRateCount(body.count || 0))
      .catch(() => setRateCount(0));
  }, [owner, ownerReady, auth?.userId]);

  useEffect(() => {
    if (tab === 'torate') router.replace('/m/orders/ratings');
  }, [tab, router]);

  useEffect(() => {
    if (tab === 'returnrefund') void loadReturns(true);
  }, [tab, owner]);

  const orders = data?.orders || [];
  const counts = useMemo(
    () => ({ ...countOrdersByTab(orders), returnrefund: returnCount, torate: rateCount }),
    [orders, returnCount, rateCount],
  );
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
          <IconLuxCart size={22} />
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
        <span className="tt-mp-order-active-icon" aria-hidden>
          <IconLuxTruckRoad size={54} />
        </span>
        <span className="tt-mp-order-active-text">ติดตามออเดอร์ที่กำลังส่ง</span>
        <strong>ดูทั้งหมด</strong>
      </Link>

      {loading && <p className="tt-loading">กำลังโหลด...</p>}
      {actionMsg && <p className="tt-hint tt-order-action-msg">{actionMsg}</p>}

      {!loading && tab !== 'all' && tabLabel && (
        <div className="tt-mp-orders-tab-chip">
          <span>{tabLabel}</span>
          <em>{tab === 'returnrefund' ? returnCount : filtered.length}</em>
        </div>
      )}

      {!loading && tab === 'returnrefund' && returnLoading && (
        <p className="tt-loading">กำลังโหลดรายการคืนเงิน…</p>
      )}

      {!loading && tab === 'returnrefund' && !returnLoading && returnRows.length === 0 && (
        <div className="tt-empty-cart">
          <div className="tt-empty-icon tt-empty-icon-lux">
            <IconLuxReturn size={56} />
          </div>
          <h1 className="tt-empty-title">ยังไม่มีรายการคืนเงิน/คืนสินค้า</h1>
          <p className="tt-empty-sub">เมื่อขอคืนเงิน รายการจะแสดงที่นี่</p>
        </div>
      )}

      {tab === 'returnrefund' && (
        <div className="tt-rr-list">
          {returnRows.map((row) => (
            <TtReturnRefundCard
              key={row.return_id}
              returnId={row.return_id}
              orderId={row.order_id}
              buyerId={owner}
              merchantName={row.merchant_name}
              statusLabel={row.refund_state_label_th || row.state_label_th}
              refundAmountThb={row.amount_thb}
              purchaseAmountThb={row.purchase_amount_thb}
              items={row.items}
            />
          ))}
        </div>
      )}

      {!loading && tab !== 'returnrefund' && filtered.length === 0 && (
        <div className="tt-empty-cart">
          <div className="tt-empty-icon tt-empty-icon-lux">
            <IconLuxToShip size={56} />
          </div>
          <h1 className="tt-empty-title">ยังไม่มีคำสั่งซื้อในหมวดนี้</h1>
          <p className="tt-empty-sub">สั่งซื้อครั้งแรกแล้วติดตามสถานะได้ที่นี่</p>
          <Link href="/m/home" className="tt-btn-primary">
            เริ่มช้อป
          </Link>
        </div>
      )}

      <div className="tt-order-list">
        {tab !== 'returnrefund' && filtered.map((o: any) => {
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
                    image_url: marketplaceItemImageUrl(it.product_id, it.title, String(oid), it.image_url),
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
                  <span className="tt-order-delivery-pin" aria-hidden>
                    <IconLuxPin size={20} />
                  </span>
                  <div className="tt-order-delivery-content">
                  <p className="tt-order-delivery-label">ส่งมอบให้</p>
                  <div className="tt-order-delivery-body">
                    {o.recipient && <p className="tt-order-delivery-name">{o.recipient}</p>}
                    {o.shipping_address && <p className="tt-order-delivery-addr">{o.shipping_address}</p>}
                    {o.phone && <p className="tt-order-delivery-phone">{o.phone}</p>}
                  </div>
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
                <button
                  type="button"
                  className="tt-btn-ghost tt-order-action-btn"
                  onClick={() => setReceiptOrderId(String(oid))}
                >
                  ใบเสร็จ PDF
                </button>
              </div>
              {!isFood && (status === 'paid' || status === 'completed' || fs === 'delivered') && (
                <>
                  <Link
                    href={`/m/orders/${oid}?buyer_id=${encodeURIComponent(owner)}`}
                    className="tt-btn-ghost tt-order-action-btn"
                    style={{ display: 'block', textAlign: 'center', marginTop: 8 }}
                  >
                    รายละเอียดคำสั่งซื้อ
                  </Link>
                  <Link
                    href={`/m/orders/${oid}/return?buyer_id=${encodeURIComponent(owner)}`}
                    className="tt-btn-ghost tt-order-action-btn"
                    style={{ display: 'block', textAlign: 'center', marginTop: 8 }}
                  >
                    ขอคืนเงิน
                  </Link>
                </>
              )}
              <button
                type="button"
                className="tt-btn-ghost tt-order-dispute-btn tt-order-dispute-btn-lux"
                onClick={() => setDisputeOrder(o)}
              >
                <span className="tt-order-dispute-icon" aria-hidden>
                  <IconLuxShield size={18} />
                </span>
                แจ้งปัญหา
              </button>
              </div>
            </article>
          );
        })}
      </div>

      <TtReceiptPdfModal
        open={!!receiptOrderId}
        onClose={() => setReceiptOrderId(null)}
        orderId={receiptOrderId || ''}
        buyerId={owner}
      />

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
