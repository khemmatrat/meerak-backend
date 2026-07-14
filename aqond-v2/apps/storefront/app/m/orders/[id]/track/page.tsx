'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice } from '@/lib/format';
import { FULFILLMENT_LABELS, fetchParcelTrack, submitProductReview } from '@/lib/merchant';
import { connectDispatchTrackWs } from '@/lib/dispatchTrackWs';
import type { RiderTrackingView } from '@/lib/server/riderTracking';
import { TtOrderReceiptCard } from '@/components/mobile/TtOrderReceiptCard';
import { TtRiderLiveMap } from '@/components/mobile/TtRiderLiveMap';
import { TtDisputeReportSheet } from '@/components/mobile/TtDisputeReportSheet';
import {
  IconLuxCompleted,
  IconLuxLabel,
  IconLuxPin,
  IconLuxRate,
  IconLuxRider,
  IconLuxShield,
  IconLuxToReceive,
  IconLuxTruckRoad,
} from '@/components/mobile/TtLuxuryIcons';
import { marketplaceItemImageUrl } from '@/lib/marketplaceVisual';

const TRACK_STEPS = [
  { key: 'label_generated', label: 'สร้างใบปะหน้า', Icon: IconLuxLabel },
  { key: 'in_transit', label: 'กำลังขนส่ง', Icon: IconLuxTruckRoad },
  { key: 'delivered', label: 'ส่งสำเร็จ', Icon: IconLuxCompleted },
];

