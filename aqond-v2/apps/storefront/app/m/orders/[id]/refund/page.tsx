'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCartOwner } from '@/lib/cartOwner';
import { TtRefundStepper } from '@/components/mobile/TtRefundStepper';
import { IconLuxAqondStore, IconLuxChat, IconLuxDoc, IconLuxShield, IconLuxToShip } from '@/components/mobile/TtLuxuryIcons';
import { shopChatHref } from '@/lib/shopChat';
import { supportHref } from '@/lib/supportTicketClient';

type RefundItem = {
  title: string;
  qty: number;
  unit_price_micro: number;
  variation?: string;
  image_url?: string;
};

type RefundDetail = {
  refund_id: string;
  return_id: string;
  order_id: string;
  merchant_id?: string;
  state: string;
  state_label_th: string;
  banner_title_th: string;
  banner_desc_th: string;
  amount_thb: string;
  destination_label_th: string;
  destination_mask?: string;
  escrow_status: string;
  merchant_name?: string;
  items?: RefundItem[];
  timeline: Array<{
    id: string;
    label_th: string;
    date?: string;
    done: boolean;
    active: boolean;
    badge?: string;
  }>;
};

export default function RefundDetailPage() {
  const params = useParams();
  const orderId = String(params.id || '');
  const { ownerId } = useCartOwner();
  const searchParams = useSearchParams();
  const buyerId = searchParams.get('buyer_id') || ownerId || 'guest';

  const [refund, setRefund] = useState<RefundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(
      `/api/return/v1/orders/${encodeURIComponent(orderId)}/refund?buyer_id=${encodeURIComponent(buyerId)}`,
    )
      .then((r) => r.json())
      .then((body) => {
        if (!body.ok) throw new Error(body.error || 'load_failed');
        setRefund(body.refund);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'load_failed'))
      .finally(() => setLoading(false));
  }, [orderId, buyerId]);

  if (loading) {
    return (
      <div className="tt-rr-page">
        <p className="tt-loading tt-rating-loading">กำลังโหลดรายละเอียดการคืนเงิน…</p>
      </div>
    );
  }

  if (err || !refund) {
    return (
      <div className="tt-rr-page">
        <header className="tt-rr-header">
          <Link href="/m/orders?tab=returnrefund" className="tt-rr-back">
            ‹
          </Link>
          <h1>รายละเอียดการคืนเงิน</h1>
          <Link href="/m/home" className="tt-rr-home">
            หน้าหลัก
          </Link>
        </header>
        <div className="tt-rating-empty">
          <p>{err === 'refund_not_found' ? 'ยังไม่มีรายการคืนเงิน' : err}</p>
          <Link
            href={`/m/orders/${orderId}/return?buyer_id=${encodeURIComponent(buyerId)}`}
            className="tt-btn-primary"
          >
            ขอคืนเงิน
          </Link>
        </div>
      </div>
    );
  }

  const done = refund.state === 'completed';
  const processing =
    refund.state === 'processing' ||
    refund.state === 'escrow_held' ||
    refund.state === 'approved';
  const item = refund.items?.[0];
  const chatHref = refund.merchant_id
    ? shopChatHref(refund.merchant_id, { orderId })
    : '/m/chats';
  const supportLink = supportHref({
    channel: 'MKP',
    order_id: orderId,
    merchant_id: refund.merchant_id,
    subject: `คืนเงินออเดอร์ #${orderId.slice(-8)}`,
  });
  const shopHref = refund.merchant_id
    ? `/m/shop/${refund.merchant_id}`
    : `/m/orders/${orderId}?buyer_id=${encodeURIComponent(buyerId)}`;

  return (
    <div className="tt-rr-page">
      <header className="tt-rr-header">
        <Link href="/m/orders?tab=returnrefund" className="tt-rr-back">
          ‹
        </Link>
        <h1>รายละเอียดการคืนเงิน</h1>
        <Link href="/m/home" className="tt-rr-home">
          หน้าหลัก
        </Link>
      </header>

      <div
        className={`tt-rr-banner${done ? ' success' : ''}${processing && !done ? ' processing' : ''}`}
      >
        <h2>{refund.banner_title_th}</h2>
        <p>{refund.banner_desc_th}</p>
      </div>

      <section className="tt-rr-panel tt-rr-panel-amount">
        <p className="tt-rr-panel-label">รายละเอียดเงินคืน</p>
        <p className="tt-rr-amount">฿{refund.amount_thb}</p>
        <p className="tt-rr-dest">
          ไปยัง {refund.destination_mask || refund.destination_label_th}
        </p>
        <TtRefundStepper steps={refund.timeline} />
        <p className="tt-rr-note">
          AQOND ดำเนินการคืนเงินแล้ว คุณควรได้รับเงินภายใน 7 วันทำการ
          {refund.escrow_status === 'held' && ' · เงินถูกพักใน Escrow แล้ว'}
        </p>
      </section>

      <section className="tt-rr-panel">
        <Link href={shopHref} className="tt-rr-shop-row">
          <span className="tt-rr-shop-icon" aria-hidden>
            <IconLuxAqondStore size={20} />
          </span>
          {refund.merchant_name || 'ร้านค้า'}
          <span className="tt-rr-shop-chevron">›</span>
        </Link>
        {item && (
          <div className="tt-rr-product">
            <div className="tt-rr-thumb">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" />
              ) : (
                <span className="tt-rr-thumb-fallback" aria-hidden>
                  <IconLuxToShip size={28} />
                </span>
              )}
            </div>
            <div className="tt-rr-product-body">
              <p className="tt-rr-title">{item.title}</p>
              {item.variation && <p className="tt-rr-variation">{item.variation}</p>}
              <span className="tt-rr-qty">x{item.qty}</span>
            </div>
          </div>
        )}
      </section>

      <section className="tt-rr-panel tt-rr-services">
        <h3>บริการเพิ่มเติม</h3>
        <Link href={chatHref} className="tt-rr-service-row">
          <span className="tt-rr-service-icon" aria-hidden>
            <IconLuxChat size={20} />
          </span>
          ติดต่อผู้ขาย <em>›</em>
        </Link>
        <Link href={supportLink} className="tt-rr-service-row">
          <span className="tt-rr-service-icon" aria-hidden>
            <IconLuxShield size={20} />
          </span>
          Customer Service (MKP) <em>›</em>
        </Link>
        <Link href={supportLink} className="tt-rr-service-row">
          <span className="tt-rr-service-icon" aria-hidden>
            <IconLuxDoc size={20} />
          </span>
          ศูนย์ช่วยเหลือ <em>›</em>
        </Link>
      </section>
    </div>
  );
}
