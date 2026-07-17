'use client';

import { useEffect, useState } from 'react';
import type { RiderTrackingView } from '@/lib/server/riderTracking';
import { confirmFoodDelivery } from '@/lib/foodTracking';

type Props = {
  orderId: string;
  tracking: RiderTrackingView;
  onConfirmed: (t: RiderTrackingView) => void;
};

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function TtDeliveryConfirmPanel({ orderId, tracking, onConfirmed }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const autoAt = tracking.auto_confirm_at ? new Date(tracking.auto_confirm_at).getTime() : null;
  const msLeft = autoAt != null ? autoAt - now : null;

  useEffect(() => {
    if (!tracking.can_confirm || autoAt == null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [tracking.can_confirm, autoAt]);

  useEffect(() => {
    if (!tracking.can_confirm || msLeft == null || msLeft > 0) return;
    void (async () => {
      try {
        onConfirmed(await confirmFoodDelivery(orderId));
      } catch {
        /* parent poll / ws will refresh */
      }
    })();
  }, [tracking.can_confirm, msLeft, orderId, onConfirmed]);

  if (!tracking.can_confirm) return null;

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      onConfirmed(await confirmFoodDelivery(orderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-delivery-confirm">
      <h3>ยืนยันการรับออเดอร์</h3>
      <p className="tt-delivery-confirm-hint">
        ไรเดอร์ส่งอาหารแล้ว — กรุณาตรวจสอบและยืนยันเมื่อได้รับครบถ้วน
      </p>
      {msLeft != null && msLeft > 0 && (
        <p className="tt-delivery-confirm-timer" aria-live="polite">
          ยืนยันอัตโนมัติใน <strong>{formatCountdown(msLeft)}</strong>
        </p>
      )}
      {error && <p className="tt-hint tt-delivery-confirm-error">{error}</p>}
      <button type="button" className="tt-btn-primary" disabled={loading} onClick={() => void submit()}>
        {loading ? 'กำลังยืนยัน…' : '✓ ยืนยันรับอาหารแล้ว'}
      </button>
      <p className="tt-hint tt-delivery-confirm-issue">
        มีปัญหาก่อนยืนยัน? ใช้ปุ่ม &quot;แจ้งปัญหา&quot; ด้านล่างก่อนกดยืนยัน
      </p>
    </div>
  );
}
