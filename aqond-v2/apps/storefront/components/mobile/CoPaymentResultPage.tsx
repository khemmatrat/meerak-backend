'use client';

import Link from 'next/link';
import { formatPaymentAmount } from '@/lib/paymentQr';
import type { PaymentResultSession } from '@/lib/paymentQr';
import { CrossSellSplitWidget } from '@/components/growth/CrossSellSplitWidget';

type Props = {
  result: PaymentResultSession;
  onBack?: () => void;
};

const FAIL_COPY: Record<string, { title: string; sub: string }> = {
  expired: {
    title: 'ชำระเงินไม่สำเร็จ',
    sub: 'ขออภัย การชำระเงินหมดอายุแล้ว กรุณาสั่งซื้อใหม่หรือเลือกช่องทางชำระเงินอื่น',
  },
  wrong_type: {
    title: 'ชำระเงินไม่สำเร็จ',
    sub: 'ขออภัย ประเภทธุรกรรมไม่ถูกต้อง กรุณาตรวจสอบยอดเงินและชำระใหม่อีกครั้ง',
  },
  failed: {
    title: 'ชำระเงินไม่สำเร็จ',
    sub: 'ขออภัย การชำระเงินของคุณไม่สำเร็จ กรุณาเลือกช่องทางการชำระเงินช่องทางอื่น',
  },
};

export function CoPaymentResultPage({ result, onBack }: Props) {
  const isSuccess = result.status === 'success';
  const fail = FAIL_COPY[result.status] || FAIL_COPY.failed;
  const amountLabel = result.amount ? formatPaymentAmount(result.amount) : '';

  return (
    <div
      className="tt-co-pay-result"
      data-testid={`checkout-payment-result-${isSuccess ? 'success' : 'failed'}`}
    >
      <header className={`tt-co-pay-result-hero${isSuccess ? ' success' : ''}`}>
        {onBack && (
          <button type="button" className="tt-co-pay-result-back" onClick={onBack} aria-label="กลับ">
            ‹
          </button>
        )}
        <div className="tt-co-pay-result-icon">{isSuccess ? '✓' : '!'}</div>
        <h1 data-testid="checkout-payment-result-title">
          {isSuccess ? 'ชำระเงินสำเร็จแล้ว' : fail.title}
        </h1>
        <p data-testid="checkout-payment-result-message">
          {result.message || (isSuccess ? 'ระบบได้รับการชำระเงินของคุณแล้ว' : fail.sub)}
        </p>
        {amountLabel && (
          <p className="tt-co-pay-result-amount" data-testid="checkout-payment-result-amount">
            {amountLabel}
          </p>
        )}
        {result.ref && (
          <p className="tt-co-pay-result-ref" data-testid="checkout-payment-result-ref">
            Ref. {result.ref}
          </p>
        )}
        <div className="tt-co-pay-result-actions">
          <Link href="/m/home" className="tt-co-pay-result-btn outline" data-testid="checkout-payment-result-home-cta">
            ช้อปต่อ
          </Link>
          <Link
            href={isSuccess ? '/m/orders?tab=toship' : '/m/orders?tab=topay'}
            className="tt-co-pay-result-btn outline"
            data-testid="checkout-payment-result-orders-cta"
          >
            {isSuccess ? 'ดูคำสั่งซื้อ' : 'ชำระใหม่'}
          </Link>
        </div>
      </header>

      {isSuccess ? (
        <CrossSellSplitWidget amountPaid={amountLabel} />
      ) : null}

      <section className="tt-co-pay-result-vouchers">
        <div className="tt-co-pay-result-vouchers-head">
          <h2>โค้ดส่วนลด…สำหรับคุณ</h2>
          <span className="tt-co-pay-result-vouchers-more">ดูทั้งหมด ›</span>
        </div>

        <div className="tt-co-pay-result-ticket">
          <div className="tt-co-pay-result-ticket-left">
            <span className="tt-co-pay-result-ticket-limited">จำนวนจำกัด</span>
            <strong className="tt-co-pay-result-ticket-value">ส่งฟรี</strong>
            <span className="tt-co-pay-result-ticket-shop">ร้านโค้ดคุ้ม</span>
          </div>

          <div className="tt-co-pay-result-ticket-right">
            <div className="tt-co-pay-result-ticket-rules">
              <div className="tt-co-pay-result-ticket-rule">
                <span>ขั้นต่ำ</span>
                <strong>฿300</strong>
              </div>
              <div className="tt-co-pay-result-ticket-rule">
                <span>สูงสุด</span>
                <strong>฿300</strong>
              </div>
            </div>
            <p className="tt-co-pay-result-ticket-expire">
              <span aria-hidden>⏱</span>
              ใกล้หมดเขต · เหลือ <em>19</em> ชั่วโมง
            </p>
            <div className="tt-co-pay-result-ticket-foot">
              <button type="button" className="tt-co-pay-result-ticket-btn">
                ใช้โค้ด
              </button>
              <button type="button" className="tt-co-pay-result-ticket-terms">
                เงื่อนไข
              </button>
            </div>
          </div>
        </div>

        <div className="tt-co-pay-result-dots" aria-hidden>
          <span className="on" />
          <span />
          <span />
        </div>
      </section>

      <section className="tt-co-pay-result-promo">
        <div className="tt-co-pay-result-promo-glow" aria-hidden />
        <div className="tt-co-pay-result-promo-body">
          <div className="tt-co-pay-result-promo-copy">
            <div className="tt-co-pay-result-promo-badges">
              <span className="tt-co-pay-result-promo-badge">AQOND Pay</span>
              <span className="tt-co-pay-result-promo-badge soft">0% ผ่อน</span>
            </div>
            <strong>เปิดชำระเงินอัตโนมัติไว้อุ่นใจกว่า</strong>
            <p>ชำระครั้งถัดไปได้เร็วขึ้น · รับสิทธิ์ส่วนลดสมาชิก</p>
            <button type="button" className="tt-co-pay-result-promo-cta">
              เปิดใช้งาน
            </button>
          </div>
          <div className="tt-co-pay-result-promo-visual" aria-hidden>
            <div className="tt-co-pay-result-promo-wallet">
              <span>Pay</span>
            </div>
            <div className="tt-co-pay-result-promo-check">✓</div>
          </div>
        </div>
      </section>
    </div>
  );
}
