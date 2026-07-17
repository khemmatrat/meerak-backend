'use client';

import { paymentMethodLabel, type PaymentMethodId } from '@/lib/payment';
import type { RiderTrackingView } from '@/lib/server/riderTracking';

const PHASE_ICON: Record<string, string> = {
  merchant_pending: '⏳',
  merchant_accepted: '✅',
  merchant_preparing: '👨‍🍳',
  finding_rider: '🔍',
  rider_assigned: '🛵',
  food_ready: '🍱',
  rider_picked_up: '📦',
  en_route: '🛣️',
  approaching: '📍',
  arrived: '🏠',
  rider_calling: '📞',
  photo_proof: '📷',
  handoff: '🤝',
  cod_payment: '💵',
  rider_completed: '✓',
  awaiting_customer_confirm: '📋',
  review_pending: '⭐',
  completed: '🎉',
};

type Props = {
  tracking: RiderTrackingView;
};

export function TtDeliveryEtaHero({ tracking }: Props) {
  const done =
    tracking.phase === 'completed' ||
    tracking.phase === 'review_pending' ||
    tracking.phase === 'awaiting_customer_confirm';
  const showMins =
    !done &&
    tracking.minutes_left > 0 &&
    !['merchant_pending', 'merchant_accepted', 'finding_rider'].includes(tracking.phase);

  const icon = PHASE_ICON[tracking.phase] || '🛵';
  const progressPct = Math.round(tracking.progress * 100);

  return (
    <section className="tt-eta-hero" aria-live="polite">
      <div className="tt-eta-hero-bg" aria-hidden />
      <div className="tt-eta-hero-inner">
        <div className="tt-eta-hero-left">
          {showMins ? (
            <div className="tt-eta-ring" style={{ '--p': `${progressPct}%` } as React.CSSProperties}>
              <div className="tt-eta-count">
                <span className="tt-eta-num">{tracking.minutes_left}</span>
                <span className="tt-eta-unit">นาที</span>
              </div>
            </div>
          ) : (
            <div className={`tt-eta-icon-badge${done ? ' done' : ''}`}>{icon}</div>
          )}
        </div>

        <div className="tt-eta-hero-body">
          <p className="tt-eta-hero-label">ถึงคุณโดยประมาณ</p>
          <h2 className="tt-eta-hero-status">{tracking.status_th}</h2>
          {tracking.status_detail && (
            <p className="tt-eta-hero-detail">{tracking.status_detail}</p>
          )}
          {!done && tracking.eta_label && (
            <p className="tt-eta-hero-range">ช่วงเวลา {tracking.eta_label}</p>
          )}
          <div className="tt-eta-hero-chips">
            {tracking.payment_method && (
              <span className="tt-eta-chip pay">
                {paymentMethodLabel(tracking.payment_method as PaymentMethodId)}
              </span>
            )}
            {tracking.show_rider_profile && (
              <span className="tt-eta-chip rider">{tracking.rider.name}</span>
            )}
          </div>
        </div>
      </div>

      {tracking.handoff_note && (
        <p className="tt-eta-handoff">วิธีรับ: {tracking.handoff_note}</p>
      )}
    </section>
  );
}
