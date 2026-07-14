'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { connectDispatchTrackWs } from '@/lib/dispatchTrackWs';
import type { RiderTrackingView } from '@/lib/server/riderTracking';
import { TtRiderLiveMap } from '@/components/mobile/TtRiderLiveMap';
import { TtDeliveryTimeline } from '@/components/mobile/TtDeliveryTimeline';
import { TtRiderProfileCard } from '@/components/mobile/TtRiderProfileCard';
import { TtDeliveryReviewPanel } from '@/components/mobile/TtDeliveryReviewPanel';
import { TtRiderChatSheet } from '@/components/mobile/TtRiderChatSheet';
import { TtOrderReceiptCard } from '@/components/mobile/TtOrderReceiptCard';
import { TtDeliveryEtaHero } from '@/components/mobile/TtDeliveryEtaHero';
import { TtDisputeReportSheet } from '@/components/mobile/TtDisputeReportSheet';

const HANDOFF_PHASES = new Set([
  'arrived', 'rider_calling', 'photo_proof', 'handoff', 'cod_payment', 'rider_completed',
]);

export default function FoodRiderTrackPage() {
  const params = useParams();
  const orderId = String(params.orderId || '');
  const { auth } = useAuth();
  const owner = auth?.userId || 'guest';
  const [tracking, setTracking] = useState<RiderTrackingView | null>(null);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [callHint, setCallHint] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);

  const [wsLive, setWsLive] = useState(false);

  const callRider = () => {
    const phone = tracking?.rider.phone?.replace(/[^\d+]/g, '');
    if (!phone) return;
    setCallHint(`กำลังโทรหา ${tracking?.rider.name}…`);
    window.setTimeout(() => setCallHint(''), 2500);
    window.location.href = `tel:${phone}`;
  };

  useEffect(() => {
    let alive = true;

    const apply = (data: RiderTrackingView) => {
      if (!alive) return;
      setTracking(data);
      setError('');
    };

    const disconnect = connectDispatchTrackWs(
      orderId,
      apply,
      () => {
        if (alive) setWsLive(false);
      },
    );
    setWsLive(true);

    return () => {
      alive = false;
      disconnect();
    };
  }, [orderId]);

  const showPhoto =
    tracking &&
    ['photo_proof', 'handoff', 'cod_payment', 'rider_completed', 'review_pending', 'completed'].includes(
      tracking.phase,
    );

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/orders" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>ติดตามไรเดอร์</span>
        </div>
      </header>

      {error && (
        <div className="tt-empty-cart">
          <p>{error}</p>
          <Link href="/m/orders" className="tt-btn-primary">ดูคำสั่งซื้อ</Link>
        </div>
      )}

      {tracking && (
        <div className="tt-rider-track-page">
          <TtDeliveryEtaHero tracking={tracking} />

          {tracking.timeline && <TtDeliveryTimeline steps={tracking.timeline} />}

          <TtRiderLiveMap tracking={tracking} />

          <TtOrderReceiptCard
            orderId={orderId}
            merchantName={tracking.merchant_name}
            items={tracking.order_items || []}
            itemCount={tracking.item_count || tracking.order_items?.length || 0}
            totalMicro={tracking.amount_micro}
            paymentMethod={tracking.payment_method}
          />

          <TtRiderProfileCard
            rider={tracking.rider}
            tracking={tracking}
            onChat={() => setChatOpen(true)}
            onCall={callRider}
          />

          {callHint && <p className="tt-chat-calling inline">{callHint}</p>}

          {HANDOFF_PHASES.has(tracking.phase) && (
            <div className="tt-handoff-events">
              {tracking.phase === 'rider_calling' && (
                <p className="tt-handoff-event">📞 ไรเดอร์กำลังโทรหาคุณ</p>
              )}
              {showPhoto && (
                <div className="tt-delivery-photo">
                  <p className="tt-delivery-photo-label">📷 รูปส่งมอบ</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tracking.delivery_photo_url} alt="หลักฐานการส่ง" />
                </div>
              )}
              {tracking.phase === 'handoff' && (
                <p className="tt-handoff-event">🤝 ส่งมอบตามนัดหมาย</p>
              )}
              {tracking.phase === 'cod_payment' && (
                <p className="tt-handoff-event cod">💵 ชำระเงินสดให้ไรเดอร์เรียบร้อย</p>
              )}
              {tracking.payment_method !== 'cod' && tracking.phase === 'rider_completed' && (
                <p className="tt-handoff-event">✓ ชำระออนไลน์แล้ว — ส่งมอบเรียบร้อย</p>
              )}
            </div>
          )}

          <TtDeliveryReviewPanel
            orderId={orderId}
            tracking={tracking}
            onSubmitted={setTracking}
          />

          {tracking.phase === 'completed' && tracking.points_earned != null && (
            <div className="tt-delivery-thanks">
              <span className="tt-delivery-thanks-icon">🎉</span>
              <h2>ขอบคุณที่อุดหนุน</h2>
              <p className="tt-points-earned">
                คุณได้ <strong>{tracking.points_earned} คะแนน</strong>
              </p>
              <p className="tt-points-hint">ใช้เป็นส่วนลดการสั่งซื้อรอบหน้า</p>
              {tracking.review && (
                <p className="tt-thanks-review">
                  รีวิว {tracking.review.stars} ดาว
                  {tracking.review.tip_micro > 0 && ` · ทิป ฿${(tracking.review.tip_micro / 100).toFixed(0)}`}
                </p>
              )}
              <Link href="/m/food" className="tt-btn-primary">สั่งอีกครั้ง</Link>
            </div>
          )}

          {!tracking.delivered && tracking.phase !== 'review_pending' && tracking.phase !== 'completed' && (
            <p className="tt-rider-poll-hint">
              {wsLive ? '🔴 อัปเดตแบบเรียลไทม์ (WebSocket)' : 'กำลังเชื่อมต่อ…'}
            </p>
          )}

          <button type="button" className="tt-btn-ghost tt-order-dispute-btn" onClick={() => setDisputeOpen(true)}>
            🛡️ แจ้งปัญหา (ยกเลิก / ของไม่ครบ)
          </button>

          <TtRiderChatSheet
            orderId={orderId}
            open={chatOpen}
            messages={tracking.chat_messages}
            riderName={tracking.rider.name}
            riderPhone={tracking.rider.phone}
            onClose={() => setChatOpen(false)}
            onUpdate={setTracking}
          />
        </div>
      )}

      {tracking && (
        <TtDisputeReportSheet
          open={disputeOpen}
          onClose={() => setDisputeOpen(false)}
          orderId={orderId}
          merchantId={tracking.merchant_id}
          customerId={owner}
          orderType="food"
          orderTotalMicro={tracking.cod_due_micro || 0}
          items={(tracking.order_items || []).map((it) => ({
            product_id: it.item_id,
            title: it.title,
            qty: it.qty,
            unit_price_micro: it.unit_price_micro,
          }))}
        />
      )}
    </>
  );
}
