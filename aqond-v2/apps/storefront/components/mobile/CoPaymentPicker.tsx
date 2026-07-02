'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { PAYMENT_METHODS, type PaymentMethodId } from '@/lib/payment';
import { formatCatalogPrice } from '@/lib/format';

type Props = {
  open: boolean;
  value: PaymentMethodId;
  orderTotalMicro: number;
  onClose: () => void;
  onConfirm: (id: PaymentMethodId) => void;
};

const INSTALLMENTS = [
  { id: 'bnpl', label: 'ช้อปก่อนจ่ายทีหลัง', per: 1 },
  { id: 'i2', label: 'ผ่อนชำระ 2 เดือน', per: 2 },
  { id: 'i3', label: 'ผ่อนชำระ 3 เดือน', per: 3 },
  { id: 'i5', label: 'ผ่อนชำระ 5 เดือน', per: 5 },
];

function installmentPrice(totalMicro: number, months: number) {
  const thb = totalMicro / 1_000_000;
  const per = months <= 1 ? thb : thb / months;
  return formatCatalogPrice(Math.round(per * 1_000_000));
}

export function CoPaymentPicker({ open, value, orderTotalMicro, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<PaymentMethodId>(value);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open || !mounted) return null;

  const mainMethods = PAYMENT_METHODS.filter((m) =>
    ['promptpay', 'cod', 'bank_transfer', 'card'].includes(m.id),
  );

  const sheet = (
    <div className="tt-co-pay-page" data-testid="checkout-payment-picker">
      <header className="tt-co-pay-header">
        <button type="button" className="tt-co-pay-back" onClick={onClose} aria-label="กลับ">
          ‹
        </button>
        <h1>ช่องทางการชำระเงิน</h1>
      </header>

      <div className="tt-co-pay-body">
        <section className="tt-co-pay-block">
          {INSTALLMENTS.map((row) => (
            <div key={row.id} className="tt-co-pay-install">
              <div>
                <strong>{row.label}</strong>
                <p>
                  <span className="tt-co-pay-badge">ลดเพิ่ม 90%</span> ดอกเบี้ย 0%
                </p>
              </div>
              <strong className="tt-co-pay-install-price">
                {installmentPrice(orderTotalMicro, row.per)}
                {row.per > 1 ? '/เดือน' : ''}
              </strong>
            </div>
          ))}
        </section>

        <section className="tt-co-pay-block">
          <div className="tt-co-pay-wallet">
            <span>🟠</span>
            <div>
              <strong>ยอดเงิน AQOND Pay</strong>
              <p>เปิดใช้งานเพื่อชำระเร็วขึ้น</p>
            </div>
            <button type="button" className="tt-co-pay-activate">
              เปิดใช้งาน
            </button>
          </div>
          <div className="tt-co-pay-wallet tt-co-pay-wallet--muted">
            <span>🏦</span>
            <div>
              <strong>ตัดบัญชีธนาคาร</strong>
              <p>+ ผูกบัญชีธนาคาร SCB · KBANK · +7</p>
            </div>
          </div>
          <button type="button" className="tt-co-pay-expand">
            <span>💳</span>
            <span>บัตรเครดิต/บัตรเดบิต</span>
            <span className="tt-co-pay-chevron">▾</span>
          </button>
        </section>

        <section className="tt-co-pay-block">
          <p className="tt-co-pay-block-title">ช่องทางการชำระเงินอื่น</p>
          {mainMethods.map((m) => {
            const active = draft === m.id;
            const label =
              m.id === 'promptpay'
                ? 'QR พร้อมเพย์'
                : m.id === 'cod'
                  ? 'เก็บเงินปลายทาง'
                  : m.id === 'bank_transfer'
                    ? 'Mobile Banking'
                    : m.title;
            return (
              <button
                key={m.id}
                type="button"
                className={`tt-co-pay-option${active ? ' active' : ''}`}
                onClick={() => setDraft(m.id)}
              >
                <span className="tt-co-pay-option-icon">{m.icon}</span>
                <span className="tt-co-pay-option-label">{label}</span>
                <span className={`tt-co-pay-radio${active ? ' on' : ''}`} aria-hidden />
              </button>
            );
          })}
          <button type="button" className="tt-co-pay-expand">
            <span>⭐</span>
            <span>คะแนนบัตรเครดิต</span>
            <span className="tt-co-pay-chevron">▾</span>
          </button>
        </section>
      </div>

      <footer className="tt-co-pay-footer">
        <button type="button" className="tt-co-pay-confirm" onClick={() => onConfirm(draft)}>
          ยืนยัน
        </button>
      </footer>
    </div>
  );

  return createPortal(sheet, document.body);
}
