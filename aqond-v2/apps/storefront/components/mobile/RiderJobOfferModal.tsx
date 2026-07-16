'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import {
  formatDistanceKm,
  formatEta,
  type EnrichedRiderJob,
} from '@/lib/riderJobGeo';

const DEFAULT_OFFER_SEC = 15;

type Props = {
  job: EnrichedRiderJob;
  /** Seconds before auto-dismiss (matches rider UX spec; backend rematch uses DISPATCH_ACCEPT_TIMEOUT_SEC) */
  countdownSec?: number;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onTimeout: () => void;
};

/**
 * Full-screen incoming job offer — one-handed, fat-finger friendly.
 * Replaces toast-only alerts for new dispatch offers.
 */
export function RiderJobOfferModal({
  job,
  countdownSec = DEFAULT_OFFER_SEC,
  busy,
  onAccept,
  onReject,
  onTimeout,
}: Props) {
  const [left, setLeft] = useState(countdownSec);
  const firedRef = useRef(false);

  useEffect(() => {
    setLeft(countdownSec);
    firedRef.current = false;
  }, [job.id, countdownSec]);

  useEffect(() => {
    if (left <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onTimeout();
      }
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onTimeout]);

  const urgent =
    job.job_type === 'passenger' ||
    (job.amount_micro != null && job.amount_micro >= 500_000) ||
    job.payment_method === 'cod';

  const pct = Math.round((left / countdownSec) * 100);

  return (
    <div className="tt-rider-offer-backdrop" role="dialog" aria-modal="true" aria-label="งานใหม่">
      <div className={`tt-rider-offer-modal${urgent ? ' tt-rider-offer-modal--urgent' : ''}`}>
        <div className="tt-rider-offer-timer" aria-live="polite">
          <svg viewBox="0 0 36 36" className="tt-rider-offer-timer-ring" aria-hidden>
            <path
              className="tt-rider-offer-timer-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="tt-rider-offer-timer-fill"
              strokeDasharray={`${pct}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="tt-rider-offer-timer-num">{left}</span>
        </div>

        <p className="tt-rider-offer-kicker">
          {urgent ? '⚡ งานด่วน' : '🛵 งานใหม่'}
        </p>
        <h2 className="tt-rider-offer-title">{job.merchant_name || 'จุดรับ'}</h2>
        {job.items_summary && <p className="tt-rider-offer-items">{job.items_summary}</p>}

        <div className="tt-rider-offer-route">
          <div className="tt-rider-offer-stop">
            <span className="tt-rider-offer-pin pickup">🍽️</span>
            <div>
              <strong>รับ</strong>
              <p>{job.merchant_name || job.merchant_id}</p>
            </div>
          </div>
          <div className="tt-rider-offer-stop">
            <span className="tt-rider-offer-pin dropoff">🏠</span>
            <div>
              <strong>ส่ง</strong>
              <p>{job.address || job.recipient_name || 'ลูกค้า'}</p>
            </div>
          </div>
        </div>

        <div className="tt-rider-offer-stats">
          <span>🛵 {formatDistanceKm(job.distance_km)}</span>
          <span>🏪 {formatEta(job.eta_pickup_min)}</span>
          <span>📦 {formatEta(job.eta_total_min)}</span>
        </div>

        <p className="tt-rider-offer-earn">
          รายได้โดยประมาณ{' '}
          <strong>{formatCatalogPrice(job.estimated_earning_micro || 0)}</strong>
          {job.payment_method && (
            <span className="tt-rider-offer-pay"> · {job.payment_method.toUpperCase()}</span>
          )}
        </p>

        <div className="tt-rider-offer-actions">
          <button
            type="button"
            className="tt-rider-offer-reject"
            disabled={busy}
            onClick={onReject}
          >
            ปฏิเสธ
          </button>
          <button
            type="button"
            className="tt-rider-offer-accept"
            disabled={busy}
            onClick={onAccept}
          >
            {busy ? 'กำลังรับ…' : 'รับงาน'}
          </button>
        </div>
      </div>
    </div>
  );
}