export default function ParcelTrackPage() {
  const params = useParams();
  const orderId = String(params.id || '');
  const { auth } = useAuth();
  const owner = auth?.userId || 'guest';
  const [order, setOrder] = useState<any>(null);
  const [track, setTrack] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [riderTrack, setRiderTrack] = useState<RiderTrackingView | null>(null);

  const isOnDemandRider = order?.carrier_id === 'aqond-rider';

  useEffect(() => {
    fetch(`/api/orders?buyer_id=${encodeURIComponent(owner)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const hit = (d.orders || []).find((o: any) => (o.order_id || o.id) === orderId);
        setOrder(hit || null);
        const tn = hit?.tracking_no;
        if (tn) {
          return fetchParcelTrack(tn).then(setTrack).catch(() => setTrack(null));
        }
        return null;
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId, owner]);

  useEffect(() => {
    if (!isOnDemandRider) return;
    return connectDispatchTrackWs(orderId, setRiderTrack);
  }, [orderId, isOnDemandRider]);

  const fs = order?.fulfillment_status || track?.status || 'pending_ship';
  const trackingNo = order?.tracking_no || track?.tracking_no;
  const delivered = fs === 'delivered' || track?.status === 'delivered';
  const stepIdx = TRACK_STEPS.findIndex((s) => s.key === (track?.status || fs));
  const activeIdx = stepIdx >= 0 ? stepIdx : (delivered ? 4 : 1);

  const submitReview = async () => {
    const firstItem = order?.items?.[0];
    if (!firstItem?.product_id) return;
    setReviewError('');
    try {
      await submitProductReview({
        product_id: firstItem.product_id,
        merchant_id: order.merchant_id || 'demo-merchant',
        author_id: owner,
        order_id: orderId,
        rating,
        title: rating >= 4 ? 'ประทับใจ' : 'พอใช้ได้',
        body: reviewBody || 'สั่งผ่าน Aqond',
      });
      setReviewSent(true);
    } catch (e: any) {
      setReviewError(e.message || 'ส่งรีวิวไม่สำเร็จ');
    }
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/orders" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>ติดตามพัสดุ</span>
        </div>
      </header>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}

      {!loading && !order && (
        <div className="tt-empty-cart">
          <p className="tt-empty-sub">ไม่พบออเดอร์นี้</p>
          <Link href="/m/orders" className="tt-btn-primary">กลับคำสั่งซื้อ</Link>
        </div>
      )}

      {order && (
        <div className="tt-track-page">
          <div className="tt-track-hero">
            <p className="tt-track-hero-label">สถานะ</p>
            <p className="tt-track-hero-status">{FULFILLMENT_LABELS[fs] || track?.status || fs}</p>
            {trackingNo && (
              <p className="tt-hint tt-track-tracking-no">
                <span className="tt-track-tracking-icon" aria-hidden>
                  <IconLuxToReceive size={18} />
                </span>
                {trackingNo} {order.carrier_id && `· ${order.carrier_id}`}
              </p>
            )}
          </div>

          <div className="tt-od-policy-banner tt-track-policy">
            <span className="tt-od-policy-icon" aria-hidden>
              <IconLuxShield size={20} />
            </span>
            <div>
              <strong>เช็กก่อนจ่าย คืนได้ทันที</strong>
              <Link href="/m/help">ข้อมูลเพิ่มเติม</Link>
            </div>
          </div>

          <div className="tt-track-stepper-h">
            {[
              { label: 'เข้ารับพัสดุแล้ว', done: true },
              { label: 'กำลังขนส่ง', done: activeIdx >= 1 },
              { label: 'จัดส่งสำเร็จ', done: delivered },
            ].map((s) => (
              <div key={s.label} className={`tt-track-step-h${s.done ? ' done' : ''}`}>
                <span className="tt-track-step-dot" />
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <Link href={`/m/orders/${orderId}`} className="tt-track-order-detail-btn">
            รายละเอียดคำสั่งซื้อ
          </Link>

          {isOnDemandRider && riderTrack && (
            <div className="tt-rider-track-page" style={{ marginBottom: 16 }}>
              <p className="tt-hint tt-track-rider-hint">
                <span className="tt-track-rider-icon" aria-hidden>
                  <IconLuxRider size={18} />
                </span>
                ส่งโดยไรเดอร์ AQOND — {riderTrack.status_th}
              </p>
              <TtRiderLiveMap tracking={riderTrack} />
              <Link href={`/m/food/track/${orderId}`} className="tt-link-accent">
                ดูรายละเอียด / แชท / โทรไรเดอร์ →
              </Link>
            </div>
          )}

          {!isOnDemandRider && (
          <div className="tt-track-steps-lux">
            {TRACK_STEPS.map((step, i) => {
              const StepIcon = step.Icon;
              const done = i <= activeIdx;
              const active = i === activeIdx;
              const iconSize = step.key === 'in_transit' ? 36 : 28;
              return (
                <div
                  key={step.key}
                  className={`tt-track-step-lux${done ? ' done' : ''}${active ? ' active' : ''}`}
                >
                  <span className="tt-track-step-lux-icon" aria-hidden>
                    <StepIcon size={iconSize} />
                  </span>
                  <span className="tt-track-step-lux-label">{step.label}</span>
                </div>
              );
            })}
          </div>
          )}

          {Array.isArray(track?.events) && track.events.length > 0 && (
            <section className="tt-food-checkout-block">
              <h2 className="tt-track-events-title">
                <IconLuxPin size={18} /> ประวัติการขนส่ง
              </h2>
              <ul className="tt-track-events">
                {track.events.map((ev: any, idx: number) => (
                  <li key={`${ev.status}-${idx}`} className="tt-track-event">
                    <strong>{ev.status}</strong>
                    {ev.note && <span> — {ev.note}</span>}
                    {ev.created_at && <p className="tt-hint">{ev.created_at}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(order.items) && order.items.length > 0 && (
            <div className="tt-track-receipt-wrap">
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
              paymentMethod={order.method}
              compact
            />
            </div>
          )}

          {delivered && !reviewSent && (
            <div className="tt-review-box tt-review-box-lux">
              <div className="tt-review-box-head">
                <span className="tt-review-box-icon" aria-hidden>
                  <IconLuxRate size={22} />
                </span>
                <h3 className="tt-review-title">รีวิวสินค้า</h3>
              </div>
              <p className="tt-review-box-hint">ให้คะแนนประสบการณ์การสั่งซื้อครั้งนี้</p>
              <div className="tt-review-stars tt-review-stars-lux">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`tt-review-star-lux${n <= rating ? ' on' : ''}`}
                    onClick={() => setRating(n)}
                    aria-label={`${n} ดาว`}
                  >
                    <IconLuxRate size={n <= rating ? 26 : 22} />
                  </button>
                ))}
              </div>
              <textarea
                className="tt-review-input tt-review-input-lux"
                placeholder="เล่าประสบการณ์สั้นๆ (ไม่บังคับ)"
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                rows={3}
              />
              {reviewError && <p className="tt-error-inline">{reviewError}</p>}
              <button type="button" className="tt-btn-primary tt-review-submit-lux" onClick={() => void submitReview()}>
                ส่งรีวิว
              </button>
            </div>
          )}
          {reviewSent && <p className="tt-hint tt-review-thanks">ขอบคุณสำหรับรีวิว! 🎉</p>}

          <button type="button" className="tt-lux-dispute-btn" onClick={() => setDisputeOpen(true)}>
            <span className="tt-lux-dispute-icon" aria-hidden>
              <IconLuxShield size={22} />
            </span>
            <span className="tt-lux-dispute-copy">
              <strong>แจ้งปัญหา / ขอคืนสินค้า</strong>
              <em>ติดต่อร้านค้าและทีม AQOND ได้ทันที</em>
            </span>
            <span className="tt-lux-dispute-chevron">›</span>
          </button>
        </div>
      )}

      {order && (
        <TtDisputeReportSheet
          open={disputeOpen}
          onClose={() => setDisputeOpen(false)}
          orderId={orderId}
          merchantId={order.merchant_id || 'demo-merchant'}
          customerId={owner}
          orderType="marketplace"
          orderTotalMicro={order.amount_micro || order.total_micro || 0}
          items={(order.items || []).map((it: any, idx: number) => ({
            product_id: it.product_id || `item-${idx}`,
            title: it.title || it.product_id,
            qty: it.qty || 1,
            unit_price_micro: it.unit_price_micro || 0,
          }))}
        />
      )}
    </>
  );
}
