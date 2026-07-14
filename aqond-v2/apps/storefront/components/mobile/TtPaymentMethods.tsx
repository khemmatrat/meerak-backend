'use client';

import { PAYMENT_METHODS, type PaymentMethodId } from '@/lib/payment';

type Props = {
  value: PaymentMethodId;
  onChange: (id: PaymentMethodId) => void;
  title?: string;
};

export function TtPaymentMethods({ value, onChange, title = 'ชำระเงิน' }: Props) {
  return (
    <section className="tt-checkout-section">
      <h2 className="tt-checkout-h">{title}</h2>
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`tt-pay-option${value === m.id ? ' tt-pay-active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          <span className="tt-pay-icon">{m.icon}</span>
          <div className="tt-pay-body">
            <strong>
              {m.title}
              {m.badge && <span className="tt-pay-badge">{m.badge}</span>}
            </strong>
            <p>{m.sub}</p>
          </div>
        </button>
      ))}
    </section>
  );
}
