'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaymentAction } from '@/lib/checkout';
import {
  formatPaymentAmount,
  formatPaymentExpiry,
  paymentQrImageUrl,
} from '@/lib/paymentQr';

type Props = {
  action: PaymentAction;
  expiresAt: number;
  onConfirm: () => void | Promise<void>;
  onExpired: () => void;
  onBack?: () => void;
  confirming?: boolean;
};

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function useCountdown(expiresAt: number) {
  const [left, setLeft] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, expiresAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const totalSec = Math.floor(left / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return { hours, mins, secs, expired: left <= 0 };
}

export function CoQrPaymentPage({
  action,
  expiresAt,
  onConfirm,
  onExpired,
  onBack,
  confirming = false,
}: Props) {
  const { hours, mins, secs, expired } = useCountdown(expiresAt);
  const qrUrl = paymentQrImageUrl(action);
  const amountLabel = formatPaymentAmount(action.amount);

  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  const saveQr = useCallback(async () => {
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aqond-qr-${action.ref}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(qrUrl, '_blank', 'noopener,noreferrer');
    }
  }, [action.ref, qrUrl]);

  return (
    <div className="tt-co-qr" data-testid="checkout-payment-page">
      <header className="tt-co-qr-header">
        <button
          type="button"
          className="tt-co-qr-back"
          onClick={onBack || (() => void onConfirm())}
          aria-label="กลับ"
        >
          ‹
        </button>
        <h1>ข้อมูลการชำระเงิน</h1>
      </header>

      <main className="tt-co-qr-main">
        <div className="tt-co-qr-total" data-testid="checkout-payment-amount">
          <span>ยอดชำระเงินทั้งหมด</span>
          <strong>{amountLabel}</strong>
        </div>

        <div className="tt-co-qr-deadline" data-testid="checkout-payment-timer-wrap">
          <p>
            กรุณาชำระภายใน{' '}
            <span className="tt-co-qr-timer" data-testid="checkout-payment-timer">
              {pad2(hours)} : {pad2(mins)} : {pad2(secs)}
            </span>
          </p>
          <p className="tt-co-qr-expires">หมดเวลา {formatPaymentExpiry(expiresAt)}</p>
        </div>

        <div className="tt-co-qr-card">
          <div className="tt-co-qr-card-banner">
            <span className="tt-co-qr-thai">THAI QR</span>
            <span className="tt-co-qr-payment">PAYMENT</span>
          </div>
          <div className="tt-co-qr-img-wrap">
            <img
              className="tt-co-qr-img"
              data-testid="checkout-payment-qr"
              src={qrUrl}
              alt="QR PromptPay"
              width={280}
              height={280}
            />
          </div>
          <p className="tt-co-qr-amount">{amountLabel}</p>
          <p className="tt-co-qr-merchant">บริษัท เอคอนด์ (ประเทศไทย) จำกัด</p>
          <p className="tt-co-qr-merchant-en">AQOND PAY (THAILAND) CO., LTD</p>
          <p className="tt-co-qr-ref" data-testid="checkout-payment-ref">
            Reference no. {action.ref}
          </p>
        </div>

        <section className="tt-co-qr-steps">
          <h2>กรุณาทำตามขั้นตอนที่แนะนำ</h2>
          <ol>
            <li>คลิกปุ่ม &quot;บันทึก QR&quot; หรือแคปหน้าจอ</li>
            <li>เปิดแอปพลิเคชันธนาคารบนอุปกรณ์ของท่าน</li>
            <li>เลือกสแกน QR / พร้อมเพย์ แล้วสแกนรหัสด้านบน</li>
            <li>ตรวจสอบยอดเงินและกดยืนยันการชำระ</li>
            <li>กลับมากดปุ่ม &quot;ตกลง&quot; หลังชำระเสร็จ</li>
          </ol>
          {action.hint && <p className="tt-co-qr-hint">{action.hint}</p>}
        </section>
      </main>

      <footer className="tt-co-qr-footer">
        <button
          type="button"
          className="tt-co-qr-save"
          data-testid="checkout-payment-save-qr"
          onClick={() => void saveQr()}
        >
          บันทึก QR
        </button>
        <button
          type="button"
          className="tt-co-qr-ok"
          data-testid="checkout-payment-confirm"
          disabled={confirming || expired}
          onClick={() => void onConfirm()}
        >
          {confirming ? 'กำลังตรวจสอบ...' : expired ? 'หมดเวลาแล้ว' : 'ตกลง'}
        </button>
      </footer>
    </div>
  );
}
